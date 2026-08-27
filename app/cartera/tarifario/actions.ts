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

export async function createTarifa(formData: FormData): Promise<void> {
  const letra = num(formData.get("letra_diaria"));
  if (letra == null || letra <= 0) throw new Error("La letra diaria es obligatoria.");

  const empresa_id = str(formData.get("empresa_id")); // null = aplica a todas
  const sb = createServerSupabase();
  const { error } = await sb.from("tarifas").insert({
    empresa_id,
    modelo: str(formData.get("modelo")),
    anio: num(formData.get("anio")),
    km_min: num(formData.get("km_min")) ?? 0,
    km_max: num(formData.get("km_max")) ?? 2147483647,
    letra_diaria: letra,
    vigente: true,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/cartera/tarifario");
}
