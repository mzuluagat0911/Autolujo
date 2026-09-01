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
  marcarPendienteDeRespuesta,
  notasRecientes,
  resumenContrato,
  type Conversacion,
} from "@/lib/cartera/pipeline";
import { responderAgente } from "@/lib/ai/agente";
import { revisarRespuesta } from "@/lib/ai/guard";
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
  if (!secret) {
    // Sin secret, cualquiera puede inyectar mensajes falsos y manejar al
    // agente. En dev se deja pasar; en producción se cierra.
    if (process.env.NODE_ENV === "production") {
      console.error("[whatsapp/webhook] falta META_APP_SECRET: se rechaza el evento.");
      return false;
    }
    return true;
  }
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
    await marcarPendienteDeRespuesta(conversacionId, "No se pudo enviar la respuesta por WhatsApp.");
  }
}

/**
 * Se le prometió al cliente que alguien le escribe. Deja la conversación en
 * la cola de pendientes para que la promesa tenga dueño; sin esto el chat se
 * queda mudo y nadie se entera.
 */
async function responderYEscalar(
  conversacionId: string,
  from: string,
  texto: string,
  motivo: string,
) {
  await responder(conversacionId, from, texto);
  await marcarPendienteDeRespuesta(conversacionId, motivo);
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
    await responderYEscalar(
      conv.id,
      from,
      "¡Gracias por escribir! En un momento te respondo por aquí 🙌",
      `Mensaje de tipo "${msg.type ?? "desconocido"}" que el agente no puede leer.`,
    );
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
    // Lo que registró el equipo por fuera del chat (ej. un pago en oficina).
    const notas = await notasRecientes(conv.id);
    if (notas.length) {
      contexto = `${contexto ?? ""}\n\nREGISTROS INTERNOS RECIENTES (el equipo los anotó; tenlos en cuenta):\n${notas
        .map((n) => `- ${n}`)
        .join("\n")}`.trim();
    }
    const bruta = await responderAgente({ historial, contexto });

    // El prompt pide; el guard verifica. Nada sale sin pasar por aquí.
    const { respuesta: r, intervino, detalle } = revisarRespuesta(bruta, contexto);
    if (intervino) {
      console.warn(`[whatsapp/webhook] guard (${intervino}): ${detalle}`);
      await registrarMensaje({
        conversacionId: conv.id,
        direccion: "out",
        tipo: "system",
        texto: `🛡️ Respuesta bloqueada (${intervino}): ${detalle}`,
      });
    }

    if (r.pasar_a_humano) await marcarEscalada(conv.id, r.motivo ?? null);
    await responder(conv.id, from, r.mensaje);
  } catch (e) {
    console.error("[whatsapp/webhook] agente falló:", e);
    await responderYEscalar(
      conv.id,
      from,
      "¡Gracias por escribir! En un momento te respondo por aquí 🙌",
      "El agente no pudo responder (falla técnica).",
    );
  }
}

