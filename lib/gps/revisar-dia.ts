import { createServerSupabase } from "@/lib/supabase/server";
import { esDomingo, hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import { diacorConfigurado, posicionesGps, recorridoDia, type PosicionGps } from "./diacor";
import { clasificarKmDia, textoAlertaGps, type TipoAlertaGps } from "./alertas-dia";
import { casarPosicion, vehiculoEnTaller, type VehiculoGps } from "./vincular";
import { kmDesdeOdometro, odometroUtil } from "./km-dia";
import { cruzarGpsConSalidas } from "./cruce-salida";

const TANDA = 6;

export async function cargarVehiculosGps(): Promise<VehiculoGps[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("id, numero, placa, gps_id, estado, empresa:empresas(codigo)")
    .neq("estado", "entregado");
  if (error) throw error;
  return ((data ?? []) as unknown as {
    id: string;
    numero: string;
    placa: string | null;
    gps_id: string | null;
    estado: string | null;
    empresa: { codigo: string } | null;
  }[]).map((v) => ({
    id: v.id,
    numero: v.numero,
    placa: v.placa,
    gps_id: v.gps_id,
    estado: v.estado,
    empresa: v.empresa?.codigo ?? null,
  }));
}

async function enTandas<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, Math.max(items.length, 1)) }, () => worker()));
  return out;
}

function etiquetaDe(p: PosicionGps, v: VehiculoGps | null): string {
  if (v) return `${v.empresa ? `${v.empresa} · ` : ""}${v.numero}`;
  return p.nombre ?? p.placa ?? p.id_dispositivo;
}

async function odometrosAyer(fecha: string): Promise<Map<string, number>> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("gps_dias")
    .select("id_dispositivo, odometro_fin")
    .eq("fecha", sumarDias(fecha, -1));
  if (error) return new Map();
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { id_dispositivo: string; odometro_fin: number | null }[]) {
    const o = odometroUtil(r.odometro_fin);
    if (o != null) m.set(r.id_dispositivo, o);
  }
  return m;
}

async function primerOdometroHoy(fecha: string): Promise<Map<string, number>> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("gps_posiciones")
    .select("id_dispositivo, odometro, tomado_at")
    .eq("fecha", fecha)
    .order("tomado_at", { ascending: true });
  if (error) return new Map();
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { id_dispositivo: string; odometro: number | null }[]) {
    if (m.has(r.id_dispositivo)) continue;
    const o = odometroUtil(r.odometro);
    if (o != null) m.set(r.id_dispositivo, o);
  }
  return m;
}

async function guardarPosiciones(
  fecha: string,
  filas: { p: PosicionGps; v: VehiculoGps | null }[],
): Promise<void> {
  const sb = createServerSupabase();
  const ahora = new Date().toISOString();
  const rows = filas.map(({ p, v }) => ({
    tomado_at: ahora,
    fecha,
    id_dispositivo: p.id_dispositivo,
    vehiculo_id: v?.id ?? null,
    latitud: p.latitud,
    longitud: p.longitud,
    velocidad: p.velocidad,
    direccion: p.direccion,
    odometro: p.odometro,
    gps_en_linea: p.gps_en_linea,
    encendido: p.encendido,
    etiqueta: etiquetaDe(p, v),
  }));
  for (let i = 0; i < rows.length; i += 120) {
    const { error } = await sb.from("gps_posiciones").insert(rows.slice(i, i + 120));
    if (error) throw error;
  }
}

export type ResumenRevisionGps = {
  fecha: string;
  revisados: number;
  porOdometro: number;
  porRecorrido: number;
  excesos: number;
  parados: number;
  errores: number;
};

export type OpcionesRevision = {
  /** De día: alerta solo exceso. De noche: también los parados. */
  alertarParado?: boolean;
};

