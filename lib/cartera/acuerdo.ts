// Cuota del período de un acuerdo (daño financiado, negociación, etc.).
import { diaSemana, esDomingo, hoyPanama, sumarDias } from "./fecha";

export type FrecuenciaAcuerdo =
  | "dia"
  | "domingo"
  | "semana"
  | "quincena"
  | "mes"
  | "fecha";

export type AcuerdoActivo = {
  id: string;
  saldo: number;
  cuota_diaria: number;
  cuota_domingo: number | null;
  descripcion: string | null;
  /** Cada cuánto se cobra. Default dia. */
  frecuencia?: FrecuenciaAcuerdo | null;
  /** Ancla: día de semana/mes, la única fecha, o el primer día de cobro si es diario. */
  fecha_especifica?: string | null;
};

export const FRECUENCIAS_ACUERDO: { value: FrecuenciaAcuerdo; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "domingo", label: "Domingo" },
  { value: "semana", label: "Semana" },
  { value: "quincena", label: "Quincena" },
  { value: "mes", label: "Mes" },
  { value: "fecha", label: "Fecha específica" },
];

/** 0=domingo … 6=sábado (igual que Date.getUTCDay). */
export const DIAS_SEMANA: { value: number; label: string }[] = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function diaDelMes(fecha: string): number {
  return Number(fecha.slice(8, 10));
}

/** Próxima (o misma) fecha con ese día de la semana, desde `desde`. */
export function fechaConDiaSemana(desde: string, dia: number): string {
  const actual = diaSemana(desde);
  const delta = (dia - actual + 7) % 7;
  return sumarDias(desde, delta);
}

export function diaSemanaDeAncla(ancla: string | null | undefined): number {
  if (ancla && /^\d{4}-\d{2}-\d{2}/.test(ancla)) return diaSemana(ancla.slice(0, 10));
  return 1; // lunes por defecto
}

