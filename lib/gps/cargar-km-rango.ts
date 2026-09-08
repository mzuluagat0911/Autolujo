// Carga histórica de km vía Diacor `recorrido` (un día a la vez).
// El odómetro solo sirve para “hoy”; para septiembre atrás hay que pedir el
// recorrido. Escribe en gps_dias con fuente = "recorrido".

import { createServerSupabase } from "@/lib/supabase/server";
import { esDomingo, hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { diacorConfigurado, posicionesGps, recorridoDia, type PosicionGps } from "./diacor";
import { clasificarKmDia } from "./alertas-dia";
import { casarPosicion, vehiculoEnTaller, type VehiculoGps } from "./vincular";
import { cargarVehiculosGps } from "./revisar-dia";

const TANDA = 6;

export type ResumenCargaKm = {
  ok: boolean;
  error?: string;
  desde: string;
  hasta: string;
  dias: number;
  dispositivos: number;
  guardados: number;
  errores: number;
  kmTotal: number;
  porDia: { fecha: string; guardados: number; km: number; errores: number }[];
};

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

function rangoFechas(desde: string, hasta: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    throw new Error("Fechas inválidas (use YYYY-MM-DD).");
  }
  if (desde > hasta) throw new Error("El rango está al revés.");
  const out: string[] = [];
  let f = desde;
  while (f <= hasta) {
    out.push(f);
    f = sumarDias(f, 1);
    if (out.length > 62) throw new Error("Máximo 62 días por carga.");
  }
  return out;
}

function etiquetaDe(p: PosicionGps, v: VehiculoGps | null): string {
  if (v) return etiquetaCarroUi(v.empresa, v.numero);
  return p.nombre ?? p.placa ?? p.id_dispositivo;
}

/**
 * Pide a Diacor el km de cada dispositivo por cada día del rango y lo guarda
 * en gps_dias. No dispara alertas de “parado” (histórico).
 */
export async function cargarKmRango(
  desde: string,
  hasta: string = hoyPanama(),
): Promise<ResumenCargaKm> {
  const vacio = (error?: string): ResumenCargaKm => ({
    ok: false,
    error,
    desde,
    hasta,
    dias: 0,
    dispositivos: 0,
    guardados: 0,
    errores: 0,
    kmTotal: 0,
    porDia: [],
  });

  if (!diacorConfigurado()) {
    return vacio("Faltan DIACOR_USER y DIACOR_PASSWORD.");
  }

  let fechas: string[];
  try {
    fechas = rangoFechas(desde, hasta);
  } catch (e) {
    return vacio(e instanceof Error ? e.message : "Rango inválido.");
  }

  const [posiciones, vehiculos] = await Promise.all([posicionesGps(), cargarVehiculosGps()]);
  if (posiciones.length === 0) {
    return { ...vacio("Diacor no devolvió dispositivos."), desde, hasta, dias: fechas.length };
  }

  const parejas = posiciones.map((p) => ({ p, v: casarPosicion(p, vehiculos) }));
  const sb = createServerSupabase();
  const porDia: ResumenCargaKm["porDia"] = [];
  let guardados = 0;
  let errores = 0;
  let kmTotal = 0;

  for (const fecha of fechas) {
    const domingo = esDomingo(fecha);
    const reco = await enTandas(parejas, TANDA, async ({ p }) => {
      try {
        const r = await recorridoDia(p.id_dispositivo, fecha);
        return { id: p.id_dispositivo, km: r.km, error: false as const };
      } catch {
        return { id: p.id_dispositivo, km: null, error: true as const };
      }
    });
    const porId = new Map(reco.map((r) => [r.id, r]));

    let gDia = 0;
    let kmDia = 0;
    let errDia = 0;

    for (const { p, v } of parejas) {
      const r = porId.get(p.id_dispositivo);
      if (!r || r.error) {
        errDia++;
        errores++;
        continue;
      }
      const km = r.km;
      const clase = clasificarKmDia(km, domingo, vehiculoEnTaller(v));
      const alerta = clase === "exceso_km_dia" ? clase : null;
      const { error } = await sb.from("gps_dias").upsert(
        {
          fecha,
          id_dispositivo: p.id_dispositivo,
          vehiculo_id: v?.id ?? null,
          etiqueta: etiquetaDe(p, v),
          km,
          fuente: "recorrido",
          odometro_ini: null,
          odometro_fin: null,
          latitud: p.latitud,
          longitud: p.longitud,
          direccion: p.direccion,
          gps_en_linea: p.gps_en_linea,
          alerta,
          actualizado_at: new Date().toISOString(),
        },
        { onConflict: "fecha,id_dispositivo" },
      );
      if (error) {
        errDia++;
        errores++;
        continue;
      }
      gDia++;
      guardados++;
      if (km != null && Number.isFinite(km)) {
        kmDia += Number(km);
        kmTotal += Number(km);
      }
    }

    porDia.push({ fecha, guardados: gDia, km: Math.round(kmDia * 100) / 100, errores: errDia });
  }

  return {
    ok: true,
    desde,
    hasta,
    dias: fechas.length,
    dispositivos: parejas.length,
    guardados,
    errores,
    kmTotal: Math.round(kmTotal * 100) / 100,
    porDia,
  };
}

/** Primer día del mes en curso (Panamá) → hoy. */
export function rangoMesEnCurso(hoy = hoyPanama()): { desde: string; hasta: string } {
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}