/** Una lectura de toda la flota, histórico del día y alertas. Casi todo sale del odómetro. */
export async function revisarGpsDelDia(
  fecha = hoyPanama(),
  opts: OpcionesRevision = {},
): Promise<ResumenRevisionGps> {
  const vacio: ResumenRevisionGps = {
    fecha, revisados: 0, porOdometro: 0, porRecorrido: 0, excesos: 0, parados: 0, errores: 0,
  };
  if (!diacorConfigurado()) return vacio;

  const alertarParado = opts.alertarParado ?? true;
  const [posiciones, vehiculos, ayer, primerHoy] = await Promise.all([
    posicionesGps(),
    cargarVehiculosGps(),
    odometrosAyer(fecha),
    primerOdometroHoy(fecha),
  ]);
  const domingo = esDomingo(fecha);
  const sb = createServerSupabase();
  const parejas = posiciones.map((p) => ({ p, v: casarPosicion(p, vehiculos) }));

  try {
    await guardarPosiciones(fecha, parejas);
  } catch {
    /* la tabla 0018 puede no estar: igual intentamos alertas */
  }

  const faltaRecorrido = parejas.filter(({ p }) => {
    const fin = odometroUtil(p.odometro);
    const ini = primerHoy.get(p.id_dispositivo) ?? ayer.get(p.id_dispositivo) ?? null;
    return kmDesdeOdometro(ini, fin) == null;
  });

  const porRecorrido = new Map<string, number | null>();
  const reco = await enTandas(faltaRecorrido, TANDA, async ({ p }) => {
    try {
      const r = await recorridoDia(p.id_dispositivo, fecha);
      return { id: p.id_dispositivo, km: r.km, error: false as const };
    } catch {
      return { id: p.id_dispositivo, km: null, error: true as const };
    }
  });

  let errores = 0;
  for (const r of reco) {
    if (r.error) errores++;
    porRecorrido.set(r.id, r.km);
  }

  let excesos = 0;
  let parados = 0;
  let nOdo = 0;
  let nRec = 0;

  for (const { p, v } of parejas) {
    const fin = odometroUtil(p.odometro);
    const ini = primerHoy.get(p.id_dispositivo) ?? ayer.get(p.id_dispositivo) ?? null;
    let km = kmDesdeOdometro(ini, fin);
    let fuente: "odometro" | "recorrido" | null = km != null ? "odometro" : null;
    if (km != null) nOdo++;
    else if (porRecorrido.has(p.id_dispositivo)) {
      km = porRecorrido.get(p.id_dispositivo) ?? null;
      fuente = "recorrido";
      nRec++;
    }

    const clase = clasificarKmDia(km, domingo, vehiculoEnTaller(v));
    const alerta = clase === "exceso_km_dia" || (clase === "sin_recorrido" && alertarParado) ? clase : null;
    if (alerta === "exceso_km_dia") excesos++;
    if (alerta === "sin_recorrido") parados++;

    const etiqueta = etiquetaDe(p, v);
    const { error: diaErr } = await sb.from("gps_dias").upsert(
      {
        fecha,
        id_dispositivo: p.id_dispositivo,
        vehiculo_id: v?.id ?? null,
        etiqueta,
        km,
        fuente,
        odometro_ini: ini,
        odometro_fin: fin,
        latitud: p.latitud,
        longitud: p.longitud,
        direccion: p.direccion,
        gps_en_linea: p.gps_en_linea,
        alerta,
        actualizado_at: new Date().toISOString(),
      },
      { onConflict: "fecha,id_dispositivo" },
    );
    if (diaErr) errores++;

    if (alerta) {
      const { error: alErr } = await sb.from("gps_alertas").upsert(
        {
          fecha,
          tipo: alerta,
          id_dispositivo: p.id_dispositivo,
          vehiculo_id: v?.id ?? null,
          etiqueta,
          km,
        },
        { onConflict: "fecha,id_dispositivo,tipo" },
      );
      if (alErr) errores++;
    }
  }

  try {
    await cruzarGpsConSalidas(fecha, posiciones, vehiculos);
  } catch (e) {
    console.error("[gps] cruce salidas", e);
  }

  return {
    fecha,
    revisados: posiciones.length,
    porOdometro: nOdo,
    porRecorrido: nRec,
    excesos,
    parados,
    errores,
  };
}

export async function alertasGpsPendientes(): Promise<{
  id: string;
  titulo: string;
  motivo: string;
  desde: string;
  tipo: TipoAlertaGps;
}[]> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("gps_alertas")
      .select("id, tipo, etiqueta, km, created_at")
      .is("vista_at", null)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw error;
    return ((data ?? []) as {
      id: string;
      tipo: TipoAlertaGps;
      etiqueta: string | null;
      km: number | null;
      created_at: string;
    }[]).map((a) => ({
      id: `gps:${a.id}`,
      titulo: a.etiqueta ? `Carro ${a.etiqueta}` : "GPS",
      motivo: textoAlertaGps(a.tipo, a.km == null ? null : Number(a.km)),
      desde: a.created_at,
      tipo: a.tipo,
    }));
  } catch {
    return [];
  }
}

export async function marcarAlertaGpsVista(id: string): Promise<void> {
  const raw = id.startsWith("gps:") ? id.slice(4) : id;
  const sb = createServerSupabase();
  await sb.from("gps_alertas").update({ vista_at: new Date().toISOString() }).eq("id", raw);
}
