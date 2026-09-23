// Cuota del período de un acuerdo (daño financiado, negociación, etc.).
import { diaSemana, esDomingo } from "./fecha";

export type FrecuenciaAcuerdo = "dia" | "semana" | "quincena" | "mes" | "fecha";

export type AcuerdoActivo = {
  id: string;
  saldo: number;
  cuota_diaria: number;
  cuota_domingo: number | null;
  descripcion: string | null;
  /** Cada cuánto se cobra. Default dia. */
  frecuencia?: FrecuenciaAcuerdo | null;
  /** Ancla: día de semana/mes, o la única fecha si frecuencia = fecha. */
  fecha_especifica?: string | null;
};

export const FRECUENCIAS_ACUERDO: { value: FrecuenciaAcuerdo; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "quincena", label: "Quincena" },
  { value: "mes", label: "Mes" },
  { value: "fecha", label: "Fecha específica" },
];

function diaDelMes(fecha: string): number {
  return Number(fecha.slice(8, 10));
}

/** ¿Hoy toca cobrar este acuerdo según su frecuencia? */
export function tocaAcuerdoHoy(a: AcuerdoActivo, fecha: string): boolean {
  const freq = (a.frecuencia ?? "dia") as FrecuenciaAcuerdo;
  const ancla = a.fecha_especifica && /^\d{4}-\d{2}-\d{2}/.test(a.fecha_especifica)
    ? a.fecha_especifica.slice(0, 10)
    : null;

  if (freq === "dia") return true;

  if (freq === "fecha") {
    return Boolean(ancla && ancla === fecha);
  }

  if (freq === "semana") {
    // Mismo día de la semana que el ancla (default: lunes).
    const ref = ancla ? diaSemana(ancla) : 1;
    return diaSemana(fecha) === ref;
  }

  if (freq === "quincena") {
    const d = diaDelMes(fecha);
    if (ancla) {
      const aDia = diaDelMes(ancla);
      const otra = aDia <= 15 ? aDia + 15 : aDia - 15;
      return d === aDia || d === Math.min(Math.max(otra, 1), 28);
    }
    return d === 1 || d === 15;
  }

  if (freq === "mes") {
    const d = diaDelMes(fecha);
    const aDia = ancla ? diaDelMes(ancla) : 1;
    return d === aDia;
  }

  return true;
}

/** Lo que toca pagar HOY de un acuerdo, sin pasarse del saldo que queda. */
export function cuotaAcuerdoHoy(a: AcuerdoActivo, fecha: string): number {
  const saldo = Math.max(Number(a.saldo) || 0, 0);
  if (saldo <= 0) return 0;
  if (!tocaAcuerdoHoy(a, fecha)) return 0;

  const freq = (a.frecuencia ?? "dia") as FrecuenciaAcuerdo;
  if (freq === "dia") {
    const q = esDomingo(fecha)
      ? Number(a.cuota_domingo) || Number(a.cuota_diaria) || 0
      : Number(a.cuota_diaria) || 0;
    return Math.min(Math.max(q, 0), saldo);
  }

  // Semana / quincena / mes / fecha: la cuota del período (o todo el saldo si es fecha y cuota=0).
  const q = Number(a.cuota_diaria) || 0;
  if (freq === "fecha" && q <= 0.009) return saldo;
  return Math.min(Math.max(q, 0), saldo);
}

export function acuerdoHoyDe(acuerdos: AcuerdoActivo[], fecha: string): number {
  return acuerdos.reduce((s, a) => s + cuotaAcuerdoHoy(a, fecha), 0);
}
