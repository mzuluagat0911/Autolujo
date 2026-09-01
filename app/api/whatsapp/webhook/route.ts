import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { sendText, downloadMedia } from "@/lib/whatsapp/client";
import { leerComprobante } from "@/lib/ai/comprobante";
import {
  obtenerConversacion,
  registrarMensaje,
  procesarPagoComprobante,
  reclamarMensajeEntrante,
  completarMensaje,
  historialReciente,
  marcarEscalada,
  marcarNecesitaHumano,
  resumenContrato,
  type Conversacion,
} from "@/lib/cartera/pipeline";
import { responderAgente } from "@/lib/ai/agente";
import { transcribirAudio } from "@/lib/ai/transcribir";
import { estadoCuentaContrato, money } from "@/lib/cartera/estado-cuenta";

type Conv = Conversacion;

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// GET — verificación del webhook (handshake de Meta).
// Meta llama con hub.mode, hub.verify_token y hub.challenge.
// ---------------------------------------------------------------------------
export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — recepción de eventos (mensajes entrantes).
// Verifica la firma HMAC con el App Secret, luego procesa.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verificarFirma(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Meta reintenta si no recibe 200 rápido: procesamos con try/catch y siempre 200.
  try {
    await procesar(payload);
  } catch (e) {
    console.error("[whatsapp/webhook] error procesando:", e);
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function verificarFirma(raw: string, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // sin secret configurado, no bloqueamos (dev)
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function procesar(payload: WebhookPayload) {
  const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (!Array.isArray(messages)) return; // estados de entrega, etc. — ignorar por ahora

  for (const msg of messages) {
    if (!msg.from) continue;
    try {
      await manejarMensaje(msg);
    } catch (e) {
      console.error("[whatsapp/webhook] error en mensaje:", e);
    }
  }
}

// Responde y deja registrado el mensaje saliente en la conversación.
// Si el envío falla, deja el ERROR guardado en la conversación para diagnóstico.
async function responder(conversacionId: string, from: string, texto: string, pagoId?: string) {
  try {
    await sendText(from, texto);
    await registrarMensaje({ conversacionId, direccion: "out", texto, pagoId: pagoId ?? null });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("[whatsapp/webhook] sendText falló:", err);
    await registrarMensaje({
      conversacionId, direccion: "out", tipo: "system",
      texto: `⚠️ ENVÍO FALLÓ: ${err}`,
    });
  }
}

async function manejarMensaje(msg: WhatsAppMessage) {
  const from = msg.from as string;
  const conv = await obtenerConversacion(from);

  const tipo = tipoMensaje(msg);
  const texto =
    tipo === "text" ? msg.text?.body ?? "" :
    tipo === "image" ? "📷 Comprobante" :
    tipo === "audio" ? "🎤 Nota de voz" : `[${msg.type ?? "mensaje"}]`;

  // Candado de idempotencia: reclama el mensaje ANTES de trabajo pesado.
  // Si Meta reintenta, el segundo choca con el unique y sale sin reprocesar.
  const mensajeId = await reclamarMensajeEntrante({
    conversacionId: conv.id, waMessageId: msg.id,
    tipo: tipo === "image" ? "image" : "text", texto,
  });
  if (!mensajeId) return; // duplicado (reintento de Meta)

  // Si una persona del equipo tomó el chat, el agente NO responde.
  // Solo marcamos que hay un mensaje nuevo esperando respuesta.
  if (conv.modo === "humano") {
    await marcarNecesitaHumano(conv.id);
    return;
  }

  if (tipo === "text") {
    await responderConAgente(conv, from);
  } else if (tipo === "image") {
    await procesarComprobante(conv, from, msg, mensajeId);
  } else if (tipo === "audio") {
    await procesarAudio(conv, from, msg, mensajeId);
  } else {
    await responder(conv.id, from, "¡Gracias por escribir! En un momento te respondo por aquí 🙌");
  }
}

function tipoMensaje(msg: WhatsAppMessage): "text" | "image" | "audio" | "otro" {
  if (msg.type === "text" || msg.text?.body) return "text";
  if (msg.type === "image" || msg.image?.id) return "image";
  // Cloud API: notas de voz = type "audio". A veces llega voice/ptt.
  if (msg.type === "audio" || msg.type === "voice" || msg.type === "ptt" || msg.audio?.id) {
    return "audio";
  }
  return "otro";
}

// El agente conversa; si el caso lo amerita, escala a una persona del equipo.
async function responderConAgente(conv: Conv, from: string, extraTurno?: { direccion: "in" | "out"; texto: string }) {
  try {
    const historial = await historialReciente(conv.id, 10);
    if (extraTurno) {
      const last = historial[historial.length - 1];
      if (last?.direccion === "in" && /nota de voz/i.test(last.texto)) {
        last.texto = extraTurno.texto;
      } else {
        historial.push(extraTurno);
      }
    }
    // Contexto con cifras REALES si la conversación está vinculada a un contrato.
    let contexto = conv.etiqueta ? `El cliente está vinculado al ${conv.etiqueta}.` : undefined;
    if (conv.contrato_id) {
      const resumen = await resumenContrato(conv.contrato_id);
      if (resumen) contexto = resumen;
    }
    const r = await responderAgente({ historial, contexto });
    if (r.pasar_a_humano) await marcarEscalada(conv.id, r.motivo ?? null);
    await responder(conv.id, from, r.mensaje);
  } catch (e) {
    console.error("[whatsapp/webhook] agente falló:", e);
    await responder(conv.id, from, "¡Gracias por escribir! En un momento te respondo por aquí 🙌");
  }
}

// Descarga la nota de voz, la transcribe y deja que el agente responda al texto.
async function procesarAudio(conv: Conv, from: string, msg: WhatsAppMessage, mensajeId: string) {
  const mediaId = msg.audio?.id;
  if (!mediaId) {
    await responder(conv.id, from, "Recibí tu audio pero no pude abrirlo. ¿Me lo escribes o me lo reenvías?");
    return;
  }
  try {
    const bytes = await downloadMedia(mediaId);
    const transcript = await transcribirAudio(bytes, msg.audio?.mime_type ?? "audio/ogg");
    await completarMensaje(mensajeId, { texto: transcript });
    await responderConAgente(conv, from, { direccion: "in", texto: transcript });
  } catch (e) {
    console.error("[whatsapp/webhook] transcribir audio falló:", e);
    await responder(
      conv.id,
      from,
      "Te escuché, pero no pude entender bien el audio. ¿Me lo escribes en un mensajito?",
    );
  }
}

// Descarga el comprobante, lo lee con visión, lo sube a Storage, resuelve el
// contrato por # de carro, registra el pago y responde lo leído.
async function procesarComprobante(
  conv: Conv,
  from: string,
  msg: WhatsAppMessage,
  mensajeId: string,
) {
  const conversacionId = conv.id;
  const image = msg.image;
  const mediaId = image?.id;
  if (!mediaId) {
    await responder(conversacionId, from, "📷 Recibí una imagen pero no pude abrirla. Reenvíala, por favor.");
    return;
  }
  const mime = image?.mime_type ?? "image/jpeg";

  try {
    const bytes = await downloadMedia(mediaId);
    const c = await leerComprobante(bytes, mime);
    const res = await procesarPagoComprobante({ conversacion: conv, comprobante: c, bytes, mime });

    // Completar el mensaje reclamado con la imagen en Storage + el pago.
    await completarMensaje(mensajeId, { mediaUrl: res.comprobantePath, pagoId: res.pagoId });

    // Respuesta HUMANA al cliente, COMPARANDO el pago contra lo que debía.
    const monto = c.monto != null ? `$${c.monto.toFixed(2)}` : null;
    let respuesta: string;
    if (!monto || c.confianza === "baja") {
      // No confirmamos un monto dudoso: mejor validarlo.
      respuesta = "¡Gracias! 🙌 Recibí tu comprobante, dame un momentito para validarlo y te confirmo.";
    } else if (res.resolucion.estado === "ok" && res.resolucion.contratoId) {
      // El sistema sabe cuánto debía → comparamos.
      const est = await estadoCuentaContrato(res.resolucion.contratoId);
      const carro = res.resolucion.etiqueta ?? "carro";
      const nombre = est?.templateVars[0] ? `, ${est.templateVars[0]}` : "";
      const debia = est?.cuenta ?? 0; // saldo base (sin recargo)
      if (est && c.monto! + 0.01 >= debia) {
        respuesta = `¡Listo${nombre}! Recibí tu pago de ${monto} del ${carro} ✅ Quedas al día por hoy. ¡Gracias por tu puntualidad! 🙌`;
      } else if (est) {
        respuesta = `¡Gracias${nombre}! Recibí ${monto} del ${carro}. Te queda un saldo de ${money(debia - c.monto!)} para completar hoy. Cualquier cosa nos dices 🙌`;
      } else {
        respuesta = `¡Listo! Recibí tu pago de ${monto} del ${carro} ✅ Ya lo registro. ¡Gracias!`;
      }
    } else if (res.resolucion.estado === "sin_carro") {
      respuesta = `¡Gracias! Recibí tu comprobante de ${monto} 💪 ¿Me confirmas el número de carro para aplicarlo bien?`;
    } else {
      respuesta = `¡Gracias! Recibí tu comprobante de ${monto}. Déjame validarlo y en un momento te confirmo 🙌`;
    }
    await responder(conversacionId, from, respuesta, res.pagoId);
  } catch (e) {
    console.error("[whatsapp/webhook] error procesando comprobante:", e);
    await responder(
      conversacionId, from,
      "¡Gracias por escribir! Tuve un detallito abriendo la imagen 🙈 ¿Me la reenvías, porfa?",
    );
  }
}

// ---------------------------------------------------------------------------
// Tipos mínimos del payload de WhatsApp
// ---------------------------------------------------------------------------
type WhatsAppMessage = {
  id?: string;
  from?: string;
  type?: string | "text" | "image" | "audio" | "voice" | "ptt";
  text?: { body?: string };
  image?: { id?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string; voice?: boolean };
};

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: WhatsAppMessage[] };
    }>;
  }>;
};
