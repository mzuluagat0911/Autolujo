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
    estado: String(formData.get("estado") ?? "activo"),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/cartera/vehiculos");
}
