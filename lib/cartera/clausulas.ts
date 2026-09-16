// Cláusulas de cobro del contrato (reales, del contrato de arrendamiento con
// opción de compra). El agente las cita para cobrar con firmeza. Un solo lugar
// editable: si cambia el contrato, se ajusta aquí.

/** Cuántas cuotas sin pagar habilitan terminación + retiro del vehículo. */
export const CUOTAS_PARA_TERMINACION = 3;

export function clausulasCobroTexto(): string {
  return [
    `CLÁUSULAS DE COBRO DEL CONTRATO (son reales; cítalas para cobrar con firmeza cuando aplique):`,
    `- El pago es DIARIO (lunes a sábado). Atrasarse genera recargo y se considera incumplimiento.`,
    `- Cada semana debe quedar cerrada a más tardar el LUNES (incluida la cuota del lunes). Si el`,
    `  lunes termina debiendo algo, se le cobra un recargo de $10 por no cerrar la semana al día`,
    `  (está en el contrato).`,
    `- ${CUOTAS_PARA_TERMINACION} cuotas sin pagar (seguidas o no) son causal de TERMINACIÓN ANTICIPADA del contrato: la`,
    `  empresa puede exigir la ENTREGA/RETIRO INMEDIATO del vehículo y proceder judicialmente.`,
    `- La empresa está autorizada a reportar al cliente en la APC (buró de crédito) y a hacer cobro`,
    `  jurídico si incumple.`,
    `- El vehículo puede ser APAGADO por saldos negativos de Panapass o por boletas de tránsito pendientes.`,
  ].join("\n");
}
