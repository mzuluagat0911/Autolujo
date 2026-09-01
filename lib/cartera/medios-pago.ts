// Medios de pago de Inversiones Auto Lujo Panamá.
// Dato FIJO del negocio, editable en un solo lugar. Lo usa el agente para
// responder "¿dónde pago?" con datos reales, y el dashboard para el pago manual.
//
// ⚠️ COMPLETAR: reemplaza los datos de las cuentas por los reales antes de producción.

export type CuentaBancaria = {
  banco: string;
  tipo: string; // "Ahorros" | "Corriente"
  numero: string;
  titular: string;
};

/** Las 3 cuentas para transferencia. Completa con los datos reales. */
export const CUENTAS_TRANSFERENCIA: CuentaBancaria[] = [
  { banco: "[Banco 1 — completar]", tipo: "Ahorros", numero: "[número — completar]", titular: "Inversiones Auto Lujo Panamá" },
  { banco: "[Banco 2 — completar]", tipo: "Ahorros", numero: "[número — completar]", titular: "Inversiones Auto Lujo Panamá" },
  { banco: "[Banco 3 — completar]", tipo: "Ahorros", numero: "[número — completar]", titular: "Inversiones Auto Lujo Panamá" },
];

/** Dirección de la oficina para pagos presenciales (datáfono / efectivo). */
export const OFICINA = "[Dirección de la oficina — completar]";

/**
 * Texto listo para el CONTEXTO del agente. Le dice exactamente qué responder
 * cuando el cliente pregunta cómo o dónde pagar. Tres formas de pago:
 *   1) Transferencia a cualquiera de las 3 cuentas (siempre con el # de carro).
 *   2) Tarjeta con datáfono en la oficina.
 *   3) Efectivo en la oficina.
 */
export function mediosDePagoTexto(): string {
  const cuentas = CUENTAS_TRANSFERENCIA.map(
    (c, i) => `   ${i + 1}. ${c.banco} · ${c.tipo} · ${c.numero} · a nombre de ${c.titular}`,
  ).join("\n");
  return [
    `CÓMO Y DÓNDE PUEDE PAGAR EL CLIENTE (3 formas — dile la que necesite):`,
    `1) Transferencia a cualquiera de estas cuentas (SIEMPRE poniendo el número de carro en el`,
    `   comentario y enviando el comprobante por aquí):`,
    cuentas,
    `2) Con tarjeta (datáfono) en la oficina: ${OFICINA}.`,
    `3) En efectivo en la oficina: ${OFICINA}.`,
    `Si el cliente prefiere pagar en la oficina (tarjeta o efectivo), confírmale que puede pasar`,
    `en horario de 8:00 a.m. a 7:00 p.m. y allí le reciben el pago.`,
  ].join("\n");
}