// Descarga la nota de voz, la transcribe y deja que el agente responda al texto.
async function procesarAudio(conv: Conv, from: string, msg: WhatsAppMessage, mensajeId: string) {
  const mediaId = msg.audio?.id;
  if (!mediaId) {
    await responderYEscalar(
      conv.id,
      from,
      "Recibí tu audio pero no pude abrirlo. ¿Me lo escribes o me lo reenvías?",
      "Llegó una nota de voz que no se pudo descargar.",
    );
    return;
  }
  try {
    const bytes = await downloadMedia(mediaId);
    const transcript = await transcribirAudio(bytes, msg.audio?.mime_type ?? "audio/ogg");
    await completarMensaje(mensajeId, { texto: transcript });
    await responderConAgente(conv, from, { direccion: "in", texto: transcript });
  } catch (e) {
    console.error("[whatsapp/webhook] transcribir audio falló:", e);
    await responderYEscalar(
      conv.id,
      from,
      "Te escuché, pero no pude entender bien el audio. ¿Me lo escribes en un mensajito?",
      "No se pudo transcribir una nota de voz.",
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
    await responderYEscalar(
      conversacionId,
      from,
      "📷 Recibí una imagen pero no pude abrirla. Reenvíala, por favor.",
      "Llegó una imagen que no se pudo descargar.",
    );
    return;
  }
  const mime = image?.mime_type ?? "image/jpeg";

  try {
    const bytes = await downloadMedia(mediaId);
    const c = await leerComprobante(bytes, mime);

    // La imagen debe SER un comprobante. Si no, no creamos pago (antifraude).
    if (!c.es_comprobante) {
      await responder(
        conversacionId,
        from,
        "Recibí tu imagen, pero no parece un comprobante de pago 🤔 ¿Me envías la captura de la transferencia, donde se vea el monto y la referencia? Así la cruzamos con el banco y aplicamos tu pago.",
      );
      return;
    }

    const res = await procesarPagoComprobante({ conversacion: conv, comprobante: c, bytes, mime });

    // Completar el mensaje reclamado con la imagen en Storage + el pago.
    await completarMensaje(mensajeId, { mediaUrl: res.comprobantePath, pagoId: res.pagoId });

    // Respuesta al cliente. NUNCA confirmamos "al día" aquí: el pago se valida
    // primero cruzándolo con el banco (antifraude). Solo acusamos recibo.
    const monto = c.monto != null ? `$${c.monto.toFixed(2)}` : null;
    const alerta = (codigo: string) => res.veredicto.alertas.some((a) => a.codigo === codigo);
    let respuesta: string;
    if (res.estadoConciliacion === "duplicado") {
      // Mismo comprobante otra vez: no se registra de nuevo ni se insinúa que sí.
      respuesta =
        "Ese comprobante ya lo tenemos registrado por aquí 🙌 Si hiciste otro pago distinto, mándame la captura de ese otro y lo revisamos.";
    } else if (alerta("cuenta_ajena") || alerta("cuenta_otra_empresa")) {
      // Puede ser un error de lectura o una transferencia a un tercero: lo ve una persona.
      respuesta =
        "¡Gracias por enviarlo! Me aparece que la cuenta del comprobante no es la nuestra 🤔 Déjame verificarlo con el equipo y te confirmamos por aquí en un momento.";
    } else if (alerta("fecha_vieja") || alerta("fecha_futura")) {
      respuesta =
        "¡Gracias! Recibí tu comprobante, pero la fecha no me cuadra con un pago de hoy 🤔 Déjame revisarlo con el equipo y te confirmamos por aquí.";
    } else if (!monto || c.confianza === "baja") {
      // Monto dudoso: ni siquiera repetimos la cifra, solo validamos.
      respuesta =
        "¡Gracias por enviarnos el comprobante! 🙌 Lo estamos cruzando con el banco para confirmar que entró bien. En cuanto quede validado te confirmamos por aquí.";
    } else if (res.resolucion.estado === "ok" && res.resolucion.contratoId) {
      const est = await estadoCuentaContrato(res.resolucion.contratoId);
      const carro = res.resolucion.etiqueta ?? "tu carro";
      const nombre = est?.templateVars[0] ? `, ${est.templateVars[0]}` : "";
      const debia = est?.cuenta ?? 0; // saldo base (sin recargo)
      const faltante = est ? debia - c.monto! : 0;
      const base = `¡Gracias${nombre} por enviarnos el comprobante de ${monto} del ${carro}! 🙌 Lo estamos cruzando con el banco para confirmar que entró sin problema.`;
      if (est && faltante > 0.01) {
        // Señal tentativa del faltante, sin dar el pago por aplicado.
        respuesta = `${base} Por lo que veo, quedaría un saldo de ${money(faltante)} para completar hoy; te confirmo apenas esté validado.`;
      } else {
        respuesta = `${base} Apenas quede validado te confirmamos por aquí.`;
      }
    } else if (res.resolucion.estado === "sin_carro") {
      respuesta = `¡Gracias por enviarnos el comprobante de ${monto}! 🙌 ¿Me confirmas el número de carro para aplicarlo bien? Lo estamos cruzando con el banco para validar que entró.`;
    } else {
      respuesta = `¡Gracias por enviarnos el comprobante de ${monto}! 🙌 Lo estamos cruzando con el banco para validarlo y en un momento te confirmamos.`;
    }
    await responder(conversacionId, from, respuesta, res.pagoId ?? undefined);
  } catch (e) {
    console.error("[whatsapp/webhook] error procesando comprobante:", e);
    await responderYEscalar(
      conversacionId,
      from,
      "¡Gracias por escribir! Tuve un detallito abriendo la imagen 🙈 ¿Me la reenvías, porfa?",
      "Falló el procesamiento de un comprobante: revisar si el pago quedó registrado.",
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
