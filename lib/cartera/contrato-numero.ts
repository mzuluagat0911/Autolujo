import type { SupabaseClient } from "@supabase/supabase-js";

/** Número de 6 dígitos del contrato. Lo asigna una sola vez. */
export async function numeroDeContrato(sb: SupabaseClient, contratoId: string): Promise<string | null> {
  const leido = await sb.from("contratos").select("numero_contrato").eq("id", contratoId).maybeSingle();
  if (leido.error) return null;
  const actual = (leido.data as { numero_contrato?: string | null } | null)?.numero_contrato?.trim();
  if (actual) return actual;

  const rpc = await sb.rpc("siguiente_numero_contrato", { p_id: contratoId });
  if (rpc.error || rpc.data == null || rpc.data === "") return null;
  return String(rpc.data);
}