/** ¿Hoy toca cobrar este acuerdo según su frecuencia? */
export function tocaAcuerdoHoy(a: AcuerdoActivo, fecha: string): boolean {
  const freq = (a.frecuencia ?? "dia") as FrecuenciaAcuerdo;
  const ancla = a.fecha_especifica && /^\d{4}-\d{2}-\d{2}/.test(a.fecha_especifica)
    ? a.fecha_especifica.slice(0, 10)
    : null;

  // En diario (y domingo): la fecha es el primer día que se cobra. Vacía = desde ya.
  if ((freq === "dia" || freq === "domingo") && ancla && fecha < ancla) return false;
  if (freq === "dia") return true;
  if (freq === "domingo") return esDomingo(fecha);

  if (freq === "fecha") {
    // Desde ese día entra el saldo. Antes, no. Si no pagan ese día, sigue debido.
    return Boolean(ancla && fecha >= ancla);
  }

  if (freq === "semana") {
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

/**
 * Lo que toca pagar HOY de un acuerdo, sin pasarse del saldo que queda.
 *
 * En `dia`: lun–sáb usa cuota_diaria. El domingo NO cobra esa diaria.
 * Cobra cuota_domingo solo si está puesta (acuerdo de domingo sobre el
 * mismo saldo). Si está en 0, el domingo no abre cuota nueva: el atraso
 * del día anterior lo suma `programadoAcuerdoDe`.
 * Si `fecha_especifica` está puesta, antes de ese día la cuota es $0.
 * En frecuencia fecha, desde ese día se cobra el saldo hasta que lo paguen.
 */
export function cuotaAcuerdoHoy(a: AcuerdoActivo, fecha: string): number {
  const saldo = Math.max(Number(a.saldo) || 0, 0);
  if (saldo <= 0) return 0;
  if (!tocaAcuerdoHoy(a, fecha)) return 0;

  const freq = (a.frecuencia ?? "dia") as FrecuenciaAcuerdo;

  if (freq === "dia") {
    const q = esDomingo(fecha)
      ? Number(a.cuota_domingo) || 0
      : Number(a.cuota_diaria) || 0;
    return Math.min(Math.max(q, 0), saldo);
  }

  if (freq === "domingo") {
    const q = Number(a.cuota_diaria) || Number(a.cuota_domingo) || 0;
    return Math.min(Math.max(q, 0), saldo);
  }

  // Semana / quincena / mes / fecha: la cuota del período (o todo el saldo si es fecha y cuota=0).
  const q = Number(a.cuota_diaria) || 0;
  if (freq === "fecha" && q <= 0.009) return saldo;
  return Math.min(Math.max(q, 0), saldo);
}

/** El plan que se cobra: el primero que aún tiene saldo.
 *  El que sigue espera hasta que ese quede en cero. */
export function planQueCobra(acuerdos: AcuerdoActivo[]): AcuerdoActivo | null {
  return acuerdos.find((a) => Math.max(Number(a.saldo) || 0, 0) > 0.009) ?? null;
}

/**
 * El plan de adelante todavía se cobra el domingo (cuota de domingo, o
 * frecuencia domingo). Mientras eso siga, el concepto domingo del contrato
 * queda en cero y se retoma cuando este plan ya no cobre ese día.
 */
export function acuerdoCobraDomingo(
  a: {
    saldo: number;
    cuota_diaria?: number | null;
    cuota_domingo?: number | null;
    frecuencia?: string | null;
    fecha_especifica?: string | null;
  },
  fecha: string,
): boolean {
  if (!esDomingo(fecha)) return false;
  const saldo = Math.max(Number(a.saldo) || 0, 0);
  if (saldo <= 0.009) return false;
  const freq = (a.frecuencia ?? "dia") as FrecuenciaAcuerdo;
  if (freq !== "dia" && freq !== "domingo") return false;
  const como: AcuerdoActivo = {
    id: "",
    saldo,
    cuota_diaria: Math.max(Number(a.cuota_diaria) || 0, 0),
    cuota_domingo: a.cuota_domingo ?? null,
    descripcion: null,
    frecuencia: freq,
    fecha_especifica: a.fecha_especifica ?? null,
  };
  if (!tocaAcuerdoHoy(como, fecha)) return false;
  if (freq === "domingo") return cuotaAcuerdoHoy(como, fecha) > 0.009;
  return (Number(a.cuota_domingo) || 0) > 0.009;
}

/** El plan que se está cobrando pausa el domingo del contrato. */
export function domingoPausadoPorPlanes(
  planes: {
    saldo: number;
    cuotaDiaria?: number;
    cuotaDomingo?: number;
    frecuencia?: string;
    fecha?: string | null;
    cobra?: boolean;
  }[] | undefined,
  fecha: string,
): boolean {
  if (!planes?.length || !esDomingo(fecha)) return false;
  const plan = planes.find((p) => p.cobra) ?? planes.find((p) => p.saldo > 0.009);
  if (!plan) return false;
  return acuerdoCobraDomingo(
    {
      saldo: plan.saldo,
      cuota_diaria: plan.cuotaDiaria,
      cuota_domingo: plan.cuotaDomingo,
      frecuencia: plan.frecuencia,
      fecha_especifica: plan.fecha,
    },
    fecha,
  );
}

export function acuerdoHoyDe(acuerdos: AcuerdoActivo[], fecha: string): number {
  const plan = planQueCobra(acuerdos);
  return plan ? cuotaAcuerdoHoy(plan, fecha) : 0;
}

/**
 * Cuota de acuerdo que entra al cobro.
 * `atraso` es la cuota del día anterior que sigue sin pagar.
 * El total no pasa del saldo del plan.
 */
export function programadoAcuerdoDe(
  acuerdos: AcuerdoActivo[],
  fecha: string,
  atraso = 0,
): number {
  const plan = planQueCobra(acuerdos);
  const fresco = plan ? cuotaAcuerdoHoy(plan, fecha) : 0;
  const saldo = plan ? Math.max(Number(plan.saldo) || 0, 0) : 0;
  const bruto = Math.round((fresco + Math.max(atraso, 0)) * 100) / 100;
  return Math.min(Math.max(bruto, 0), saldo);
}

/** Texto corto para el panel / hints. */
export function resumenFrecuencia(a: {
  frecuencia?: FrecuenciaAcuerdo | null;
  fecha_especifica?: string | null;
  cuota_diaria?: number;
  cuota_domingo?: number | null;
}): string {
  const freq = (a.frecuencia ?? "dia") as FrecuenciaAcuerdo;
  const q = Number(a.cuota_diaria) || 0;
  const qDom = Number(a.cuota_domingo) || 0;
  if (freq === "dia") {
    const base = qDom > 0.009 ? `$${q}/día + $${qDom} domingo` : `$${q}/día`;
    const desde = a.fecha_especifica?.slice(0, 10);
    return desde ? `${base} desde ${desde}` : base;
  }
  if (freq === "domingo") {
    const desde = a.fecha_especifica?.slice(0, 10);
    return desde ? `$${q} los domingos desde ${desde}` : `$${q} los domingos`;
  }
  if (freq === "semana") {
    const dia = DIAS_SEMANA.find((d) => d.value === diaSemanaDeAncla(a.fecha_especifica));
    return `$${q} cada ${dia?.label.toLowerCase() ?? "semana"}`;
  }
  if (freq === "quincena") {
    const d = a.fecha_especifica ? Number(a.fecha_especifica.slice(8, 10)) : 1;
    return `$${q} quincenal (día ${d})`;
  }
  if (freq === "mes") {
    const d = a.fecha_especifica ? Number(a.fecha_especifica.slice(8, 10)) : 1;
    return `$${q} el día ${d} de cada mes`;
  }
  if (freq === "fecha") {
    return a.fecha_especifica ? `$${q || "saldo"} el ${a.fecha_especifica}` : `$${q} en fecha`;
  }
  return `$${q}`;
}

export function anclaPorDefecto(frecuencia: FrecuenciaAcuerdo, hoy = hoyPanama()): string | null {
  if (frecuencia === "dia" || frecuencia === "domingo") return null;
  if (frecuencia === "semana") return fechaConDiaSemana(hoy, 1);
  return hoy;
}
