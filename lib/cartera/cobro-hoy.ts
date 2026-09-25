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
// 2) ACUERDO (aparte de la letra, un solo plan):
//    Entra al cobro de hoy solo si es el concepto elegido (por defecto el de
//    menor valor) y aún falta la cuota. Si ya se pagó, se avisa y no se suma.
//
// 3) UN SOLO CONCEPTO más, además del recargo:
//    el que tenga el carro (prioridad_abono) o, si no, el de menor valor.
//    Los demás se listan “(pendiente)” y no suman.
//
// 4) DOMINGO: no entra al total salvo que el carro lo elija como ese concepto.
//
// Árbol de un pago: recargo → ese concepto → letra de hoy → días siguientes
// (acuerdo de ese día, luego la letra), hasta donde alcance.
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
  preferenciaAbonoContrato,
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
  /** null = menor valor. */
  preferencia?: string | null;
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
  const [acuerdoSaldo, extras, preferencia] = await Promise.all([
    acuerdoSaldoContrato(contratoId),
    cargosExtraAgrupados(contratoId),
    preferenciaAbonoContrato(contratoId),
  ]);
  return { acuerdoSaldo, extras, preferencia };
}

/** Cálculo canónico de cobro del día a partir del estado de cuenta. */
export function cobroHoyDe(e: EstadoCuenta, ctx: CobroHoyCtx): CobroHoy {
  const armado = armarExtractoDiario(e, {
    acuerdoSaldo: ctx.acuerdoSaldo,
    extras: ctx.extras,
    preferencia: ctx.preferencia,
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
