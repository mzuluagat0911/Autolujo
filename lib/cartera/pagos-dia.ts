// Consultas de pagos por día (usa pagado_at + zona Panamá).
//
// Dos estados cuentan como PAGADO: `conciliado` (cruzado con el banco) y
// `manual` (registrado por el equipo en la oficina). Un comprobante recién
// llegado por WhatsApp queda en `pendiente`: todavía NO baja el saldo —eso es
// la barrera antifraude— pero tampoco puede tratarse como si el cliente no
// hubiera pagado, o se le cobra un recargo por dinero que ya envió.

import { createServerSupabase } from "@/lib/supabase/server";
import { rangoDiaPanama, esPagoPuntual, partesPagoPanama, HORA_EXTRACTO, sumarDias } from "./fecha";
import { cuotaDeFecha, type TerminosCuota } from "./cuota";
import { cubrioCuotaDelDia } from "./cifras";
import { acuerdoHoyDe, type AcuerdoActivo } from "./acuerdo";
import type { AsignacionPago, ResultadoPago } from "./types";
import { montoQueCubreCuota } from "./salidas-aplicar";

/** Estados que ya cuentan como dinero recibido. */
export const PAGADO = ["conciliado", "manual"] as const;

/** Contratos con al menos un pago ese día (puntual o tarde). */
export async function contratosConPagoEnDia(fecha: string): Promise<Set<string>> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("contrato_id, monto, asignaciones, rubro, destino_interior")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  return new Set(
    ((data ?? []) as {
      contrato_id: string | null;
      monto: number;
      asignaciones?: unknown;
      rubro?: string | null;
      destino_interior?: string | null;
    }[])
      .filter((p) => p.contrato_id && montoQueCubreCuota(p) > 0.009)
      .map((p) => p.contrato_id as string),
  );
}

/** Suma de abonos validados del día (antes o después de las 7). */
export async function montosDelDiaPorContrato(fecha: string): Promise<Map<string, number>> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("contrato_id, monto, asignaciones, rubro, destino_interior")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  const out = new Map<string, number>();
  for (const p of (data ?? []) as {
    contrato_id: string | null;
    monto: number;
    asignaciones?: unknown;
    rubro?: string | null;
    destino_interior?: string | null;
  }[]) {
    if (!p.contrato_id) continue;
    const n = montoQueCubreCuota(p);
    if (n <= 0.009) continue;
    out.set(p.contrato_id, (out.get(p.contrato_id) ?? 0) + n);
  }
  return out;
}

/** Suma de abonos de hoy hechos ANTES de las 7:00 p.m. */
export async function montosPuntualesPorContrato(
  fecha: string,
): Promise<Map<string, number>> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("contrato_id, monto, pagado_at, asignaciones, rubro, destino_interior")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  const out = new Map<string, number>();
  for (const p of (data ?? []) as {
    contrato_id: string | null;
    monto: number;
    pagado_at: string;
    asignaciones?: unknown;
    rubro?: string | null;
    destino_interior?: string | null;
  }[]) {
    if (!p.contrato_id || !esPagoPuntual(p.pagado_at, fecha)) continue;
    const n = montoQueCubreCuota(p);
    if (n <= 0.009) continue;
    out.set(p.contrato_id, (out.get(p.contrato_id) ?? 0) + n);
  }
  return out;
}

/** Cuota/letra del día = lo que hay que cubrir antes de las 7 para no perder los $5.
 *  El acuerdo/arreglo es ítem extra (prioridad-extras): no define la multa de “no pago”. */
export async function metasPuntualPorContrato(fecha: string): Promise<Map<string, number>> {
  const sb = createServerSupabase();
  const { data: contratos } = await sb
    .from("contratos")
    .select("id, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .eq("estado", "activo");

  const out = new Map<string, number>();
  for (const c of (contratos ?? []) as (TerminosCuota & { id: string })[]) {
    out.set(c.id, cuotaDeFecha(c, fecha));
  }
  return out;
}

/** Contratos que SÍ cubrieron lo del día con abonos antes de las 7:00 p.m. */
export async function contratosQueCubrieronElDia(fecha: string): Promise<Set<string>> {
  const [montos, metas] = await Promise.all([
    montosPuntualesPorContrato(fecha),
    metasPuntualPorContrato(fecha),
  ]);
  const out = new Set<string>();
  for (const [id, meta] of metas) {
    if (cubrioCuotaDelDia(montos.get(id) ?? 0, meta)) out.add(id);
  }
  return out;
}

/**
 * Contratos con un comprobante de ese día esperando validación.
 * No bajan el saldo, pero sí congelan el recargo: el cliente ya mandó el
 * dinero y que nadie lo haya conciliado todavía es problema nuestro, no suyo.
 */
export async function contratosConComprobantePendienteEnDia(fecha: string): Promise<Set<string>> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("contrato_id")
    .eq("estado_conciliacion", "pendiente")
    .not("contrato_id", "is", null)
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  return new Set(
    ((data ?? []) as { contrato_id: string | null }[])
      .map((p) => p.contrato_id)
      .filter((id): id is string => Boolean(id)),
  );
}

