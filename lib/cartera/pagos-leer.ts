import { createServerSupabase } from "@/lib/supabase/server";
import type { PagoConciliado } from "./pagos-puente";

export async function leerPagosDirecto(ids: string[]): Promise<PagoConciliado[]> {
  if (ids.length === 0) return [];
  const sb = createServerSupabase();
  const rows: PagoConciliado[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb
      .from("pagos")
      .select("id, contrato_id, fecha, monto, rubro, asignaciones")
      .in("contrato_id", ids)
      .in("estado_conciliacion", ["conciliado", "manual"])
      .order("id", { ascending: true })
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as PagoConciliado[];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}
