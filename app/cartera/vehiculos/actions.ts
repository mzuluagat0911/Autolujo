"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createVehiculo(formData: FormData): Promise<void> {
  const empresa_id = String(formData.get("empresa_id") ?? "");
  const numero = String(formData.get("numero") ?? "").trim();
  if (!empresa_id) throw new Error("Selecciona la empresa.");
  if (!numero) throw new Error("El número de carro es obligatorio.");

  const sb = createServerSupabase();
  const { error } = await sb.from("vehiculos").insert({
    empresa_id,
    numero,
    placa: str(formData.get("placa")),
    marca: str(formData.get("marca")),
    modelo: str(formData.get("modelo")),
    anio: num(formData.get("anio")),
    km_actual: num(formData.get("km_actual")) ?? 0,
    gps_id: str(formData.get("gps_id")),
    panapass: str(formData.get("panapass")),
    estado: String(formData.get("estado") ?? "activo"),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/cartera/vehiculos");
}

export type ResultadoMasivo = { ok: boolean; msg: string; actualizados: number };

export type CambioVehiculo = {
  id: string;
  placa?: string | null;
  gps_id?: string | null;
};

/** Guarda placa / gps_id de varias filas a la vez (solo campos enviados). */
export async function guardarEdicionMasiva(cambios: CambioVehiculo[]): Promise<ResultadoMasivo> {
  if (!Array.isArray(cambios) || cambios.length === 0) {
    return { ok: false, msg: "No hay cambios.", actualizados: 0 };
  }
  if (cambios.length > 400) {
    return { ok: false, msg: "Máximo 400 filas por tanda.", actualizados: 0 };
  }

  const sb = createServerSupabase();
  let actualizados = 0;
  const errores: string[] = [];

  for (const c of cambios) {
    const id = String(c.id ?? "").trim();
    if (!id) continue;
    const patch: Record<string, string | null> = {};
    if ("placa" in c) {
      const p = c.placa == null ? null : String(c.placa).trim().toUpperCase() || null;
      patch.placa = p;
    }
    if ("gps_id" in c) {
      const g = c.gps_id == null ? null : String(c.gps_id).trim() || null;
      patch.gps_id = g;
    }
    if (Object.keys(patch).length === 0) continue;
    const { error } = await sb.from("vehiculos").update(patch).eq("id", id);
    if (error) errores.push(error.message);
    else actualizados++;
  }

  revalidatePath("/cartera/vehiculos");
  revalidatePath("/cartera/rastreo");
  if (errores.length && actualizados === 0) {
    return { ok: false, msg: errores[0]!, actualizados: 0 };
  }
  return {
    ok: true,
    msg: errores.length
      ? `Guardé ${actualizados}. Algunos fallaron: ${errores[0]}`
      : `Guardé ${actualizados} carro${actualizados === 1 ? "" : "s"}.`,
    actualizados,
  };
}
