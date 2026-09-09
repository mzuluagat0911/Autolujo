"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { diacorConfigurado, DiacorError, posicionesGps } from "@/lib/gps/diacor";
import { armarFilas, sugerenciasVinculo } from "@/lib/gps/vincular";
import { alertasGpsPendientes, cargarVehiculosGps, revisarGpsDelDia } from "@/lib/gps/revisar-dia";
import { historialDelDia, serieDispositivo, type FilaHistorialGps, type PuntoSerie } from "@/lib/gps/historico";
import { hoyPanama } from "@/lib/cartera/fecha";

export type TableroRastreo = {
  configurado: boolean;
  filas: ReturnType<typeof armarFilas>;
  sinVincular: number;
  enLinea: number;
  porVincular: number;
  enMovimiento: number;
  detenidos: number;
  sinSenal: number;
  alertas: { id: string; titulo: string; motivo: string }[];
  historial: FilaHistorialGps[];
  fechaHistorial: string;
  cargadoAt: string;
  error: string | null;
};

export async function cargarTableroRastreo(fechaHist?: string): Promise<TableroRastreo> {
  const fecha = fechaHist && /^\d{4}-\d{2}-\d{2}$/.test(fechaHist) ? fechaHist : hoyPanama();
  const { estadoGps } = await import("@/lib/gps/ui");
  const vacio: TableroRastreo = {
    configurado: diacorConfigurado(),
    filas: [],
    sinVincular: 0,
    enLinea: 0,
    porVincular: 0,
    enMovimiento: 0,
    detenidos: 0,
    sinSenal: 0,
    alertas: [],
    historial: [],
    fechaHistorial: fecha,
    cargadoAt: new Date().toISOString(),
    error: null,
  };
  if (!vacio.configurado) {
    return { ...vacio, error: "Faltan DIACOR_USER y DIACOR_PASSWORD en el entorno." };
  }
  try {
    const [posiciones, vehiculos, alertas, historial] = await Promise.all([
      posicionesGps(),
      cargarVehiculosGps(),
      alertasGpsPendientes(),
      historialDelDia(fecha).catch(() => [] as FilaHistorialGps[]),
    ]);
    const filas = armarFilas(posiciones, vehiculos);
    let mov = 0;
    let det = 0;
    let sin = 0;
    for (const f of filas) {
      const e = estadoGps(f);
      if (e === "movimiento") mov += 1;
      else if (e === "detenido") det += 1;
      else sin += 1;
    }
    return {
      configurado: true,
      filas,
      sinVincular: filas.filter((f) => !f.vehiculoId).length,
      enLinea: mov + det,
      porVincular: sugerenciasVinculo(posiciones, vehiculos).length,
      enMovimiento: mov,
      detenidos: det,
      sinSenal: sin,
      alertas,
      historial,
      fechaHistorial: fecha,
      cargadoAt: new Date().toISOString(),
      error: null,
    };
  } catch (e) {
    const msg = e instanceof DiacorError ? e.message : e instanceof Error ? e.message : "No pude leer Diacor.";
    return { ...vacio, error: msg };
  }
}

export async function cargarHistorialFecha(fecha: string): Promise<FilaHistorialGps[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return [];
  try {
    return await historialDelDia(fecha);
  } catch {
    return [];
  }
}

export async function cargarSerieGps(idDispositivo: string, hasta: string): Promise<PuntoSerie[]> {
  try {
    return await serieDispositivo(idDispositivo, hasta, 14);
  } catch {
    return [];
  }
}

export async function vincularPorPlaca(): Promise<{ ok: boolean; vinculados: number; error: string | null }> {
  try {
    let deDiacor = 0;
    if (diacorConfigurado()) {
      const [posiciones, vehiculos] = await Promise.all([posicionesGps(), cargarVehiculosGps()]);
      const sug = sugerenciasVinculo(posiciones, vehiculos);
      const sb = createServerSupabase();
      for (const s of sug) {
        const { error } = await sb.from("vehiculos").update({ gps_id: s.gps_id }).eq("id", s.vehiculoId);
        if (error) throw error;
      }
      deDiacor = sug.length;
    }
    const extra = await amarrarDesdeHistorico();
    revalidatePath("/cartera/rastreo");
    revalidatePath("/cartera/vehiculos");
    return { ok: true, vinculados: deDiacor + extra, error: null };
  } catch (e) {
    return { ok: false, vinculados: 0, error: e instanceof Error ? e.message : "No pude vincular." };
  }
}

