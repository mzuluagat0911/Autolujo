// Cliente de la WhatsApp Cloud API (Meta). Server-only.

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

function creds() {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) {
    throw new Error("Faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN en el entorno.");
  }
  return { phoneId, token };
}

async function post(body: unknown) {
  const { phoneId, token } = creds();
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

/** Mensaje de texto libre (solo dentro de la ventana de servicio de 24h). */
export function sendText(to: string, body: string) {
  return post({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body, preview_url: false },
  });
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
