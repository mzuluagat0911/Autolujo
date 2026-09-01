// Consultas de pagos por día (usa pagado_at + zona Panamá).
//
// Dos estados cuentan como PAGADO: `conciliado` (cruzado con el banco) y
// `manual` (registrado por el equipo en la oficina). Un comprobante recién
// llegado por WhatsApp queda en `pendiente`: todavía NO baja el saldo —eso es
// la barrera antifraude— pero tampoco puede tratarse como si el cliente no
// hubiera pagado, o se le cobra un recargo por dinero que ya envió.

import { createServerSupabase } from "@/lib/supabase/server";
import { rangoDiaPanama, esPagoPuntual } from "./fecha";

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

/** Contratos que pagaron PUNTUAL ese día (antes de las 7:00 p.m.). */
export async function contratosConPagoPuntualEnDia(fecha: string): Promise<Set<string>> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("contrato_id, pagado_at")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());
  const out = new Set<string>();
  for (const p of (data ?? []) as { contrato_id: string | null; pagado_at: string }[]) {
    if (p.contrato_id && esPagoPuntual(p.pagado_at, fecha)) out.add(p.contrato_id);
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

/** Para un solo contrato: ¿pagó hoy? ¿fue puntual? */
export async function pagoHoyContrato(
  contratoId: string,
  fecha: string,
): Promise<{ pagoHoy: boolean; pagoPuntual: boolean }> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("pagado_at")
    .eq("contrato_id", contratoId)
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString())
    .limit(20);
  const filas = (data ?? []) as { pagado_at: string }[];
  return {
    pagoHoy: filas.length > 0,
    pagoPuntual: filas.some((p) => esPagoPuntual(p.pagado_at, fecha)),
  };
}
