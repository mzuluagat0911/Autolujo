// Cifras de cobranza del mes para el Resumen (/admin).
// Meta 100% viene de metas_cobranza (admin). Si no hay, estima letra × días hábiles.

import { createServerSupabase } from "@/lib/supabase/server";
import { cuotaDeFecha, type TerminosCuota } from "./cuota";
import { siglaEmpresa } from "./empresa";
import {
  diasHabilesEnRango,
  esDiaHabilCobranza,
  fechaLarga,
  finMes,
  hoyPanama,
  inicioMes,
  mesLargo,
  sumarDias,
} from "./fecha";
import { metaCobranzaDeMes } from "./metas-cobranza";
import { PAGADO } from "./pagos-dia";
import { montoQueCubreCuota } from "./salidas-aplicar";

export type FlotaPorEmpresa = { sigla: string; carros: number };

export type CierreMes = {
  etiqueta: string;
  recaudado: number;
  pctMeta: number | null;
  carros: number;
  metaAsignada: boolean;
};

export type ResumenCobranza = {
  fecha: string;
  fechaLarga: string;
  meta100: number;
  meta95: number;
  metaDiaria: number;
  metaNota: string | null;
  metaAsignada: boolean;
  diasHabilesMes: number;
  diasHabilesTranscurridos: number;
  recaudadoMtd: number;
  pctRecaudado: number;
  idealMtd: number;
  pctIdeal: number;
  gap100: number;
  gap100Pct: number;
  gap95: number;
  gap95Pct: number;
  flotaTotal: number;
  flota: FlotaPorEmpresa[];
  contratosActivos: number;
  cierres: CierreMes[];
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(parte: number, total: number): number {
  if (!(total > 0)) return 0;
  return r2((parte / total) * 100);
}

function diaLetraReferencia(hoy: string): string {
  if (esDiaHabilCobranza(hoy)) return hoy;
  return sumarDias(hoy, -1);
}

async function metaDiariaEstimada(fechaRef: string): Promise<number> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("contratos")
    .select("letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .eq("estado", "activo");
  if (error) throw error;
  let total = 0;
  for (const c of (data ?? []) as TerminosCuota[]) {
    total += cuotaDeFecha(c, fechaRef);
  }
  return r2(total);
}

async function cobradoEntre(desde: string, hasta: string): Promise<number> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("pagos")
    .select("monto, rubro, destino_interior, asignaciones, estado_conciliacion")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .in("estado_conciliacion", [...PAGADO]);
  if (error) throw error;
  let total = 0;
  for (const p of (data ?? []) as {
    monto: number;
    rubro?: string | null;
    destino_interior?: string | null;
    asignaciones?: unknown;
  }[]) {
    total += montoQueCubreCuota(p);
  }
  return r2(total);
}

async function flotaActual(): Promise<{ total: number; porEmpresa: FlotaPorEmpresa[]; contratos: number }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("contratos")
    .select("id, vehiculo:vehiculos!inner(id, empresa:empresas(codigo))")
    .eq("estado", "activo");
  if (error) throw error;

  const porCodigo = new Map<string, Set<string>>();
  const vehiculos = new Set<string>();
  let contratos = 0;
  for (const row of (data ?? []) as unknown as {
    id: string;
    vehiculo: { id: string; empresa: { codigo: string } | null } | null;
  }[]) {
    contratos++;
    const v = row.vehiculo;
    if (!v) continue;
    vehiculos.add(v.id);
    const sigla = siglaEmpresa(v.empresa?.codigo) || "?";
    const set = porCodigo.get(sigla) ?? new Set<string>();
    set.add(v.id);
    porCodigo.set(sigla, set);
  }

  const orden = ["AL", "KW", "GD"];
  const porEmpresa: FlotaPorEmpresa[] = [];
  for (const s of orden) {
    const n = porCodigo.get(s)?.size ?? 0;
    if (n > 0 || orden.includes(s)) porEmpresa.push({ sigla: s, carros: n });
    porCodigo.delete(s);
  }
  for (const [sigla, set] of porCodigo) {
    porEmpresa.push({ sigla, carros: set.size });
  }

  return { total: vehiculos.size, porEmpresa, contratos };
}

