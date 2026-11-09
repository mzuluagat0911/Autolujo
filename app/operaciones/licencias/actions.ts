"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

export async function actualizarVencimientoLicencia(
  clienteId: string,
  fecha: string,
): Promise<{ ok: boolean; msg: string }> {
  const id = String(clienteId ?? "").trim();
  const vence = String(fecha ?? "").trim();
  if (!id) return { ok: false, msg: "Falta el cliente." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vence)) return { ok: false, msg: "La fecha no es válida." };
  const sb = createServerSupabase();
  const { error } = await sb
    .from("clientes")
    .update({ fecha_vencimiento_licencia: vence })
    .eq("id", id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath("/operaciones/licencias");
  revalidatePath("/operaciones");
  revalidatePath(`/cartera/clientes/${id}`);
  return { ok: true, msg: "Fecha actualizada." };
}
