// Reglas de cuánto cuesta un día, en función de los términos del contrato.
//
// Puras a propósito: sin base de datos, sin red, sin reloj. Son las reglas del
// negocio y se pueden probar solas (scripts/probar-fechas.ts). El devengo, el
// estado de cuenta y el contexto del agente las consumen para no calcular cada
// uno lo suyo y terminar dando cifras distintas.

import { diaSemana } from "./fecha";

/** Términos del contrato que determinan cuánto se cobra cada día. */
export type TerminosCuota = {
  letra_diaria: number;
  descuento_puntual: number | null;
  cobra_domingo: boolean | null;
  cuota_domingo: number | null;
};

/**
 * Cuota base del día, la que paga quien paga puntual. 0 = ese día no se cobra.
 * Entre semana es la letra diaria; el domingo solo si el contrato lo pactó.
 */
export function cuotaDeFecha(c: TerminosCuota, fecha: string): number {
  if (diaSemana(fecha) === 0) {
    if (!c.cobra_domingo) return 0;
    return Math.max(Number(c.cuota_domingo) || Number(c.letra_diaria) || 0, 0);
  }
  return Math.max(Number(c.letra_diaria) || 0, 0);
}

/** El descuento que se pierde por no pagar antes del corte de las 7:00 p.m. */
export function penalidadDe(c: TerminosCuota): number {
  return Math.max(Number(c.descuento_puntual ?? 0), 0);
}

/**
 * Lo que termina costando un día que no se pagó a tiempo.
 * Ojo: es un total informativo. En la base nunca se guarda así — la renta va
 * a cuota base y el recargo aparte, para poder revertirlo. Ver devengo.ts.
 */
export function tarifaPlena(c: TerminosCuota, fecha: string): number {
  const base = cuotaDeFecha(c, fecha);
  return base <= 0 ? 0 : base + penalidadDe(c);
}
