"use server";

import { revalidatePath } from "next/cache";
import { invalidarLecturaEstados } from "@/lib/cartera/estado-cuenta-cache";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { guardarAlcance } from "@/lib/cartera/alcance";

export type ResultadoAlcance = { ok: boolean; msg: string };

async function soloAdmin() {
  const s = await sesionEquipo();
  if (!s || s.rol !== "admin") throw new Error("Solo el administrador.");
  return s;
}

export async function guardarAlcanceCartera(
  _prev: ResultadoAlcance | null,
  formData: FormData,
): Promise<ResultadoAlcance> {
  const yo = await soloAdmin();
  const modo = String(formData.get("modo") ?? "todas").trim();
  let empresaIds: string[] = [];

  if (modo === "piloto") {
    empresaIds = formData
      .getAll("empresa_id")
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (empresaIds.length === 0) {
      return { ok: false, msg: "Marca al menos una empresa, o elige «Todas»." };
    }
  }

  const r = await guardarAlcance({
    empresaIds,
    updatedBy: yo.id,
  });
  if (r.ok) {
    revalidatePath("/admin");
    revalidatePath("/admin/alcance");
    revalidatePath("/cartera");
    revalidatePath("/cartera/estados-cuenta");
    revalidatePath("/cartera/por-llamar");
    invalidarLecturaEstados();
  }
  return r;
}
