// Sucursal de entrega o devolución. Se guarda en el lugar del evento.

import { createServerSupabase } from "@/lib/supabase/server";

export const SUCURSALES = [
  { id: "juan_diaz", nombre: "Juan Díaz" },
  { id: "chorrera", nombre: "La Chorrera" },
] as const;

export function nombreSucursal(valor: string | null | undefined): string | null {
  const q = (valor ?? "").trim().toLowerCase();
  if (!q) return null;
  if (q === "juan_diaz" || /juan/.test(q)) return "Juan Díaz";
  if (q === "chorrera" || /chorrera/.test(q)) return "La Chorrera";
  return (valor ?? "").trim() || null;
}

export function etiquetaSucursal(valor: string | null | undefined): string {
  return nombreSucursal(valor) ?? "Sin sucursal";
}

export function sucursalId(valor: string | null | undefined): "juan_diaz" | "chorrera" | null {
  const nombre = nombreSucursal(valor);
  if (nombre === "Juan Díaz") return "juan_diaz";
  if (nombre === "La Chorrera") return "chorrera";
  return null;
}

/** Deja constancia de en qué sucursal se entregó el carro. No tumba el alta si falla. */
export async function registrarEntrega(
  vehiculoId: string,
  fecha: string,
  sucursal: string | null | undefined,
): Promise<void> {
  const lugar = nombreSucursal(sucursal);
  if (!vehiculoId || !lugar || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
  const sb = createServerSupabase();
  const { error } = await sb.from("vehiculo_eventos").insert({
    vehiculo_id: vehiculoId,
    fecha,
    tipo: "contrato",
    titulo: "Entrega",
    detalle: "entrega",
    lugar,
    origen: "manual",
  });
  if (error) console.error("[entrega] sucursal", error.message);
}