/** Si el cron ya cruzó dispositivo↔carro, copia el id a vehiculos.gps_id. */
export async function amarrarDesdeHistorico(): Promise<number> {
  const sb = createServerSupabase();
  const { data: sin } = await sb
    .from("vehiculos")
    .select("id")
    .is("gps_id", null)
    .neq("estado", "entregado");
  const faltan = new Set(((sin ?? []) as { id: string }[]).map((v) => v.id));
  if (faltan.size === 0) return 0;

  const usados = new Set<string>();
  const { data: ya } = await sb.from("vehiculos").select("gps_id").not("gps_id", "is", null);
  for (const r of (ya ?? []) as { gps_id: string | null }[]) {
    if (r.gps_id) usados.add(r.gps_id);
  }

  const { data: dias } = await sb
    .from("gps_dias")
    .select("vehiculo_id, id_dispositivo")
    .not("vehiculo_id", "is", null)
    .order("fecha", { ascending: false })
    .limit(4000);

  const pares = new Map<string, string>();
  for (const r of (dias ?? []) as { vehiculo_id: string; id_dispositivo: string }[]) {
    if (!faltan.has(r.vehiculo_id) || pares.has(r.vehiculo_id)) continue;
    if (!r.id_dispositivo || usados.has(r.id_dispositivo)) continue;
    pares.set(r.vehiculo_id, r.id_dispositivo);
    usados.add(r.id_dispositivo);
  }

  if (pares.size === 0) {
    const { data: pos } = await sb
      .from("gps_posiciones")
      .select("vehiculo_id, id_dispositivo")
      .not("vehiculo_id", "is", null)
      .order("tomado_at", { ascending: false })
      .limit(4000);
    for (const r of (pos ?? []) as { vehiculo_id: string; id_dispositivo: string }[]) {
      if (!faltan.has(r.vehiculo_id) || pares.has(r.vehiculo_id)) continue;
      if (!r.id_dispositivo || usados.has(r.id_dispositivo)) continue;
      pares.set(r.vehiculo_id, r.id_dispositivo);
      usados.add(r.id_dispositivo);
    }
  }

  let n = 0;
  for (const [vehiculoId, gpsId] of pares) {
    const { error } = await sb.from("vehiculos").update({ gps_id: gpsId }).eq("id", vehiculoId).is("gps_id", null);
    if (!error) n++;
  }
  return n;
}

export async function revisarRecorridoHoy(): Promise<{
  ok: boolean;
  excesos: number;
  parados: number;
  porOdometro: number;
  porRecorrido: number;
  error: string | null;
}> {
  if (!diacorConfigurado()) {
    return { ok: false, excesos: 0, parados: 0, porOdometro: 0, porRecorrido: 0, error: "Diacor no está configurado." };
  }
  try {
    const r = await revisarGpsDelDia(undefined, { alertarParado: true });
    revalidatePath("/cartera/rastreo");
    return {
      ok: true,
      excesos: r.excesos,
      parados: r.parados,
      porOdometro: r.porOdometro,
      porRecorrido: r.porRecorrido,
      error: null,
    };
  } catch (e) {
    return {
      ok: false, excesos: 0, parados: 0, porOdometro: 0, porRecorrido: 0,
      error: e instanceof Error ? e.message : "No pude revisar.",
    };
  }
}

/** Pide a Diacor el km de cada día del mes en curso (1 → hoy) y lo guarda. */
export async function cargarKmDelMes(): Promise<{
  ok: boolean;
  desde: string;
  hasta: string;
  guardados: number;
  errores: number;
  kmTotal: number;
  error: string | null;
}> {
  const { cargarKmRango, rangoMesEnCurso } = await import("@/lib/gps/cargar-km-rango");
  if (!diacorConfigurado()) {
    return {
      ok: false, desde: "", hasta: "", guardados: 0, errores: 0, kmTotal: 0,
      error: "Diacor no está configurado.",
    };
  }
  try {
    const { desde, hasta } = rangoMesEnCurso();
    const r = await cargarKmRango(desde, hasta);
    revalidatePath("/cartera/rastreo");
    revalidatePath("/cartera/vehiculos");
    return {
      ok: r.ok,
      desde: r.desde,
      hasta: r.hasta,
      guardados: r.guardados,
      errores: r.errores,
      kmTotal: r.kmTotal,
      error: r.error ?? null,
    };
  } catch (e) {
    return {
      ok: false, desde: "", hasta: "", guardados: 0, errores: 0, kmTotal: 0,
      error: e instanceof Error ? e.message : "No pude cargar el mes.",
    };
  }
}
