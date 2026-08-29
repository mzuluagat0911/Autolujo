import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { sendText, downloadMedia } from "@/lib/whatsapp/client";
import { leerComprobante } from "@/lib/ai/comprobante";
import {
  obtenerConversacion,
  registrarMensaje,
  procesarPagoComprobante,
  mensajeYaExiste,
} from "@/lib/cartera/pipeline";

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
async function responder(conversacionId: string, from: string, texto: string, pagoId?: string) {
  await sendText(from, texto);
  await registrarMensaje({ conversacionId, direccion: "out", texto, pagoId: pagoId ?? null });
}

async function manejarMensaje(msg: WhatsAppMessage) {
  const from = msg.from as string;

  // Idempotencia: Meta reintenta; no reprocesar el mismo mensaje.
  if (await mensajeYaExiste(msg.id)) return;

  const conv = await obtenerConversacion(from);

  if (msg.type === "text") {
    await registrarMensaje({
      conversacionId: conv.id, direccion: "in", tipo: "text",
      texto: msg.text?.body ?? "", waMessageId: msg.id,
    });
    await responder(conv.id, from, `✅ Recibí: "${msg.text?.body ?? ""}"`);
  } else if (msg.type === "image") {
    await procesarComprobante(conv.id, from, msg);
  } else {
    await registrarMensaje({
      conversacionId: conv.id, direccion: "in", tipo: "text",
      texto: `[${msg.type ?? "mensaje"}]`, waMessageId: msg.id,
    });
    await responder(conv.id, from, "Recibí tu mensaje. En breve te respondo.");
  }
}

// Descarga el comprobante, lo lee con visión, lo sube a Storage, resuelve el
// contrato por # de carro, registra el pago y responde lo leído.
async function procesarComprobante(conversacionId: string, from: string, msg: WhatsAppMessage) {
  const image = msg.image;
  const mediaId = image?.id;
  if (!mediaId) {
    await responder(conversacionId, from, "📷 Recibí una imagen pero no pude abrirla. Reenvíala, por favor.");
    return;
  }
  const mime = image?.mime_type ?? "image/jpeg";

  const conv = await obtenerConversacion(from);
  try {
    const bytes = await downloadMedia(mediaId);
    const c = await leerComprobante(bytes, mime);
    const res = await procesarPagoComprobante({ conversacion: conv, comprobante: c, bytes, mime });

    // Registrar el comprobante entrante (con su imagen en Storage) — idempotente.
    await registrarMensaje({
      conversacionId, direccion: "in", tipo: "image",
      texto: "📷 Comprobante", mediaUrl: res.comprobantePath,
      waMessageId: msg.id, pagoId: res.pagoId,
    });

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
