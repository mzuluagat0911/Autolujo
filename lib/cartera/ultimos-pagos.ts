import { createServerSupabase } from "@/lib/supabase/server";
import type { UltimoPago } from "./estado-csv";

/** Último pago que ya cuenta (conciliado o de oficina), por contrato. */
export async function ultimosPagosPorContrato(
  ids: string[],
): Promise<Record<string, UltimoPago>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const out: Record<string, UltimoPago> = {};
  if (unicos.length === 0) return out;
  const sb = createServerSupabase();
  const TAM = 80;

  for (let i = 0; i < unicos.length; i += TAM) {
    const grupo = unicos.slice(i, i + TAM);
    const vistos = new Set<string>();
    for (let desde = 0; desde < 20000; desde += 1000) {
      const { data, error } = await sb
        .from("pagos")
        .select("contrato_id, fecha, monto, pagado_at")
        .in("contrato_id", grupo)
        .in("estado_conciliacion", ["conciliado", "manual"])
        .order("pagado_at", { ascending: false, nullsFirst: false })
        .range(desde, desde + 999);
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as {
        contrato_id: string | null;
        fecha: string | null;
        monto: number | null;
      }[];
      for (const p of filas) {
        if (!p.contrato_id || vistos.has(p.contrato_id)) continue;
        vistos.add(p.contrato_id);
        out[p.contrato_id] = {
          fecha: String(p.fecha ?? "").slice(0, 10),
          monto: Number(p.monto) || 0,
        };
      }
      if (filas.length < 1000 || vistos.size >= grupo.length) break;
    }
  }
  return out;
}
