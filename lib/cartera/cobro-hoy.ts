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
//    Entra al cobro de hoy solo si es el concepto elegido y aún falta la cuota.
//    Un pago antes de las 9:00 a.m., si ayer no se cubrió esa cuota diaria,
//    abona el día atrasado: la de hoy se sigue cobrando. Si la de hoy ya se
//    pagó, se avisa y no se suma.
//
// 3) UN SOLO CONCEPTO más, además del recargo:
//    el que tenga el carro (prioridad_abono) o, si no, el de menor valor.
//    Los demás se listan “(pendiente)” y no suman.
//
// 4) DOMINGO:
//    Una tajada (la cuota), nunca el balde. Lun–sáb entra al total si el
//    domingo pasado sigue sin pagar, aunque el pago haya caído lunes o martes.
//    Si esa tajada ya se cubrió, el resto es el próximo domingo: aviso, no suma.
//    El sábado no abre el domingo que viene.
//    Domingo: tajada del balde + letra atrasada + acuerdo atrasado
//    (cuota del día anterior sin pagar) + acuerdo de domingo
//    (frecuencia domingo, o frecuencia día con cuota domingo puesta).
//    La cuota diaria del acuerdo no se cobra el domingo. Al día → $0.
//
// Taller (chapistería, mantenimiento, colisión) desde la fecha de ingreso
// hasta el día anterior a la activación: no corre letra diaria ni acuerdo
// diario. El día de activación vuelve a productivo. Sin esa fecha, sigue
// en pausa. El TOTAL mientras tanto es el saldo que ya debía.
//
// Árbol lun–sáb: tajada del domingo pasado si sigue abierta → recargo →
// acuerdo del día → Recargo Cierre semana → letras atrasadas → letra de hoy
// → días siguientes (acuerdo de ese día, luego la letra).
// Domingo: primero la tajada. Después recargo, acuerdo del día y letra
// atrasada. El excedente va a la letra siguiente, salvo que quede saldo de
// acuerdo (baja el plan) o el pago traiga rubro domingo (adelanta el próximo
// domingo, solo hasta el balde que queda). El atraso ya se comió antes.
//
// Excedente lun–vie: si el cliente NOMBRA el destino y ese concepto existe,
// el sobrante va ahí. Si no lo nombra, no se inventa.
// Sábado: pago mayor que la letra diaria → se pregunta a dónde va el
// excedente (muchos abonan el domingo por adelantado). No se asume letra
// del lunes ni domingo hasta que lo diga.
//
// 5) “Pagado hoy” YA está neto en el saldo / total. NUNCA inventar una
//    línea “abono” con ese monto (duplicaba el cobro).
//
// 6) “Por no pagar” solo si el equipo cargó la multa. El corte de las 7 no lo crea solo.
//    el saldo en letras + $5 para “cuadrar”. G20 24-sep: $25 inventados
//    sobre deuda de letra; el mantenimiento $26 era el único cargo aparte.
//
// TOTAL A PAGAR HOY = letra/recargo/cierre + el un ítem extra elegido.

import type { EstadoCuenta } from "./estado-cuenta";
import {
  armarExtractoDiario,
  cargosExtraAgrupados,
  preferenciaAbonoContrato,
  detalleAcuerdosContrato,
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
  /** Planes que esperan detrás del que se cobra. No suman al total. */
  enEspera?: { etiqueta: string; saldo: number }[];
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
  const [acuerdos, extras, preferencia] = await Promise.all([
    detalleAcuerdosContrato(contratoId),
    cargosExtraAgrupados(contratoId),
    preferenciaAbonoContrato(contratoId),
  ]);
  return {
    acuerdoSaldo: acuerdos.saldo,
    extras,
    preferencia,
    enEspera: acuerdos.espera,
  };
}

/** Cálculo canónico de cobro del día a partir del estado de cuenta. */
export function cobroHoyDe(e: EstadoCuenta, ctx: CobroHoyCtx): CobroHoy {
  const armado = armarExtractoDiario(e, {
    acuerdoSaldo: ctx.acuerdoSaldo,
    extras: ctx.extras,
    preferencia: ctx.preferencia,
    enEspera: ctx.enEspera,
    hoy: e.hoyIso,
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
