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
  alertas: { id: string; titulo: string; motivo: string }[];
  historial: FilaHistorialGps[];
  fechaHistorial: string;
  error: string | null;
};

export async function cargarTableroRastreo(fechaHist?: string): Promise<TableroRastreo> {
  const fecha = fechaHist && /^\d{4}-\d{2}-\d{2}$/.test(fechaHist) ? fechaHist : hoyPanama();
  const vacio: TableroRastreo = {
    configurado: diacorConfigurado(),
    filas: [],
    sinVincular: 0,
    enLinea: 0,
    porVincular: 0,
    alertas: [],
    historial: [],
    fechaHistorial: fecha,
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
    return {
      configurado: true,
      filas,
      sinVincular: filas.filter((f) => !f.vehiculoId).length,
      enLinea: filas.filter((f) => f.gps_en_linea).length,
      porVincular: sugerenciasVinculo(posiciones, vehiculos).length,
      alertas,
      historial,
      fechaHistorial: fecha,
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
  if (!diacorConfigurado()) return { ok: false, vinculados: 0, error: "Diacor no está configurado." };
  try {
    const [posiciones, vehiculos] = await Promise.all([posicionesGps(), cargarVehiculosGps()]);
    const sug = sugerenciasVinculo(posiciones, vehiculos);
    if (sug.length === 0) return { ok: true, vinculados: 0, error: null };
    const sb = createServerSupabase();
    for (const s of sug) {
      const { error } = await sb.from("vehiculos").update({ gps_id: s.gps_id }).eq("id", s.vehiculoId);
      if (error) throw error;
    }
    revalidatePath("/cartera/rastreo");
    revalidatePath("/cartera/vehiculos");
    return { ok: true, vinculados: sug.length, error: null };
  } catch (e) {
    return { ok: false, vinculados: 0, error: e instanceof Error ? e.message : "No pude vincular." };
  }
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
