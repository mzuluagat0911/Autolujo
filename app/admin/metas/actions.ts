"use server";

import { revalidatePath } from "next/cache";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { mesClave, upsertMetaCobranza } from "@/lib/cartera/metas-cobranza";

export type ResultadoMeta = { ok: boolean; msg: string };

async function soloAdmin() {
  const s = await sesionEquipo();
  if (!s || s.rol !== "admin") throw new Error("Solo el administrador.");
  return s;
}

export async function guardarMetaCobranza(
  _prev: ResultadoMeta | null,
  formData: FormData,
): Promise<ResultadoMeta> {
  const yo = await soloAdmin();
  const mesRaw = String(formData.get("mes") ?? "").trim();
  const metaRaw = String(formData.get("meta_100") ?? "").trim().replace(/,/g, "");
  const nota = String(formData.get("nota") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(mesRaw) && !/^\d{4}-\d{2}-\d{2}$/.test(mesRaw)) {
    return { ok: false, msg: "Elige el mes (AAAA-MM)." };
  }
  const meta100 = Number(metaRaw);
  if (!Number.isFinite(meta100) || meta100 <= 0) {
    return { ok: false, msg: "Indica la meta al 100% en dólares." };
  }

  const r = await upsertMetaCobranza({
    mes: mesClave(mesRaw),
    meta100,
    nota: nota || null,
    creadoPor: yo.id,
  });
  if (r.ok) {
    revalidatePath("/admin");
    revalidatePath("/admin/metas");
  }
  return r;
}
