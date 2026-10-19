import {
  CUERPO_CONFIRMA_CITA,
  CUERPO_RECORDATORIO_CITA,
  PLANTILLA_CONFIRMA_CITA,
  PLANTILLA_RECORDATORIO_CITA,
  PLANTILLAS_SEGUIMIENTO,
} from "../lib/comercial/plantillas.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

const PLANTILLAS = [
  ...PLANTILLAS_SEGUIMIENTO.map((plantilla) => ({
    name: plantilla.name,
    category: "MARKETING",
    text: plantilla.text,
    example: ["Ana"],
  })),
  {
    name: PLANTILLA_CONFIRMA_CITA,
    category: "UTILITY",
    text: CUERPO_CONFIRMA_CITA,
    example: ["Ana", "martes 14 de octubre", "10:00", "Juan Díaz"],
  },
  {
    name: PLANTILLA_RECORDATORIO_CITA,
    category: "UTILITY",
    text: CUERPO_RECORDATORIO_CITA,
    example: ["Ana", "10:00", "Juan Díaz"],
  },
];

async function wabaId(token: string): Promise<string> {
  const directo = process.env.WHATSAPP_WABA_ID?.trim();
  const phoneId = process.env.WHATSAPP_COMERCIAL_PHONE_NUMBER_ID?.trim();
  if (phoneId) {
    const res = await fetch(`${GRAPH}/${phoneId}?fields=whatsapp_business_account`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { whatsapp_business_account?: { id?: string } };
      if (json.whatsapp_business_account?.id) return json.whatsapp_business_account.id;
    }
  }
  if (!directo) throw new Error("No pude resolver el WABA del número comercial.");
  return directo;
}

async function main() {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!token) throw new Error("Falta WHATSAPP_TOKEN.");
  const waba = await wabaId(token);
  for (const plantilla of PLANTILLAS) {
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
    const json = (await res.json()) as { id?: string; status?: string; error?: { message?: string; error_subcode?: number } };
    if (res.ok) {
      console.log(`${plantilla.name}: enviada a revisión (${json.status ?? "PENDING"})`);
      continue;
    }
    const mensaje = json.error?.message ?? `HTTP ${res.status}`;
    if (/already exists|content duplicate|ya existe/i.test(mensaje)) {
      console.log(`${plantilla.name}: ya estaba creada`);
      continue;
    }
    console.log(`${plantilla.name}: ${mensaje}`);
  }
}

await main();
