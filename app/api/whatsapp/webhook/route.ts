import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { sendText, downloadMedia } from "@/lib/whatsapp/client";
import { leerComprobante } from "@/lib/ai/comprobante";

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
    const from = msg.from;
    if (!from) continue;

    if (msg.type === "text") {
      // v1: eco de confirmación. Luego: rutear a intención (pago / consulta).
      await sendText(from, `✅ Recibí: "${msg.text?.body ?? ""}"`);
    } else if (msg.type === "image") {
      await procesarComprobante(from, msg.image);
    } else {
      await sendText(from, "Recibí tu mensaje. En breve te respondo.");
    }
  }
}

// Descarga la imagen del comprobante, la lee con visión y responde lo leído.
// (Prueba de lectura — la conciliación contra el contrato viene después.)
async function procesarComprobante(
  from: string,
  image?: { id?: string; mime_type?: string },
) {
  const mediaId = image?.id;
  if (!mediaId) {
    await sendText(from, "📷 Recibí una imagen pero no pude abrirla. Reenvíala, por favor.");
    return;
  }

  await sendText(from, "📷 Recibí tu comprobante, dame un segundo…");

  try {
    const bytes = await downloadMedia(mediaId);
    const c = await leerComprobante(bytes, image?.mime_type ?? "image/jpeg");

    const monto = c.monto != null ? `$${c.monto.toFixed(2)}` : "no lo vi claro";
    const lineas = [
      "🧾 Esto leí del comprobante:",
      `• Monto: ${monto}`,
      `• Fecha: ${c.fecha ?? "—"}`,
      `• Referencia: ${c.referencia ?? "—"}`,
      `• Banco: ${c.banco ?? "—"}`,
      `• Confianza: ${c.confianza}`,
    ];
    if (c.confianza !== "alta") {
      lineas.push("", "⚠️ No quedé 100% seguro. Confírmame el monto, por favor.");
    }
    await sendText(from, lineas.join("\n"));
  } catch (e) {
    console.error("[whatsapp/webhook] error leyendo comprobante:", e);
    await sendText(
      from,
      "😕 No pude leer el comprobante esta vez. Reenvíalo o escríbeme el monto y la referencia.",
    );
  }
}

// ---------------------------------------------------------------------------
// Tipos mínimos del payload de WhatsApp
// ---------------------------------------------------------------------------
type WhatsAppMessage = {
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
