import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";

export type FilaHistorialGps = {
  id_dispositivo: string;
  vehiculoId: string | null;
  etiqueta: string;
  km: number | null;
  fuente: string | null;
  alerta: string | null;
  latitud: number | null;
  longitud: number | null;
  direccion: string | null;
  gps_en_linea: boolean;
  kmMes: number;
};

export async function historialDelDia(fecha: string): Promise<FilaHistorialGps[]> {
  const sb = createServerSupabase();
  const mes = fecha.slice(0, 7);
  const [{ data, error }, mesRes] = await Promise.all([
    sb
      .from("gps_dias")
      .select("id_dispositivo, vehiculo_id, etiqueta, km, fuente, alerta, latitud, longitud, direccion, gps_en_linea")
      .eq("fecha", fecha)
      .order("etiqueta"),
    sb
      .from("gps_dias")
      .select("id_dispositivo, km")
      .gte("fecha", `${mes}-01`)
      .lte("fecha", fecha),
  ]);
  if (error) throw error;
  const acum = new Map<string, number>();
  for (const r of (mesRes.data ?? []) as { id_dispositivo: string; km: number | null }[]) {
    acum.set(r.id_dispositivo, (acum.get(r.id_dispositivo) ?? 0) + Number(r.km ?? 0));
  }
  return ((data ?? []) as {
    id_dispositivo: string;
    vehiculo_id: string | null;
    etiqueta: string | null;
    km: number | null;
    fuente: string | null;
    alerta: string | null;
    latitud: number | null;
    longitud: number | null;
    direccion: string | null;
    gps_en_linea: boolean | null;
  }[]).map((r) => ({
    id_dispositivo: r.id_dispositivo,
    vehiculoId: r.vehiculo_id,
    etiqueta: r.etiqueta ?? r.id_dispositivo,
    km: r.km == null ? null : Number(r.km),
    fuente: r.fuente,
    alerta: r.alerta,
    latitud: r.latitud,
    longitud: r.longitud,
    direccion: r.direccion,
    gps_en_linea: Boolean(r.gps_en_linea),
    kmMes: Math.round((acum.get(r.id_dispositivo) ?? 0) * 10) / 10,
  }));
}

export type PuntoSerie = { fecha: string; km: number | null; alerta: string | null };

export async function serieDispositivo(idDispositivo: string, hasta = hoyPanama(), dias = 14): Promise<PuntoSerie[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("gps_dias")
    .select("fecha, km, alerta")
    .eq("id_dispositivo", idDispositivo)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .limit(dias);
  if (error) throw error;
  return ((data ?? []) as { fecha: string; km: number | null; alerta: string | null }[])
    .map((r) => ({ fecha: r.fecha, km: r.km == null ? null : Number(r.km), alerta: r.alerta }))
    .reverse();
}
