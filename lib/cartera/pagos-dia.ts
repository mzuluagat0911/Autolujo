// Consultas de pagos por día (usa pagado_at + zona Panamá).

import { createServerSupabase } from "@/lib/supabase/server";
import { rangoDiaPanama, esPagoPuntual } from "./fecha";

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
