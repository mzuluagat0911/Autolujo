// Medios de pago de Inversiones Auto Lujo Panamá.
//
// IMPORTANTE: cada carro pertenece a una empresa (AUTOLUJO / KOWUA / GOLD) y
// paga a la CUENTA DE SU EMPRESA. Las cuentas viven en la tabla
// `cuentas_bancarias` (ligadas a cada empresa) — nunca se hardcodean aquí; el
// agente lee la cuenta correcta desde el CONTEXTO del contrato.
//
// Aquí solo viven los datos GLOBALES: las oficinas y el horario de atención.

/**
 * Las 2 oficinas para pago presencial.
 * OJO: efectivo en ambas, pero TARJETA (datáfono) solo en Juan Díaz —
 * en La Chorrera NO reciben tarjeta.
 */
export const OFICINAS = [
  {
    nombre: "La Chorrera",
    direccion: "Barrio Colón, Calle 11 de Octubre, Local 3 (frente al parque del Barrio Vega)",
    efectivo: true,
    tarjeta: false,
  },
  {
    nombre: "Juan Díaz",
    direccion: "San Fernando, Calle 131 Este, entrando por la Iglesia Nuestra Señora de la Candelaria; galera a mano izquierda, fachada negra",
    efectivo: true,
    tarjeta: true,
  },
];

/** Horario de atención de las oficinas (pago presencial). */
export const HORARIO_OFICINA = "Lunes a viernes 8:00 a.m. – 5:00 p.m. · sábados 8:00 a.m. – 12:00 m.";

/** Bloque para el CONTEXTO del agente: pago presencial (siempre disponible). */
export function pagoEnOficinaTexto(): string {
  const oficinas = OFICINAS.map((o) => {
    const medios = o.tarjeta ? "efectivo y tarjeta (datáfono)" : "solo efectivo (NO reciben tarjeta aquí)";
    return `   • ${o.nombre}: ${o.direccion} — ${medios}`;
  }).join("\n");
  return [
    `PAGO EN OFICINA — hay 2 oficinas:`,
    oficinas,
    `   Horario de oficina: ${HORARIO_OFICINA}`,
    `   Cuando pregunten dónde pagar en persona (efectivo o tarjeta), MENCIONA LAS DOS oficinas`,
    `   (La Chorrera y Juan Díaz) con su dirección. Recuerda: con TARJETA solo en Juan Díaz;`,
    `   en La Chorrera solo efectivo.`,
  ].join("\n");
}
