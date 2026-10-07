// Cliente de la WhatsApp Cloud API (Meta). Server-only.

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// `phoneIdOverride` deja mandar DESDE otro número de la cuenta (ej. el del
// agente comercial). Si no se pasa, sale del número de cartera de siempre.
// El token es el mismo (usuario del sistema "AutoLujo API") para ambos números.
function creds(phoneIdOverride?: string) {
  const phoneId = phoneIdOverride ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) {
    throw new Error("Faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN en el entorno.");
  }
  return { phoneId, token };
}

async function post(body: unknown, phoneIdOverride?: string) {
  const { phoneId, token } = creds(phoneIdOverride);
  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp send falló (${res.status}): ${err}`);
  }
  return res.json();
}

/** Mensaje de texto libre (solo dentro de la ventana de servicio de 24h).
 *  `phoneId` elige el número de salida (ej. comercial); por defecto, cartera. */
export function sendText(to: string, body: string, phoneId?: string) {
  return post(
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: false },
    },
    phoneId,
  );
}

/**
 * Sube un archivo a la Cloud API y devuelve el media id.
 * Hace falta para audio/imagen saliente (no se manda el binario en el mensaje).
 */
export async function uploadWhatsAppMedia(
  bytes: Buffer,
  mime: string,
  filename: string,
): Promise<string> {
  const { phoneId, token } = creds();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime.split(";")[0]!.trim());
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);

  const res = await fetch(`${GRAPH}/${phoneId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp upload media falló (${res.status}): ${err}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("WhatsApp no devolvió media id.");
  return json.id;
}

/** Audio dentro de la ventana de 24h. `voz` lo muestra como nota de voz (OGG Opus). */
export async function sendAudio(to: string, mediaId: string, voz = false) {
  return post({
    messaging_product: "whatsapp",
    to,
    type: "audio",
    audio: voz ? { id: mediaId, voice: true } : { id: mediaId },
  });
}

/** Sube bytes y envía el audio en un solo paso. */
export async function sendAudioBytes(
  to: string,
  bytes: Buffer,
  mime: string,
  filename = "nota.ogg",
  voz = false,
) {
  const id = await uploadWhatsAppMedia(bytes, mime, filename);
  return sendAudio(to, id, voz);
}

/** Mensaje de plantilla (para iniciar conversación, ej. estado de cuenta 8am). */
export function sendTemplate(
  to: string,
  templateName: string,
  languageCode = "es",
  components?: unknown[],
) {
  return post({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  });
}

/** Descarga un archivo (comprobante) por su media_id. Devuelve los bytes. */
export async function downloadMedia(mediaId: string): Promise<Buffer> {
  const { token } = creds();
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`No se pudo obtener el media ${mediaId}`);
  const { url } = (await metaRes.json()) as { url: string };
  const fileRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileRes.ok) throw new Error(`No se pudo descargar el media ${mediaId}`);
  return Buffer.from(await fileRes.arrayBuffer());
}