/** Para un solo contrato: ¿mandó comprobante ese día y sigue sin validarse? */
export async function comprobantePendienteContrato(
  contratoId: string,
  fecha: string,
): Promise<{ pendiente: boolean; monto: number; hora: string | null }> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("monto, pagado_at")
    .eq("contrato_id", contratoId)
    .eq("estado_conciliacion", "pendiente")
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString())
    .order("pagado_at", { ascending: true });
  const filas = (data ?? []) as { monto: number; pagado_at: string }[];
  if (filas.length === 0) return { pendiente: false, monto: 0, hora: null };
  return {
    pendiente: true,
    monto: filas.reduce((a, p) => a + Number(p.monto ?? 0), 0),
    hora: filas[0].pagado_at,
  };
}

export type PagoReciente = {
  monto: number;
  pagado_at: string;
  estado: string;
  origen: string | null;
  asignaciones: AsignacionPago[];
};

function parseAsignacionesPago(raw: unknown): AsignacionPago[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw as AsignacionPago[];
  const o = raw as ResultadoPago;
  return Array.isArray(o.asignaciones) ? o.asignaciones : [];
}

/**
 * Cuánto del arreglo abonado hoy cubre la cuota de HOY.
 * Un pago antes de las 9:00 a.m., si ayer no se cubrió la cuota diaria,
 * abona ese día atrasado y no el de hoy.
 */
export function abonoAcuerdoQueCubreHoy(opts: {
  fechaHoy: string;
  cuotaAyer: number;
  abonoAyer: number;
  pagosHoy: { pagadoAt: string; aplicado: number }[];
}): number {
  let huecoAyer = Math.max(Math.round((opts.cuotaAyer - opts.abonoAyer) * 100) / 100, 0);
  let cubreHoy = 0;
  const ordered = [...opts.pagosHoy].sort((a, b) => a.pagadoAt.localeCompare(b.pagadoAt));
  for (const p of ordered) {
    let queda = Math.max(Number(p.aplicado) || 0, 0);
    if (queda <= 0.009) continue;
    const cuando = partesPagoPanama(p.pagadoAt);
    if (huecoAyer > 0.009 && cuando.fecha === opts.fechaHoy && cuando.hora < HORA_EXTRACTO) {
      const toma = Math.min(queda, huecoAyer);
      huecoAyer = Math.round((huecoAyer - toma) * 100) / 100;
      queda = Math.round((queda - toma) * 100) / 100;
    }
    cubreHoy = Math.round((cubreHoy + queda) * 100) / 100;
  }
  return cubreHoy;
}

function aplicadoAcuerdoDe(raw: unknown): number {
  return parseAsignacionesPago(raw)
    .filter((a) => a.tipo === "acuerdo")
    .reduce((s, a) => s + Number(a.aplicado || 0), 0);
}

/** Cuánto de los abonos validados de hoy ya se fue al arreglo de HOY. */
export async function aplicadoArregloHoyPorContrato(
  fecha: string,
): Promise<Map<string, number>> {
  const sb = createServerSupabase();
  const ayer = sumarDias(fecha, -1);
  const { desde } = rangoDiaPanama(ayer);
  const { hasta } = rangoDiaPanama(fecha);
  const { data, error } = await sb
    .from("pagos")
    .select("contrato_id, pagado_at, asignaciones")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  if (error) return new Map();
  const pagos = (data ?? []) as {
    contrato_id: string | null;
    pagado_at: string;
    asignaciones: unknown;
  }[];
  const ids = [...new Set(pagos.map((p) => p.contrato_id).filter(Boolean))] as string[];
  const cuotasAyer = new Map<string, number>();
  if (ids.length > 0) {
    const { data: planes } = await sb
      .from("acuerdos")
      .select("id, contrato_id, saldo, cuota_diaria, cuota_domingo, descripcion, frecuencia, fecha_especifica")
      .in("contrato_id", ids)
      .eq("activo", true);
    const porContrato = new Map<string, AcuerdoActivo[]>();
    for (const a of (planes ?? []) as (AcuerdoActivo & { contrato_id: string })[]) {
      const lista = porContrato.get(a.contrato_id) ?? [];
      lista.push(a);
      porContrato.set(a.contrato_id, lista);
    }
    for (const [id, lista] of porContrato) cuotasAyer.set(id, acuerdoHoyDe(lista, ayer));
  }
  const porId = new Map<string, { ayer: number; hoy: { pagadoAt: string; aplicado: number }[] }>();
  for (const p of pagos) {
    if (!p.contrato_id) continue;
    const aplicado = aplicadoAcuerdoDe(p.asignaciones);
    if (aplicado <= 0.009) continue;
    const slot = porId.get(p.contrato_id) ?? { ayer: 0, hoy: [] };
    const dia = partesPagoPanama(p.pagado_at).fecha;
    if (dia === ayer) slot.ayer = Math.round((slot.ayer + aplicado) * 100) / 100;
    else if (dia === fecha) slot.hoy.push({ pagadoAt: p.pagado_at, aplicado });
    porId.set(p.contrato_id, slot);
  }
  const out = new Map<string, number>();
  for (const [id, slot] of porId) {
    const cubre = abonoAcuerdoQueCubreHoy({
      fechaHoy: fecha,
      cuotaAyer: cuotasAyer.get(id) ?? 0,
      abonoAyer: slot.ayer,
      pagosHoy: slot.hoy,
    });
    if (cubre > 0.009) out.set(id, cubre);
  }
  return out;
}