async function meta100DeMes(
  mesRef: string,
  diasHabiles: number,
  metaDiariaFallback: number,
): Promise<{ meta100: number; asignada: boolean; nota: string | null }> {
  const asignada = await metaCobranzaDeMes(mesRef);
  if (asignada && asignada.meta100 > 0) {
    return { meta100: r2(asignada.meta100), asignada: true, nota: asignada.nota };
  }
  return {
    meta100: r2(metaDiariaFallback * diasHabiles),
    asignada: false,
    nota: null,
  };
}

async function cierreDeMes(
  mesRef: string,
  metaDiariaFallback: number,
  carrosActuales: number,
): Promise<CierreMes> {
  const desde = inicioMes(mesRef);
  const hasta = finMes(mesRef);
  const dias = diasHabilesEnRango(desde, hasta);
  const { meta100, asignada } = await meta100DeMes(desde, dias, metaDiariaFallback);
  const recaudado = await cobradoEntre(desde, hasta);
  return {
    etiqueta: mesLargo(desde),
    recaudado,
    pctMeta: meta100 > 0 ? pct(recaudado, meta100) : null,
    carros: carrosActuales,
    metaAsignada: asignada,
  };
}

/**
 * Tablero de cobranza del mes en curso (Panamá).
 * Preferencia: meta cargada por admin; si no hay, estima letra × días hábiles.
 */
export async function resumenCobranzaHoy(): Promise<ResumenCobranza> {
  const hoy = hoyPanama();
  const mesInicio = inicioMes(hoy);
  const mesFin = finMes(hoy);
  const refLetra = diaLetraReferencia(hoy);

  const diasHabilesMes = diasHabilesEnRango(mesInicio, mesFin);
  const ayer = sumarDias(hoy, -1);
  const diasHabilesTranscurridos =
    ayer < mesInicio ? 0 : diasHabilesEnRango(mesInicio, ayer > mesFin ? mesFin : ayer);

  const [estimadaDiaria, recaudadoMtd, flota, metaMes] = await Promise.all([
    metaDiariaEstimada(refLetra),
    cobradoEntre(mesInicio, hoy),
    flotaActual(),
    metaCobranzaDeMes(mesInicio),
  ]);

  const metaAsignada = Boolean(metaMes && metaMes.meta100 > 0);
  const meta100 = metaAsignada ? r2(metaMes!.meta100) : r2(estimadaDiaria * diasHabilesMes);
  const meta95 = r2(meta100 * 0.95);
  const metaDiaria = diasHabilesMes > 0 ? r2(meta100 / diasHabilesMes) : 0;
  const frac = diasHabilesMes > 0 ? diasHabilesTranscurridos / diasHabilesMes : 0;
  const idealMtd = r2(meta100 * frac);
  const ideal95 = r2(meta95 * frac);

  const gap100 = r2(recaudadoMtd - idealMtd);
  const gap95 = r2(recaudadoMtd - ideal95);

  const mesAnt = inicioMes(sumarDias(mesInicio, -1));
  const [y, mesNum] = mesInicio.split("-").map(Number);
  const mesAntAnio = `${y - 1}-${String(mesNum).padStart(2, "0")}-01`;
  const cierres = await Promise.all([
    cierreDeMes(mesAnt, estimadaDiaria, flota.total),
    cierreDeMes(mesAntAnio, estimadaDiaria, flota.total),
  ]);

  return {
    fecha: hoy,
    fechaLarga: `${fechaLarga(hoy)} ${hoy.slice(0, 4)}`,
    meta100,
    meta95,
    metaDiaria,
    metaNota: metaMes?.nota ?? null,
    metaAsignada,
    diasHabilesMes,
    diasHabilesTranscurridos,
    recaudadoMtd,
    pctRecaudado: pct(recaudadoMtd, meta100),
    idealMtd,
    pctIdeal: pct(idealMtd, meta100),
    gap100,
    gap100Pct: pct(gap100, meta100),
    gap95,
    gap95Pct: pct(gap95, meta95),
    flotaTotal: flota.total,
    flota: flota.porEmpresa,
    contratosActivos: flota.contratos,
    cierres,
  };
}

export function money2(n: number): string {
  return new Intl.NumberFormat("es-PA", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function pctTxt(n: number): string {
  return `${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
