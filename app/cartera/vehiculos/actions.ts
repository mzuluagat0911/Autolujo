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
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
};

/** Guarda ficha de varias filas a la vez (solo campos enviados). */
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
    const patch: Record<string, string | number | null> = {};
    if ("placa" in c) {
      patch.placa = c.placa == null ? null : String(c.placa).trim().toUpperCase() || null;
    }
    if ("gps_id" in c) {
      patch.gps_id = c.gps_id == null ? null : String(c.gps_id).trim() || null;
    }
    if ("marca" in c) {
      patch.marca = c.marca == null ? null : String(c.marca).trim() || null;
    }
    if ("modelo" in c) {
      patch.modelo = c.modelo == null ? null : String(c.modelo).trim() || null;
    }
    if ("anio" in c) {
      const a = c.anio == null || c.anio === ("" as unknown) ? null : Number(c.anio);
      patch.anio = a != null && Number.isFinite(a) ? a : null;
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

/** Rellena placa vacía con la que reporta Diacor para el gps_id amarrado. */
export async function completarPlacasDesdeDiacor(): Promise<ResultadoMasivo> {
  const { diacorConfigurado, posicionesGps } = await import("@/lib/gps/diacor");
  const { normalizarPlaca } = await import("@/lib/gps/vincular");
  if (!diacorConfigurado()) {
    return { ok: false, msg: "Diacor no está configurado en el servidor.", actualizados: 0 };
  }

  function placaOk(raw: string | null | undefined): string | null {
    const p = normalizarPlaca(raw);
    if (!/^[A-Z]{1,3}\d{3,4}$/.test(p)) return null;
    return p;
  }

  try {
    const sb = createServerSupabase();
    const [{ data: veh }, posiciones] = await Promise.all([
      sb.from("vehiculos").select("id, placa, gps_id").neq("estado", "entregado"),
      posicionesGps(),
    ]);
    const porGps = new Map(posiciones.map((p) => [p.id_dispositivo, p]));
    let n = 0;
    for (const v of (veh ?? []) as { id: string; placa: string | null; gps_id: string | null }[]) {
      if (placaOk(v.placa) || !v.gps_id) continue;
      const placa = placaOk(porGps.get(v.gps_id)?.placa ?? null);
      if (!placa) continue;
      const { error } = await sb.from("vehiculos").update({ placa }).eq("id", v.id);
      if (!error) n++;
    }
    revalidatePath("/cartera/vehiculos");
    revalidatePath("/cartera/rastreo");
    return {
      ok: true,
      msg: n === 0 ? "Ninguna placa nueva en Diacor para carros sin placa." : `Completé ${n} placa${n === 1 ? "" : "s"} desde Diacor.`,
      actualizados: n,
    };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : "No pude leer Diacor.", actualizados: 0 };
  }
}

/** Guarda el km de hoy (odómetro / Diacor) y lo suma al mes en gps_dias. */
export async function actualizarKmHoy(): Promise<ResultadoMasivo> {
  const { diacorConfigurado } = await import("@/lib/gps/diacor");
  const { revisarGpsDelDia } = await import("@/lib/gps/revisar-dia");
  if (!diacorConfigurado()) {
    return { ok: false, msg: "Diacor no está configurado en el servidor.", actualizados: 0 };
  }
  try {
    const r = await revisarGpsDelDia(undefined, { alertarParado: false });
    revalidatePath("/cartera/vehiculos");
    revalidatePath("/cartera/rastreo");
    return {
      ok: true,
      msg: `Km de hoy: ${r.revisados} carros (${r.porOdometro} odómetro, ${r.porRecorrido} Diacor).`,
      actualizados: r.revisados,
    };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : "No pude actualizar km.", actualizados: 0 };
  }
}

/**
 * Una sola vez / huecos: pide a Diacor el recorrido 1 del mes → hoy.
 * El día a día lo lleva el cron; esto solo rellena lo que falte del mes.
 */
export async function rellenarKmDelMes(): Promise<ResultadoMasivo> {
  const { diacorConfigurado } = await import("@/lib/gps/diacor");
  const { cargarKmRango, rangoMesEnCurso } = await import("@/lib/gps/cargar-km-rango");
  if (!diacorConfigurado()) {
    return { ok: false, msg: "Diacor no está configurado en el servidor.", actualizados: 0 };
  }
  try {
    const { desde, hasta } = rangoMesEnCurso();
    const r = await cargarKmRango(desde, hasta);
    revalidatePath("/cartera/vehiculos");
    revalidatePath("/cartera/rastreo");
    if (!r.ok) return { ok: false, msg: r.error ?? "No pude rellenar el mes.", actualizados: 0 };
    return {
      ok: true,
      msg: `Mes ${desde}→${hasta}: ${r.guardados} lecturas, ${Math.round(r.kmTotal).toLocaleString("es-PA")} km.`,
      actualizados: r.guardados,
    };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : "No pude rellenar el mes.", actualizados: 0 };
  }
}
