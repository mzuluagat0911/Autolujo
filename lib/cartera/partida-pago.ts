// Parte un pago del banco en letra + otra cosa (salida al interior).
// La letra se queda con el resto. La otra parte no se adelanta como cuota.

import { destinoPorId } from "./salidas-interior";
import type { ResultadoPago } from "./types";

export type PartidaPago = {
  destinoId: string;
  monto: number;
};

export function armarPagoCombinado(
  montoTotal: number,
  partida: PartidaPago,
): { error: string } | { destinoId: string; resultado: ResultadoPago } {
  const total = Math.round((Number(montoTotal) || 0) * 100) / 100;
  const parte = Math.round((Number(partida.monto) || 0) * 100) / 100;
  if (!(parte > 0)) return { error: "La parte partida tiene que ser mayor que cero." };
  if (parte - total > 0.001) return { error: "Esa parte es mayor que el pago." };
  const dest = destinoPorId(partida.destinoId);
  if (!dest) return { error: "Elige el destino de esa parte." };
  const resto = Math.round((total - parte) * 100) / 100;
  return {
    destinoId: dest.id,
    resultado: {
      sobrante: 0,
      totalAplicado: total,
      asignaciones: [
        ...(resto > 0.009
          ? [{ tipo: "saldo_anterior" as const, aplicado: resto, etiqueta: "saldo anterior" }]
          : []),
        {
          tipo: "salida_interior" as const,
          aplicado: parte,
          etiqueta: `salida a ${dest.nombre}`,
        },
      ],
    },
  };
}
