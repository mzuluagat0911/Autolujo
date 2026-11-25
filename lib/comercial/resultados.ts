import { createServerSupabase } from "@/lib/supabase/server";
import {
  finMes,
  hoyPanama,
  inicioMes,
  instantePanama,
  mesLargo,
  sumarDias,
} from "@/lib/cartera/fecha";
import { listarAsesoresComerciales } from "./chats";

export type FilaResultado = { nombre: string; leads: number; citas: number; ganados: number };

export type PeriodoResultados = "hoy" | "mes" | "mes_ant" | "rango";

export type RangoResultados = {
  periodo: PeriodoResultados;
  desde: string;
  hasta: string;
  etiqueta: string;
};

export type ResumenComercial = {
  leads: number;
  conCita: number;
  visitas: number;
  ganados: number;
  perdidos: number;
  vencidos: number;
  calientes: number;
  tibios: number;
  frios: number;
  cadencia: { uno: number; dos: number; tres: number };
  entregas: { enviados: number; entregados: number; leidos: number };
  primeraRespuestaMin: number | null;
  porCampana: FilaResultado[];
  porAsesor: FilaResultado[];
  seguimientos: { enviados: number; pendientes: number };
  rango: RangoResultados | null;
  error: string | null;
};

type Lead = {
  etapa: string;
  temperatura: string;
  anuncio: string | null;
  asesor_id: string | null;
  created_at: string;
  primera_respuesta_at?: string | null;
  seguimiento_at: string | null;
  cerrado_at: string | null;
  intentos_seguimiento?: number | null;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function medianaMinutos(valores: number[]): number | null {
  const limpios = valores.filter((n) => n >= 0).sort((a, b) => a - b);
  if (!limpios.length) return null;
  const medio = Math.floor(limpios.length / 2);
  const valor = limpios.length % 2 ? limpios[medio]! : (limpios[medio - 1]! + limpios[medio]!) / 2;
  return Math.round(valor);
}

/** Arma el rango desde query (?periodo=&desde=&hasta=). Por defecto: mes en curso. */
export function resolverRangoResultados(opts?: {
  periodo?: string | null;
  desde?: string | null;
  hasta?: string | null;
}): RangoResultados {
  const hoy = hoyPanama();
  const periodo = (opts?.periodo ?? "mes").trim().toLowerCase();

  if (periodo === "hoy") {
    return { periodo: "hoy", desde: hoy, hasta: hoy, etiqueta: "Hoy" };
  }
  if (periodo === "mes_ant") {
    const ant = inicioMes(sumarDias(inicioMes(hoy), -1));
    return {
      periodo: "mes_ant",
      desde: ant,
      hasta: finMes(ant),
      etiqueta: mesLargo(ant),
    };
  }
  if (periodo === "rango") {
    let desde = FECHA.test(opts?.desde ?? "") ? (opts!.desde as string) : inicioMes(hoy);
    let hasta = FECHA.test(opts?.hasta ?? "") ? (opts!.hasta as string) : hoy;
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    if (hasta > hoy) hasta = hoy;
    return {
      periodo: "rango",
      desde,
      hasta,
      etiqueta: desde === hasta ? desde : `${desde} → ${hasta}`,
    };
  }

  return {
    periodo: "mes",
    desde: inicioMes(hoy),
    hasta: hoy,
    etiqueta: mesLargo(hoy),
  };
}

/** Límites ISO (Panamá) para filtrar created_at / enviado_at. hasta es inclusivo. */
export function limitesIsoRango(desde: string, hasta: string): { gte: string; lt: string } {
  return {
    gte: instantePanama(desde, 0, 0).toISOString(),
    lt: instantePanama(sumarDias(hasta, 1), 0, 0).toISOString(),
  };
}

function vacio(rango: RangoResultados | null, error: string | null = null): ResumenComercial {
  return {
    leads: 0,
    conCita: 0,
    visitas: 0,
    ganados: 0,
    perdidos: 0,
    vencidos: 0,
    calientes: 0,
    tibios: 0,
    frios: 0,
    cadencia: { uno: 0, dos: 0, tres: 0 },
    entregas: { enviados: 0, entregados: 0, leidos: 0 },
    primeraRespuestaMin: null,
    porCampana: [],
    porAsesor: [],
    seguimientos: { enviados: 0, pendientes: 0 },
    rango,
    error,
  };
}

/**
 * Resumen comercial. Sin `rango` = todo el historial (admin).
 * Con rango = leads y envíos creados entre desde y hasta (días de Panamá).
 */
export async function resumenComercial(rango?: RangoResultados | null): Promise<ResumenComercial> {
  const rangoActivo = rango ?? null;
  try {
    const sb = createServerSupabase();
    const { cuadrarGanadosConContratos } = await import("./cierre-contrato");
    await cuadrarGanadosConContratos();
    const ahoraIso = new Date().toISOString();
    const lim =
      rangoActivo != null ? limitesIsoRango(rangoActivo.desde, rangoActivo.hasta) : null;

    const enRango = (q: any) => {
      if (!lim) return q;
      return q.gte("created_at", lim.gte).lt("created_at", lim.lt);
    };

    const contarLeads = async (aplicar: (q: any) => any): Promise<number | null> => {
      const { count, error } = await aplicar(
        enRango(sb.from("conversaciones_comercial").select("id", { count: "exact", head: true })),
      );
      if (error) return null;
      return count ?? 0;
    };
    const abiertos = (q: any) => q.is("cerrado_at", null);

    const [
      leadsTotal,
      conCitaN,
      visitasN,
      ganadosN,
      perdidosN,
      calientesN,
      tibiosN,
      friosN,
      cad1,
      cad2,
      cad3,
      vencidosN,
    ] = await Promise.all([
      contarLeads((q) => q),
      contarLeads((q) => q.in("etapa", ["cita", "visito", "ganado"])),
      contarLeads((q) => q.in("etapa", ["visito", "ganado"])),
      contarLeads((q) => q.eq("etapa", "ganado")),
      contarLeads((q) => q.eq("etapa", "perdido")),
      contarLeads((q) => abiertos(q).eq("temperatura", "caliente")),
      contarLeads((q) => abiertos(q).eq("temperatura", "tibio")),
      contarLeads((q) => abiertos(q).eq("temperatura", "frio")),
      contarLeads((q) => abiertos(q).eq("intentos_seguimiento", 1)),
      contarLeads((q) => abiertos(q).eq("intentos_seguimiento", 2)),
      contarLeads((q) => abiertos(q).eq("intentos_seguimiento", 3)),
      contarLeads((q) => abiertos(q).lt("seguimiento_at", ahoraIso)),
    ]);
    if (leadsTotal == null) {
      return vacio(rangoActivo, "Falta aplicar la migración 0039 para ver resultados.");
    }

    const nombres = new Map((await listarAsesoresComerciales()).map((a) => [a.id, a.nombre]));
    const campanas = new Map<string, FilaResultado>();
    const asesores = new Map<string, FilaResultado>();
    const suma = (map: Map<string, FilaResultado>, nombre: string, campo: keyof FilaResultado) => {
      const fila = map.get(nombre) ?? { nombre, leads: 0, citas: 0, ganados: 0 };
      if (campo !== "nombre") fila[campo] += 1;
      map.set(nombre, fila);
    };
    const minutos: number[] = [];
    for (let desde = 0; desde < 8000; desde += 1000) {
      let q = sb
        .from("conversaciones_comercial")
        .select("etapa, anuncio, asesor_id, created_at, primera_respuesta_at")
        .order("created_at", { ascending: false })
        .range(desde, desde + 999);
      if (lim) q = q.gte("created_at", lim.gte).lt("created_at", lim.lt);
      const { data, error } = await q;
      if (error && /primera_respuesta_at/i.test(error.message)) {
        let retryQ = sb
          .from("conversaciones_comercial")
          .select("etapa, anuncio, asesor_id")
          .order("created_at", { ascending: false })
          .range(desde, desde + 999);
        if (lim) retryQ = retryQ.gte("created_at", lim.gte).lt("created_at", lim.lt);
        const retry = await retryQ;
        if (retry.error) break;
        for (const lead of (retry.data ?? []) as Lead[]) {
          const campana = lead.anuncio?.trim() || "Sin campaña";
          const asesor = nombres.get(lead.asesor_id ?? "") ?? "Sin asignar";
          suma(campanas, campana, "leads");
          suma(asesores, asesor, "leads");
          const cita = lead.etapa === "cita" || lead.etapa === "visito" || lead.etapa === "ganado";
          if (cita) {
            suma(campanas, campana, "citas");
            suma(asesores, asesor, "citas");
          }
          if (lead.etapa === "ganado") {
            suma(campanas, campana, "ganados");
            suma(asesores, asesor, "ganados");
          }
        }
        if ((retry.data ?? []).length < 1000) break;
        continue;
      }
      if (error) break;
      const pagina = (data ?? []) as Lead[];
      for (const lead of pagina) {
        const campana = lead.anuncio?.trim() || "Sin campaña";
        const asesor = nombres.get(lead.asesor_id ?? "") ?? "Sin asignar";
        suma(campanas, campana, "leads");
        suma(asesores, asesor, "leads");
        const cita = lead.etapa === "cita" || lead.etapa === "visito" || lead.etapa === "ganado";
        if (cita) {
          suma(campanas, campana, "citas");
          suma(asesores, asesor, "citas");
        }
        if (lead.etapa === "ganado") {
          suma(campanas, campana, "ganados");
          suma(asesores, asesor, "ganados");
        }
        if (lead.primera_respuesta_at) {
          minutos.push(
            (new Date(lead.primera_respuesta_at).getTime() - new Date(lead.created_at).getTime()) / 60000,
          );
        }
      }
      if (pagina.length < 1000) break;
    }

    const contarSeg = async (estado: string, col: "enviado_at" | "programado_at") => {
      let q = sb
        .from("seguimientos_comercial")
        .select("id", { count: "exact", head: true })
        .eq("estado", estado);
      if (lim) q = q.gte(col, lim.gte).lt(col, lim.lt);
      const { count, error } = await q;
      if (error) return null;
      return count ?? 0;
    };
    const [enviados, pendientes] = await Promise.all([
      contarSeg("enviado", "enviado_at"),
      contarSeg("pendiente", "programado_at"),
    ]);

    // WhatsApp avanza el mismo campo: enviado → entregado → leido.
    // "Entregados" y "leídos" van acumulados (quien leyó también entregó).
    const contarEntregaEn = async (estados: string[]) => {
      let q = sb
        .from("mensajes_comercial")
        .select("id", { count: "exact", head: true })
        .eq("direccion", "out")
        .in("entrega", estados);
      if (lim) q = q.gte("created_at", lim.gte).lt("created_at", lim.lt);
      const { count, error } = await q;
      if (error) return 0;
      return count ?? 0;
    };
    const [enviadosWa, entregados, leidos] = await Promise.all([
      contarEntregaEn(["enviado", "entregado", "leido"]),
      contarEntregaEn(["entregado", "leido"]),
      contarEntregaEn(["leido"]),
    ]);

    return {
      leads: leadsTotal,
      conCita: conCitaN ?? 0,
      visitas: visitasN ?? 0,
      ganados: ganadosN ?? 0,
      perdidos: perdidosN ?? 0,
      vencidos: vencidosN ?? 0,
      calientes: calientesN ?? 0,
      tibios: tibiosN ?? 0,
      frios: friosN ?? 0,
      cadencia: { uno: cad1 ?? 0, dos: cad2 ?? 0, tres: cad3 ?? 0 },
      entregas: {
        enviados: enviadosWa,
        entregados,
        leidos,
      },
      primeraRespuestaMin: medianaMinutos(minutos),
      porCampana: [...campanas.values()].sort((a, b) => b.leads - a.leads).slice(0, 8),
      porAsesor: [...asesores.values()].sort((a, b) => b.leads - a.leads),
      seguimientos: {
        enviados: enviados ?? 0,
        pendientes: pendientes ?? 0,
      },
      rango: rangoActivo,
      error: null,
    };
  } catch (e) {
    return vacio(
      rangoActivo,
      e instanceof Error ? e.message : "No pude armar los resultados.",
    );
  }
}
