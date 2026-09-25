// Fuente ÚNICA de “cuánto cobrar HOY” y del desglose del extracto.
//
// WhatsApp, el agente y el botón “Ver mensaje” DEBEN usar esto.
// No recalcular a mano con totalHoy de cifras: ese número es ledger (letra
// + falta de acuerdo), no la regla de cobro del día.
//
// ─── Reglas de cobro (consolidadas) ─────────────────────────────────────
//
// 1) LETRA (siempre, si hay): cuota de hoy + atraso de letra + recargo/cierre.
//    Vive en el ledger (cargos renta / saldo). Un pago baja ese saldo.
//
// 2) ACUERDO (aparte de la letra):
//    - Plan en tabla `acuerdos` (saldo + cuota_diaria).
//    - Un pago normal NO lo toca. Solo baja el saldo si el rubro es "acuerdo"
//      o si en el historial se reasigna a mano. Si un comprobante se come la
//      cuota, faltaAcuerdo queda en 0 y el extracto cobra el extra siguiente
//      (G20: mantenimiento $26 en vez de los $5 del acuerdo).
//    - Cargo compensatorio tipo=acuerdo al aplicar → el pago al arreglo
//      NO come la letra.
//    - `acuerdoHoy`  = cuota programada hoy (aunque ya la haya pagado).
//    - `faltaAcuerdo` = lo que AÚN falta de esa cuota hoy.
//    - Si faltaAcuerdo > 0 → entra al TOTAL (prioridad 1 del ítem extra).
//    - Si faltaAcuerdo = 0 pero hay plan/saldo → se LISTA el plan (aviso),
//      no se vuelve a cobrar.
//
// 3) UN SOLO ÍTEM EXTRA por día (además de letra/recargo/cierre):
//    prioridad: acuerdos (falta) → mantenimiento → menor saldo.
//    Los no elegidos se listan con “(pendiente)” y NO suman al total.
//
// 4) DOMINGO: se lista; NUNCA suma al total (lun–sáb).
//
// 5) “Pagado hoy” YA está neto en el saldo / total. NUNCA inventar una
//    línea “abono” con ese monto (duplicaba el cobro).
//
// 6) “Por no pagar” SOLO con recargo real (PAGO_TARDE / corte). No partir
//    el saldo en letras + $5 para “cuadrar”. G20 24-sep: $25 inventados
//    sobre deuda de letra; el mantenimiento $26 era el único cargo aparte.
//
// TOTAL A PAGAR HOY = letra/recargo/cierre + el un ítem extra elegido.

import type { EstadoCuenta } from "./estado-cuenta";
import {
  acuerdoSaldoContrato,
  armarExtractoDiario,
  cargosExtraAgrupados,
  textoDesgloseExtracto,
  type ExtractoArmado,
  type LineaExtracto,
} from "./extracto-desglose";

export const MARCA_EXCEDENTE_SIN_CONCEPTO = "EXCEDENTE_SIN_CONCEPTO";

/** El banco puede cuadrar el monto, pero el equipo tiene que ponerle concepto antes de aprobar. */
export function pagoEsperaConceptoExcedente(notas: string | null | undefined): boolean {
  return (notas ?? "").includes(MARCA_EXCEDENTE_SIN_CONCEPTO);
}

export type CobroHoyCtx = {
  acuerdoSaldo: number;
  extras: LineaExtracto[];
};

export type CobroHoy = ExtractoArmado & {
  /** Texto del desglose (misma forma que Meta / preview). */
  desglose: string;
  acuerdoSaldo: number;
  /** Cuota de acuerdo programada hoy (puede estar ya cubierta). */
  acuerdoHoy: number;
  /** Lo que aún falta del acuerdo hoy (lo que sí puede ir al total). */
  faltaAcuerdo: number;
};

/** Carga saldo de acuerdos + cargos extra del contrato. */
export async function ctxCobroHoy(contratoId: string): Promise<CobroHoyCtx> {
  const [acuerdoSaldo, extras] = await Promise.all([
    acuerdoSaldoContrato(contratoId),
    cargosExtraAgrupados(contratoId),
  ]);
  return { acuerdoSaldo, extras };
}

/** Cálculo canónico de cobro del día a partir del estado de cuenta. */
export function cobroHoyDe(e: EstadoCuenta, ctx: CobroHoyCtx): CobroHoy {
  const armado = armarExtractoDiario(e, {
    acuerdoSaldo: ctx.acuerdoSaldo,
    extras: ctx.extras,
  });
  return {
    ...armado,
    desglose: textoDesgloseExtracto(armado.lineas),
    acuerdoSaldo: ctx.acuerdoSaldo,
    acuerdoHoy: Math.max(Number(e.acuerdoHoy) || 0, 0),
    faltaAcuerdo: Math.max(Number(e.faltaAcuerdo) || 0, 0),
  };
}

/** Atajo: estado + fetch de ctx. */
export async function cobroHoyContrato(e: EstadoCuenta): Promise<CobroHoy> {
  const ctx = await ctxCobroHoy(e.contratoId);
  return cobroHoyDe(e, ctx);
}
