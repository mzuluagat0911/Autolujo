"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { TIPOS_EVENTO, type TipoEventoHv, type EventoHv } from "@/lib/operaciones/hoja-vida";

export type AccionResultado = { ok: boolean; error?: string };

const TIPOS = new Set(TIPOS_EVENTO.map((t) => t.value));

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function tipoOk(v: FormDataEntryValue | null): TipoEventoHv {
  const s = String(v ?? "otro").trim() as TipoEventoHv;
  return TIPOS.has(s) ? s : "otro";
}

function revalidar(vehiculoId: string) {
  revalidatePath("/operaciones/hoja-vida");
  revalidatePath(`/operaciones/hoja-vida/${vehiculoId}`);
  revalidatePath("/operaciones");
  revalidatePath("/cartera/vehiculos");
}

/** Si el evento es mantenimiento, actualiza el ancla del carro. */
async function syncAnclaMantenimiento(
  vehiculoId: string,
  tipo: TipoEventoHv,
  fecha: string,
  km: number | null,
) {
  if (tipo !== "mantenimiento") return;
  const sb = createServerSupabase();
  const patch: Record<string, string | number | null> = {
    fecha_ultimo_mantenimiento: fecha,
  };
  if (km != null) patch.km_ultimo_mantenimiento = Math.round(km);
  await sb.from("vehiculos").update(patch).eq("id", vehiculoId);
}

export async function crearEvento(fd: FormData): Promise<AccionResultado> {
  const vehiculoId = String(fd.get("vehiculo_id") ?? "").trim();
  const fecha = String(fd.get("fecha") ?? "").trim();
  if (!vehiculoId) return { ok: false, error: "Falta el carro." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida." };

  const tipo = tipoOk(fd.get("tipo"));
  const km = num(fd.get("km"));
  const titulo = str(fd.get("titulo"));
  const detalle = str(fd.get("detalle"));
  const lugar = str(fd.get("lugar"));
  const valor = num(fd.get("valor"));

  if (!titulo && !detalle) {
    return { ok: false, error: "Poné un título o el detalle del evento." };
  }

  const sb = createServerSupabase();
  const { error } = await sb.from("vehiculo_eventos").insert({
    vehiculo_id: vehiculoId,
    fecha,
    km,
    tipo,
    titulo,
    detalle,
    lugar,
    valor,
    origen: "manual",
  });
  if (error) return { ok: false, error: error.message };

  await syncAnclaMantenimiento(vehiculoId, tipo, fecha, km);
  revalidar(vehiculoId);
  return { ok: true };
}

export async function actualizarEvento(fd: FormData): Promise<AccionResultado> {
  const id = String(fd.get("id") ?? "").trim();
  const vehiculoId = String(fd.get("vehiculo_id") ?? "").trim();
  const fecha = String(fd.get("fecha") ?? "").trim();
  if (!id || !vehiculoId) return { ok: false, error: "Falta el evento." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida." };

  const tipo = tipoOk(fd.get("tipo"));
  const km = num(fd.get("km"));
  const titulo = str(fd.get("titulo"));
  const detalle = str(fd.get("detalle"));
  const lugar = str(fd.get("lugar"));
  const valor = num(fd.get("valor"));

  if (!titulo && !detalle) {
    return { ok: false, error: "Poné un título o el detalle del evento." };
  }

  const sb = createServerSupabase();
  const { error } = await sb
    .from("vehiculo_eventos")
    .update({
      fecha,
      km,
      tipo,
      titulo,
      detalle,
      lugar,
      valor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("vehiculo_id", vehiculoId);
  if (error) return { ok: false, error: error.message };

  await syncAnclaMantenimiento(vehiculoId, tipo, fecha, km);
  revalidar(vehiculoId);
  return { ok: true };
}

export async function borrarEvento(fd: FormData): Promise<AccionResultado> {
  const id = String(fd.get("id") ?? "").trim();
  const vehiculoId = String(fd.get("vehiculo_id") ?? "").trim();
  if (!id || !vehiculoId) return { ok: false, error: "Falta el evento." };

  const sb = createServerSupabase();
  const { error } = await sb
    .from("vehiculo_eventos")
    .delete()
    .eq("id", id)
    .eq("vehiculo_id", vehiculoId);
  if (error) return { ok: false, error: error.message };

  revalidar(vehiculoId);
  return { ok: true };
}

export async function listarEventos(vehiculoId: string): Promise<EventoHv[]> {
  const sb = createServerSupabase();
  const out: EventoHv[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("vehiculo_eventos")
      .select("*")
      .eq("vehiculo_id", vehiculoId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      if (/vehiculo_eventos|does not exist|schema cache/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    const batch = (data as EventoHv[]) ?? [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
