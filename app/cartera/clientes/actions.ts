"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export async function createCliente(formData: FormData): Promise<void> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("El nombre es obligatorio.");

  const sb = createServerSupabase();
  const { error } = await sb.from("clientes").insert({
    nombre,
    cedula: str(formData.get("cedula")),
    telefono: str(formData.get("telefono")),
    whatsapp: str(formData.get("whatsapp")),
    mayor_de_25: formData.get("mayor_de_25") === "on",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/cartera/clientes");
}
