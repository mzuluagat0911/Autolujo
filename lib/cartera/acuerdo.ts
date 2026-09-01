// Cuota del día de un acuerdo (daño financiado, etc.).
import { esDomingo } from "./fecha";

export type AcuerdoActivo = {
  id: string;
  saldo: number;
  cuota_diaria: number;
  cuota_domingo: number | null;
  descripcion: string | null;
};

/** Lo que toca pagar HOY de un acuerdo, sin pasarse del saldo que queda. */
export function cuotaAcuerdoHoy(a: AcuerdoActivo, fecha: string): number {
  const saldo = Math.max(Number(a.saldo) || 0, 0);
  if (saldo <= 0) return 0;
  const q = esDomingo(fecha)
    ? Number(a.cuota_domingo) || Number(a.cuota_diaria) || 0
    : Number(a.cuota_diaria) || 0;
  return Math.min(Math.max(q, 0), saldo);
}

export function acuerdoHoyDe(acuerdos: AcuerdoActivo[], fecha: string): number {
  return acuerdos.reduce((s, a) => s + cuotaAcuerdoHoy(a, fecha), 0);
}
