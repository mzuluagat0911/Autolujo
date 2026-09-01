// Consultas de pagos por día (usa pagado_at + zona Panamá).
//
// Dos estados cuentan como PAGADO: `conciliado` (cruzado con el banco) y
// `manual` (registrado por el equipo en la oficina). Un comprobante recién
// llegado por WhatsApp queda en `pendiente`: todavía NO baja el saldo —eso es
// la barrera antifraude— pero tampoco puede tratarse como si el cliente no
// hubiera pagado, o se le cobra un recargo por dinero que ya envió.

import { createServerSupabase } from "@/lib/supabase/server";
import { rangoDiaPanama, esPagoPuntual } from "./fecha";
import { cuotaDeFecha, type TerminosCuota } from "./cuota";
import { acuerdoHoyDe, type AcuerdoActivo } from "./acuerdo";
import { cubrioCuotaDelDia } from "./cifras";

/** Estados que ya cuentan como dinero recibido. */
export const PAGADO = ["conciliado", "manual"] as const;

/** Contratos con al menos un pago ese día (puntual o tarde). */
export async function contratosConPagoEnDia(fecha: string): Promise<Set<string>> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("contrato_id")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  return new Set(
    ((data ?? []) as { contrato_id: string | null }[])
      .map((p) => p.contrato_id)
      .filter((id): id is string => Boolean(id)),
  );
}

/** Suma de abonos validados del día (antes o después de las 7). */
export async function montosDelDiaPorContrato(fecha: string): Promise<Map<string, number>> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("contrato_id, monto")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  const out = new Map<string, number>();
  for (const p of (data ?? []) as { contrato_id: string | null; monto: number }[]) {
    if (!p.contrato_id) continue;
    out.set(p.contrato_id, (out.get(p.contrato_id) ?? 0) + Number(p.monto));
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
    .select("contrato_id, monto, pagado_at")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  const out = new Map<string, number>();
  for (const p of (data ?? []) as { contrato_id: string | null; monto: number; pagado_at: string }[]) {
    if (!p.contrato_id || !esPagoPuntual(p.pagado_at, fecha)) continue;
    out.set(p.contrato_id, (out.get(p.contrato_id) ?? 0) + Number(p.monto));
  }
  return out;
}

/** Cuota del día + arreglo(s) = lo que hay que cubrir antes de las 7 para no perder los $5. */
export async function metasPuntualPorContrato(fecha: string): Promise<Map<string, number>> {
  const sb = createServerSupabase();
  const [{ data: contratos }, { data: acuerdos }] = await Promise.all([
    sb
      .from("contratos")
      .select("id, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
      .eq("estado", "activo"),
    sb
      .from("acuerdos")
      .select("id, contrato_id, saldo, cuota_diaria, cuota_domingo, descripcion")
      .eq("activo", true),
  ]);

  const porContrato = new Map<string, AcuerdoActivo[]>();
  for (const a of (acuerdos ?? []) as (AcuerdoActivo & { contrato_id: string })[]) {
    const list = porContrato.get(a.contrato_id) ?? [];
    list.push(a);
    porContrato.set(a.contrato_id, list);
  }

  const out = new Map<string, number>();
  for (const c of (contratos ?? []) as (TerminosCuota & { id: string })[]) {
    out.set(c.id, cuotaDeFecha(c, fecha) + acuerdoHoyDe(porContrato.get(c.id) ?? [], fecha));
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
};

/** Últimos pagos del contrato, de cualquier estado (el agente necesita verlos). */
export async function pagosRecientesContrato(
  contratoId: string,
  limite = 5,
): Promise<PagoReciente[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("monto, pagado_at, estado_conciliacion, origen")
    .eq("contrato_id", contratoId)
    .order("pagado_at", { ascending: false })
    .limit(limite);
  return ((data ?? []) as {
    monto: number;
    pagado_at: string;
    estado_conciliacion: string;
    origen: string | null;
  }[]).map((p) => ({
    monto: Number(p.monto),
    pagado_at: p.pagado_at,
    estado: p.estado_conciliacion,
    origen: p.origen,
  }));
}

/** Para un solo contrato: ¿pagó hoy? ¿cuánto, y cuánto fue antes de las 7? */
export async function pagoHoyContrato(
  contratoId: string,
  fecha: string,
): Promise<{ pagoHoy: boolean; pagado: number; pagadoPuntual: number }> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("monto, pagado_at")
    .eq("contrato_id", contratoId)
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString())
    .limit(50);
  const filas = (data ?? []) as { monto: number; pagado_at: string }[];
  let pagado = 0;
  let pagadoPuntual = 0;
  for (const p of filas) {
    const n = Number(p.monto) || 0;
    pagado += n;
    if (esPagoPuntual(p.pagado_at, fecha)) pagadoPuntual += n;
  }
  return { pagoHoy: pagado > 0.009, pagado, pagadoPuntual };
}
