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
} from "@/lib/cartera/pipeline";
import { responderAgente } from "@/lib/ai/agente";

export const runtime = "nodejs";

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

  const texto =
    msg.type === "text" ? msg.text?.body ?? "" :
    msg.type === "image" ? "📷 Comprobante" : `[${msg.type ?? "mensaje"}]`;

  // Candado de idempotencia: reclama el mensaje ANTES de trabajo pesado.
  // Si Meta reintenta, el segundo choca con el unique y sale sin reprocesar.
  const mensajeId = await reclamarMensajeEntrante({
    conversacionId: conv.id, waMessageId: msg.id,
    tipo: msg.type === "image" ? "image" : "text", texto,
  });
  if (!mensajeId) return; // duplicado (reintento de Meta)

  if (msg.type === "text") {
    // Agente conversacional: responde con el modelo de texto (no eco).
    let respuesta: string;
    try {
      const historial = await historialReciente(conv.id, 10);
      const contexto = conv.etiqueta ? `El cliente está vinculado al ${conv.etiqueta}.` : undefined;
      respuesta = await responderAgente({ historial, contexto });
    } catch (e) {
      console.error("[whatsapp/webhook] agente falló:", e);
      respuesta = "Recibí tu mensaje 🙌. En un momento te respondo.";
    }
    await responder(conv.id, from, respuesta);
  } else if (msg.type === "image") {
    await procesarComprobante(conv, from, msg, mensajeId);
  } else {
    await responder(conv.id, from, "Recibí tu mensaje. En breve te respondo.");
  }
}

// Descarga el comprobante, lo lee con visión, lo sube a Storage, resuelve el
// contrato por # de carro, registra el pago y responde lo leído.
async function procesarComprobante(
  conv: { id: string; wa_numero: string; cliente_id: string | null; vehiculo_id: string | null; contrato_id: string | null; etiqueta: string | null },
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

    const monto = c.monto != null ? `$${c.monto.toFixed(2)}` : "no lo vi claro";
    const conf = c.confianza === "alta" ? "alta ✅" : c.confianza === "media" ? "media 🟡" : "baja 🔴";
    const lineas = [
      "🧾 Esto leí del comprobante:",
      `• Monto: ${monto}`,
      `• Fecha: ${c.fecha ?? "—"}`,
      `• Referencia: ${c.referencia ?? "—"}`,
      `• Banco: ${c.banco ?? "—"}`,
      `• Cuenta destino: ${c.cuenta_destino ?? "—"}`,
      `• Carro: ${c.numero_carro ?? "no vi el # de carro"}`,
      `• Confianza lectura: ${conf}`,
    ];
    if (res.resolucion.estado === "ok") {
      lineas.push("", "✅ Registrado. Lo validamos y te confirmo el saldo.");
    } else if (res.resolucion.estado === "sin_carro") {
      lineas.push("", "🚗 ¿A qué número de carro corresponde este pago?");
    } else if (res.resolucion.estado === "sin_contrato") {
      lineas.push("", "⚠️ No encontré un contrato activo para ese carro. Lo revisa el equipo.");
    } else {
      lineas.push("", "⚠️ Recibido. Lo está revisando el equipo.");
    }
    await responder(conversacionId, from, lineas.join("\n"), res.pagoId);
  } catch (e) {
    console.error("[whatsapp/webhook] error procesando comprobante:", e);
    await responder(
      conversacionId, from,
      "😕 No pude leer el comprobante esta vez. Reenvíalo o escríbeme el monto y la referencia.",
    );
  }
}

// ---------------------------------------------------------------------------
// Tipos mínimos del payload de WhatsApp
// ---------------------------------------------------------------------------
type WhatsAppMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string };
};

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: WhatsAppMessage[] };
    }>;
  }>;
};
