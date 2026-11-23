// Número de WhatsApp de mantenimiento (avisos de revisión / kit / básico).
// Sale de la misma App/token que cartera; el phone id es otro.

/** Phone number ID de Meta. Vacío = todavía no conectado en este entorno. */
export function phoneIdMantenimiento(): string | null {
  const id = process.env.WHATSAPP_MANTENIMIENTO_PHONE_NUMBER_ID?.trim();
  return id || null;
}

export function mantenimientoWhatsAppListo(): boolean {
  return Boolean(phoneIdMantenimiento() && process.env.WHATSAPP_TOKEN?.trim());
}

/** Número visible para el equipo (no es el phone id). */
export const NUMERO_MANTENIMIENTO_VISIBLE = "+507 6623-6501";
