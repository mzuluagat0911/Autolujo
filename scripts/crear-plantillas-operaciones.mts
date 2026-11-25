/**
 * Sube a Meta las plantillas de Operaciones (número de mantenimiento).
 *
 * Uso:
 *   npx tsx scripts/crear-plantillas-operaciones.mts
 *
 * Requiere WHATSAPP_TOKEN y WHATSAPP_MANTENIMIENTO_PHONE_NUMBER_ID
 * (o WHATSAPP_WABA_ID).
 */
import { PLANTILLAS_OPERACIONES } from "../lib/operaciones/plantillas.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

async function wabaId(token: string): Promise<string> {
  const directo = process.env.WHATSAPP_WABA_ID?.trim();
  const phoneId = process.env.WHATSAPP_MANTENIMIENTO_PHONE_NUMBER_ID?.trim();
  if (phoneId) {
    const res = await fetch(`${GRAPH}/${phoneId}?fields=whatsapp_business_account`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { whatsapp_business_account?: { id?: string } };
      if (json.whatsapp_business_account?.id) return json.whatsapp_business_account.id;
    }
  }
  if (!directo) throw new Error("No pude resolver el WABA del número de mantenimiento.");
  return directo;
}

async function main() {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!token) throw new Error("Falta WHATSAPP_TOKEN.");
  const waba = await wabaId(token);
  console.log(`WABA ${waba}. Subiendo ${PLANTILLAS_OPERACIONES.length} plantillas…`);

  for (const plantilla of PLANTILLAS_OPERACIONES) {
    const res = await fetch(`${GRAPH}/${waba}/message_templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: plantilla.name,
        language: "es",
        category: plantilla.category,
        components: [
          {
            type: "BODY",
            text: plantilla.text,
            example: { body_text: [plantilla.example] },
          },
        ],
      }),
    });
    const json = (await res.json()) as {
      id?: string;
      status?: string;
      error?: { message?: string; error_user_msg?: string };
    };
    if (res.ok) {
      console.log(`${plantilla.name}: enviada a revisión (${json.status ?? "PENDING"})`);
      continue;
    }
    const mensaje = json.error?.error_user_msg ?? json.error?.message ?? `HTTP ${res.status}`;
    if (/already exists|content duplicate|ya existe/i.test(mensaje)) {
      console.log(`${plantilla.name}: ya estaba creada`);
      continue;
    }
    console.log(`${plantilla.name}: ${mensaje}`);
  }
}

await main();
