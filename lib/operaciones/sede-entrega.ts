// Sede del carro = sucursal donde se entregó el contrato (evento Entrega).

import { createServerSupabase } from "@/lib/supabase/server";
import { nombreSucursal, sucursalId } from "@/lib/cartera/sucursal";

export type SedeTaller = "juan_diaz" | "chorrera";

export function etiquetaSedeTaller(sede: SedeTaller | string | null | undefined): string {
  if (sede === "chorrera" || /chorrera/i.test(String(sede ?? ""))) return "La Chorrera";
  if (sede === "juan_diaz" || /juan|panam/i.test(String(sede ?? ""))) return "Juan Díaz";
  return nombreSucursal(sede) ?? "Sin sede";
}

/** Última entrega con lugar del carro. Null si nunca se registró. */
export async function sedeEntregaDelCarro(vehiculoId: string): Promise<SedeTaller | null> {
  if (!vehiculoId) return null;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("vehiculo_eventos")
    .select("lugar, fecha")
    .eq("vehiculo_id", vehiculoId)
    .or("titulo.eq.Entrega,detalle.eq.entrega")
    .not("lugar", "is", null)
    .order("fecha", { ascending: false })
    .limit(8);
  for (const row of (data ?? []) as { lugar: string | null }[]) {
    const id = sucursalId(row.lugar);
    if (id) return id;
  }
  return null;
}

/** Mapa vehiculo_id → sede de entrega. */
export async function sedesEntregaDe(vehiculoIds: string[]): Promise<Map<string, SedeTaller>> {
  const out = new Map<string, SedeTaller>();
  const ids = [...new Set(vehiculoIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const { data } = await sb
      .from("vehiculo_eventos")
      .select("vehiculo_id, lugar, fecha")
      .in("vehiculo_id", chunk)
      .or("titulo.eq.Entrega,detalle.eq.entrega")
      .not("lugar", "is", null)
      .order("fecha", { ascending: false })
      .limit(2000);
    for (const row of (data ?? []) as { vehiculo_id: string; lugar: string | null }[]) {
      if (out.has(row.vehiculo_id)) continue;
      const id = sucursalId(row.lugar);
      if (id) out.set(row.vehiculo_id, id);
    }
  }
  return out;
}