export async function aplicadoArregloHoyContrato(
  contratoId: string,
  fecha: string,
): Promise<number> {
  const sb = createServerSupabase();
  const ayer = sumarDias(fecha, -1);
  const { desde } = rangoDiaPanama(ayer);
  const { hasta } = rangoDiaPanama(fecha);
  const { data, error } = await sb
    .from("pagos")
    .select("pagado_at, asignaciones")
    .eq("contrato_id", contratoId)
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  if (error || !data?.length) return 0;
  const { data: planes } = await sb
    .from("acuerdos")
    .select("id, saldo, cuota_diaria, cuota_domingo, descripcion, frecuencia, fecha_especifica")
    .eq("contrato_id", contratoId)
    .eq("activo", true);
  let abonoAyer = 0;
  const pagosHoy: { pagadoAt: string; aplicado: number }[] = [];
  for (const p of data as { pagado_at: string; asignaciones: unknown }[]) {
    const aplicado = aplicadoAcuerdoDe(p.asignaciones);
    if (aplicado <= 0.009) continue;
    const dia = partesPagoPanama(p.pagado_at).fecha;
    if (dia === ayer) abonoAyer = Math.round((abonoAyer + aplicado) * 100) / 100;
    else if (dia === fecha) pagosHoy.push({ pagadoAt: p.pagado_at, aplicado });
  }
  return abonoAcuerdoQueCubreHoy({
    fechaHoy: fecha,
    cuotaAyer: acuerdoHoyDe((planes ?? []) as AcuerdoActivo[], ayer),
    abonoAyer,
    pagosHoy,
  });
}

/** Últimos pagos del contrato, de cualquier estado (el agente necesita verlos). */
export async function pagosRecientesContrato(
  contratoId: string,
  limite = 5,
): Promise<PagoReciente[]> {
  const sb = createServerSupabase();
  let q = await sb
    .from("pagos")
    .select("monto, pagado_at, estado_conciliacion, origen, asignaciones")
    .eq("contrato_id", contratoId)
    .order("pagado_at", { ascending: false })
    .limit(limite);
  if (q.error && /asignaciones/i.test(q.error.message)) {
    // Reintento sin la columna `asignaciones` (aún no migrada). El tipo es más
    // angosto; lo igualamos al de la query principal — abajo se lee de forma
    // defensiva (asignaciones ausente → []), así que es seguro.
    q = (await sb
      .from("pagos")
      .select("monto, pagado_at, estado_conciliacion, origen")
      .eq("contrato_id", contratoId)
      .order("pagado_at", { ascending: false })
      .limit(limite)) as typeof q;
  }
  const data = q.data;
  return ((data ?? []) as {
    monto: number;
    pagado_at: string;
    estado_conciliacion: string;
    origen: string | null;
    asignaciones: unknown;
  }[]).map((p) => ({
    monto: Number(p.monto),
    pagado_at: p.pagado_at,
    estado: p.estado_conciliacion,
    origen: p.origen,
    asignaciones: parseAsignacionesPago(p.asignaciones),
  }));
}

/** Para un solo contrato: ¿pagó hoy? ¿cuánto, y cuánto fue antes de las 7? */
export async function pagoHoyContrato(
  contratoId: string,
  fecha: string,
): Promise<{
  pagoHoy: boolean;
  pagado: number;
  pagadoPuntual: number;
  pagadoCuota: number;
  pagadoPuntualCuota: number;
}> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("monto, pagado_at, asignaciones, rubro, destino_interior")
    .eq("contrato_id", contratoId)
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString())
    .limit(50);
  const filas = (data ?? []) as {
    monto: number;
    pagado_at: string;
    asignaciones?: unknown;
    rubro?: string | null;
    destino_interior?: string | null;
  }[];
  let pagado = 0;
  let pagadoPuntual = 0;
  let pagadoCuota = 0;
  let pagadoPuntualCuota = 0;
  for (const p of filas) {
    const n = Number(p.monto) || 0;
    const cuota = montoQueCubreCuota(p);
    pagado += n;
    pagadoCuota += cuota;
    if (esPagoPuntual(p.pagado_at, fecha)) {
      pagadoPuntual += n;
      pagadoPuntualCuota += cuota;
    }
  }
  return {
    pagoHoy: pagadoCuota > 0.009,
    pagado,
    pagadoPuntual,
    pagadoCuota,
    pagadoPuntualCuota,
  };
}
