// Plantilla Meta `bienvenida_cartera`, aprobada, sin variables.
// Sale del número de cartera cuando se crea un cliente nuevo con celular.

import { espejarEnChat } from "@/lib/cartera/pipeline";
import { sendTemplate } from "@/lib/whatsapp/client";

export const TEMPLATE_BIENVENIDA_CARTERA = "bienvenida_cartera";

/** Mismo texto que la plantilla aprobada, para dejarlo en el chat. */
export const TEXTO_BIENVENIDA_CARTERA = `Hola, buenas tardes✨ mi nombre es Claudia

Le notifico que *lo estare acompañando en el cargo  de cartera en Auto Lujo Panamá 🇵🇦🚗 espero nos la llevemos muy bien✨*

👉🏼 A partir de hoy nos envía los comprobantes de pago, cualquier duda o consulta quedo atenta.👈🏻`;

export async function enviarBienvenidaCartera(
  waNorm: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sendTemplate(waNorm, TEMPLATE_BIENVENIDA_CARTERA, "es");
    await espejarEnChat(waNorm, TEXTO_BIENVENIDA_CARTERA, "Claudia");
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "No se pudo enviar la bienvenida.";
    console.error("[bienvenida-cartera]", error);
    return { ok: false, error };
  }
}
