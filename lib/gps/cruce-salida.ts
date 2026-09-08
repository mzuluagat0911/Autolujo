// Cruza la posición GPS del día con las salidas autorizadas vigentes.

import { createServerSupabase } from "@/lib/supabase/server";
import { clasificarZona, cruzarPuntoConSalida } from "@/lib/cartera/salidas-geo";
import { upsertAlertaSalida } from "@/lib/cartera/salidas-aplicar";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { vehiculoEnTaller, type VehiculoGps } from "./vincular";
import type { PosicionGps } from "./diacor";

export async function cruzarGpsConSalidas(
  fecha: string,
  posiciones: PosicionGps[],
  vehiculos: VehiculoGps[],
): Promise<{ desvios: number; sinAval: number }> {
  let desvios = 0;
  let sinAval = 0;
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("salidas_autorizadas")
      .select("id, vehiculo_id, destino, destino_id, fecha, fecha_hasta, estado")
      .lte("fecha", fecha)
      .neq("estado", "rechazada");
    if (error) return { desvios: 0, sinAval: 0 };

    const vigentes = ((data ?? []) as {
      id: string;
      vehiculo_id: string | null;
      destino: string;
      destino_id: string;
      fecha: string;
      fecha_hasta: string | null;
      estado: string;
    }[]).filter((s) => {
      const hasta = s.fecha_hasta ?? s.fecha;
      return s.fecha <= fecha && fecha <= hasta && s.estado !== "rechazada";
    });

    const porVeh = new Map<string, (typeof vigentes)[0]>();
    for (const s of vigentes) {
      if (s.vehiculo_id && !porVeh.has(s.vehiculo_id)) porVeh.set(s.vehiculo_id, s);
    }

    const porGps = new Map(vehiculos.filter((v) => v.gps_id).map((v) => [v.gps_id as string, v]));
    /** Vehículos que SÍ están en interior sin aval (para no cerrar su alerta). */
    const enInteriorSinAval = new Set<string>();

    for (const p of posiciones) {
      const v = (p.id_dispositivo && porGps.get(p.id_dispositivo)) || null;
      if (!v || vehiculoEnTaller(v)) continue;
      const salida = porVeh.get(v.id);
      const etiqueta = etiquetaCarroUi(v.empresa, v.numero);

      if (salida) {
        const cruce = cruzarPuntoConSalida(p.latitud, p.longitud, salida.destino_id, salida.destino);
        await sb
          .from("salidas_autorizadas")
          .update({
            gps_estado: cruce.tipo,
            gps_nota: "nota" in cruce ? cruce.nota : null,
            gps_lat: p.latitud,
            gps_lng: p.longitud,
            gps_at: new Date().toISOString(),
          })
          .eq("id", salida.id);

        if (cruce.tipo === "desvio") {
          desvios++;
          await upsertAlertaSalida({
            fecha,
            tipo: "gps_desvio",
            salidaId: salida.id,
            vehiculoId: v.id,
            etiqueta,
            motivo: cruce.nota,
          });
        } else if (cruce.tipo === "otro_interior") {
          await upsertAlertaSalida({
            fecha,
            tipo: "gps_otro",
            salidaId: salida.id,
            vehiculoId: v.id,
            etiqueta,
            motivo: cruce.nota,
          });
        }
        continue;
      }

      // Solo provincias interior conocidas (Coclé, Santiago, David…). Ciudad / borde ≠ alerta.
      if (p.latitud == null || p.longitud == null) continue;
      const zona = clasificarZona(p.latitud, p.longitud);
      if (!zona?.interior) continue;

      sinAval++;
      enInteriorSinAval.add(v.id);
      await upsertAlertaSalida({
        fecha,
        tipo: "gps_sin_aval",
        vehiculoId: v.id,
        etiqueta,
        motivo: `GPS en ${zona.nombre} y no hay salida autorizada hoy para el carro ${v.numero}.`,
      });
    }

    // Cierra falsas alarmas del día: estaban “en interior” por el bug de zona desconocida.
    const { data: abiertas } = await sb
      .from("salidas_alertas")
      .select("id, vehiculo_id")
      .eq("fecha", fecha)
      .eq("tipo", "gps_sin_aval")
      .is("vista_at", null);
    const ahora = new Date().toISOString();
    for (const a of (abiertas ?? []) as { id: string; vehiculo_id: string | null }[]) {
      if (!a.vehiculo_id || enInteriorSinAval.has(a.vehiculo_id)) continue;
      await sb.from("salidas_alertas").update({ vista_at: ahora }).eq("id", a.id);
    }

    return { desvios, sinAval };
  } catch (e) {
    console.error("[gps] cruce salida", e);
    return { desvios: 0, sinAval: 0 };
  }
}
