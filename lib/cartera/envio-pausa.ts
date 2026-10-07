// AutoLujo y Kowua ya están en cartera, pero todavía no se les escribe.
// El mensaje de bienvenida y los extractos se prenden cuando Kowua quede cargada.
// Gold no entra aquí.

import { createServerSupabase } from "@/lib/supabase/server";

const PAUSA = new Set(["AUTOLUJO", "KOWUA"]);

export function envioPausado(codigo: string | null | undefined): boolean {
  return PAUSA.has(String(codigo ?? "").trim().toUpperCase());
}

export async function envioPausadoContrato(contratoId: string | null | undefined): Promise<boolean> {
  if (!contratoId) return false;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("contratos")
    .select("vehiculo:vehiculos(empresa:empresas(codigo))")
    .eq("id", contratoId)
    .maybeSingle();
  const veh = (data as { vehiculo?: { empresa?: { codigo?: string | null } | null } | null } | null)
    ?.vehiculo;
  return envioPausado(veh?.empresa?.codigo);
}

export async function envioPausadoVehiculo(vehiculoId: string | null | undefined): Promise<boolean> {
  if (!vehiculoId) return false;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("vehiculos")
    .select("empresa:empresas(codigo)")
    .eq("id", vehiculoId)
    .maybeSingle();
  const emp = (data as { empresa?: { codigo?: string | null } | null } | null)?.empresa;
  return envioPausado(emp?.codigo);
}

export async function envioPausadoConversacion(conversacionId: string): Promise<boolean> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("conversaciones")
    .select("contrato_id, vehiculo_id")
    .eq("id", conversacionId)
    .maybeSingle();
  const row = data as { contrato_id: string | null; vehiculo_id: string | null } | null;
  if (!row) return false;
  if (row.contrato_id && (await envioPausadoContrato(row.contrato_id))) return true;
  return envioPausadoVehiculo(row.vehiculo_id);
}
