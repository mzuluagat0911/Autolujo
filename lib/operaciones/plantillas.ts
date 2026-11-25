// Plantillas WhatsApp de Operaciones (número de mantenimiento +507 6623-6501).
// UTILITY: citas de taller / mantenimiento / kit / revisión mensual.

export const PLANTILLA_CITA_MECANICA = "op_cita_mecanica";
export const PLANTILLA_MANTENIMIENTO_6000 = "op_mantenimiento_6000";
export const PLANTILLA_KIT_TIEMPOS = "op_kit_tiempos";
export const PLANTILLA_REVISION_MENSUAL = "op_revision_mensual";

/** Cuerpo con {{n}} para Meta. */
export const CUERPO_CITA_MECANICA =
  "Buena tarde. Estimado cliente.\n" +
  "Saludos 🙋‍♂️\n\n" +
  "Le hemos asignado una cita para el Taller por Novedades pendientes\n\n" +
  "🗓 Cita agendada\n" +
  "📆 Fecha: {{1}}\n" +
  "🕛 Hora: {{2}}\n" +
  "👨‍🔧 Trabajo: {{3}}\n\n" +
  "📍✍🏻 ¡LO ESPERAMOS!";

export const CUERPO_MANTENIMIENTO_6000 =
  "Buenas tardes Estimado cliente.\n\n" +
  "Saludos 🙋‍♂️\n\n" +
  "Su carro se encuentra para Mantenimiento\n\n" +
  "🗓 Cita agendada\n" +
  "📆 Fecha: {{1}}\n\n" +
  "🕛 Hora: {{2}}\n\n" +
  "📍 {{3}}\n\n" +
  "Le recordamos que el valor del mantenimiento es $60 dólares (No se financian, solo pago de contado).\n\n" +
  "SI TIENE PROMOCIÓN DE MANTENIMIENTOS GRATIS NO DEBE PAGAR NADA 💸\n\n" +
  "✍🏻 ¡Evite recargos por inasistencia!";

export const CUERPO_KIT_TIEMPOS =
  "Buena tarde. Estimado cliente.\n" +
  "Saludos 🙋‍♂️\n\n" +
  "Le hemos asignado una cita para el Taller por Novedades pendientes\n\n" +
  "🗓 Cita agendada\n" +
  "📆 Fecha: {{1}}\n\n" +
  "🕛 Hora: {{2}}\n\n" +
  "📍 {{3}}\n\n" +
  "👨‍🔧 Trabajo: KIT DE TIEMPOS (de ese trabajo le corresponde asumir {{4}} dólares)\n\n" +
  "Se realiza cambio de:\n" +
  "• Aceite de transmisión\n" +
  "• Filtro de transmisión\n" +
  "• Bujías\n" +
  "• Cables de bujías\n" +
  "• Correa de servicio\n" +
  "• Tacos de freno\n" +
  "• Tapa de radiador\n" +
  "• Ajuste y limpieza a las bandas de freno\n" +
  "• Limpieza al cuerpo de aceleración\n\n" +
  "📍✍🏻 ¡LO ESPERAMOS!";

export const CUERPO_REVISION_MENSUAL =
  "Buenas tardes estimado cliente 🤩\n\n" +
  "‼️ Le recordamos su cita de REVISIÓN MENSUAL el día {{1}}\n\n" +
  "🕛 Puede venir de 8:30 am a 3:00 PM\n\n" +
  "🚫 Recuerde que de no cumplir con la cita se le hará un recargo por inasistencia!\n\n" +
  "Que tenga un excelente fin de semana ☀️";

export const PLANTILLAS_OPERACIONES = [
  {
    name: PLANTILLA_CITA_MECANICA,
    category: "UTILITY" as const,
    text: CUERPO_CITA_MECANICA,
    example: ["LUNES 23 DE NOVIEMBRE 2026", "9AM", "Revisión de frenos"],
  },
  {
    name: PLANTILLA_MANTENIMIENTO_6000,
    category: "UTILITY" as const,
    text: CUERPO_MANTENIMIENTO_6000,
    example: ["LUNES 23 DE NOVIEMBRE 2026", "Entre 9AM a 2PM", "JUAN DIAZ"],
  },
  {
    name: PLANTILLA_KIT_TIEMPOS,
    category: "UTILITY" as const,
    text: CUERPO_KIT_TIEMPOS,
    example: ["MARTES 17 DE NOVIEMBRE 2026", "9AM", "SUCURSAL PANAMA", "73"],
  },
  {
    name: PLANTILLA_REVISION_MENSUAL,
    category: "UTILITY" as const,
    text: CUERPO_REVISION_MENSUAL,
    example: ["MIERCOLES 25 DE NOVIEMBRE"],
  },
] as const;

function parametro(valor: string, respaldo: string): string {
  const limpio = valor.replace(/[\n\r\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 120);
  return limpio || respaldo;
}

export function componentesPlantillaOp(valores: string[]): unknown[] {
  return [
    {
      type: "body",
      parameters: valores.map((valor) => ({ type: "text", text: parametro(valor, "—") })),
    },
  ];
}

export function plantillaAunNoListaOp(error: string): boolean {
  return /132001|132015|132016|does not exist in the translation|template is (paused|disabled)|not approved|pending review/i.test(
    error,
  );
}

export function armarCitaMecanica(fecha: string, hora: string, trabajo: string) {
  const f = parametro(fecha, "la fecha acordada");
  const h = parametro(hora, "la hora acordada");
  const t = parametro(trabajo, "el trabajo indicado");
  return {
    name: PLANTILLA_CITA_MECANICA,
    componentes: componentesPlantillaOp([f, h, t]),
    texto: CUERPO_CITA_MECANICA.replace("{{1}}", f).replace("{{2}}", h).replace("{{3}}", t),
  };
}

export function armarMantenimiento6000(fecha: string, hora: string, sucursal: string) {
  const f = parametro(fecha, "la fecha acordada");
  const h = parametro(hora, "Entre 9AM a 2PM");
  const s = parametro(sucursal, "la sucursal");
  return {
    name: PLANTILLA_MANTENIMIENTO_6000,
    componentes: componentesPlantillaOp([f, h, s]),
    texto: CUERPO_MANTENIMIENTO_6000.replace("{{1}}", f).replace("{{2}}", h).replace("{{3}}", s),
  };
}

export function armarKitTiempos(fecha: string, hora: string, sucursal: string, montoCliente: string | number) {
  const f = parametro(fecha, "la fecha acordada");
  const h = parametro(hora, "la hora acordada");
  const s = parametro(sucursal, "la sucursal");
  const m = parametro(String(montoCliente), "73");
  return {
    name: PLANTILLA_KIT_TIEMPOS,
    componentes: componentesPlantillaOp([f, h, s, m]),
    texto: CUERPO_KIT_TIEMPOS.replace("{{1}}", f)
      .replace("{{2}}", h)
      .replace("{{3}}", s)
      .replace("{{4}}", m),
  };
}

export function armarRevisionMensual(fecha: string) {
  const f = parametro(fecha, "la fecha acordada");
  return {
    name: PLANTILLA_REVISION_MENSUAL,
    componentes: componentesPlantillaOp([f]),
    texto: CUERPO_REVISION_MENSUAL.replace("{{1}}", f),
  };
}
