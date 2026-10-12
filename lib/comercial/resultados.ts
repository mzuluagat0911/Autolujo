import { createServerSupabase } from "@/lib/supabase/server";
import { listarAsesoresComerciales } from "./chats";

export type FilaResultado = { nombre: string; leads: number; citas: number; ganados: number };

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
  avisosFallidos: number;
  entregas: { enviados: number; entregados: number; leidos: number; fallidos: number };
  primeraRespuestaMin: number | null;
  porCampana: FilaResultado[];
  porAsesor: FilaResultado[];
  seguimientos: { enviados: number; fallidos: number; pendientes: number };
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

export function medianaMinutos(valores: number[]): number | null {
  const limpios = valores.filter((n) => n >= 0).sort((a, b) => a - b);
  if (!limpios.length) return null;
  const medio = Math.floor(limpios.length / 2);
  const valor = limpios.length % 2 ? limpios[medio]! : (limpios[medio - 1]! + limpios[medio]!) / 2;
  return Math.round(valor);
}

export async function resumenComercial(): Promise<ResumenComercial> {
  const vacio: ResumenComercial = {
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
    avisosFallidos: 0,
    entregas: { enviados: 0, entregados: 0, leidos: 0, fallidos: 0 },
    primeraRespuestaMin: null,
    porCampana: [],
    porAsesor: [],
    seguimientos: { enviados: 0, fallidos: 0, pendientes: 0 },
    error: null,
  };
  try {
    const sb = createServerSupabase();
    const leads: Lead[] = [];
    let conRespuesta = true;
    for (let desde = 0; desde < 5000; desde += 1000) {
      const base = "etapa, temperatura, anuncio, asesor_id, created_at, seguimiento_at, cerrado_at, intentos_seguimiento";
      const columnas = conRespuesta ? `${base}, primera_respuesta_at` : base;
      const { data, error } = await sb
        .from("conversaciones_comercial")
        .select(columnas)
        .order("created_at", { ascending: false })
        .range(desde, desde + 999);
      if (error && conRespuesta && /primera_respuesta_at/i.test(error.message)) {
        conRespuesta = false;
        desde -= 1000;
        continue;
      }
      if (error) {
        const falta = /etapa|temperatura|seguimiento_at|intentos_seguimiento|schema cache/i.test(error.message);
        return {
          ...vacio,
          error: falta ? "Falta aplicar la migración 0039 para ver resultados." : error.message,
        };
      }
      const pagina = (data ?? []) as unknown as Lead[];
      leads.push(...pagina);
      if (pagina.length < 1000) break;
    }

    const ahora = Date.now();
    const minutos: number[] = [];
    const campanas = new Map<string, FilaResultado>();
    const asesores = new Map<string, FilaResultado>();
    const nombres = new Map((await listarAsesoresComerciales()).map((a) => [a.id, a.nombre]));
    const suma = (map: Map<string, FilaResultado>, nombre: string, campo: keyof FilaResultado) => {
      const fila = map.get(nombre) ?? { nombre, leads: 0, citas: 0, ganados: 0 };
      if (campo !== "nombre") fila[campo] += 1;
      map.set(nombre, fila);
    };

    let conCita = 0;
    let visitas = 0;
    let ganados = 0;
    let perdidos = 0;
    let vencidos = 0;
    let calientes = 0;
    let tibios = 0;
    let frios = 0;
    const cadencia = { uno: 0, dos: 0, tres: 0 };
    for (const lead of leads) {
      const cita = lead.etapa === "cita" || lead.etapa === "visito" || lead.etapa === "ganado";
      const visita = lead.etapa === "visito" || lead.etapa === "ganado";
      if (cita) conCita += 1;
      if (visita) visitas += 1;
      if (lead.etapa === "ganado") ganados += 1;
      if (lead.etapa === "perdido") perdidos += 1;
      if (!lead.cerrado_at && lead.temperatura === "caliente") calientes += 1;
      if (!lead.cerrado_at && lead.temperatura === "tibio") tibios += 1;
      if (!lead.cerrado_at && lead.temperatura === "frio") frios += 1;
      if (!lead.cerrado_at && lead.intentos_seguimiento === 1) cadencia.uno += 1;
      if (!lead.cerrado_at && lead.intentos_seguimiento === 2) cadencia.dos += 1;
      if (!lead.cerrado_at && lead.intentos_seguimiento === 3) cadencia.tres += 1;
      if (lead.seguimiento_at && !lead.cerrado_at && new Date(lead.seguimiento_at).getTime() < ahora) vencidos += 1;
      if (lead.primera_respuesta_at) {
        minutos.push((new Date(lead.primera_respuesta_at).getTime() - new Date(lead.created_at).getTime()) / 60000);
      }
      const campana = lead.anuncio?.trim() || "Sin campaña";
      const asesor = nombres.get(lead.asesor_id ?? "") ?? "Sin asignar";
      suma(campanas, campana, "leads");
      suma(asesores, asesor, "leads");
      if (cita) {
        suma(campanas, campana, "citas");
        suma(asesores, asesor, "citas");
      }
      if (lead.etapa === "ganado") {
        suma(campanas, campana, "ganados");
        suma(asesores, asesor, "ganados");
      }
    }

    const contar = async (estado: string) => {
      const { count, error } = await sb
        .from("seguimientos_comercial")
        .select("id", { count: "exact", head: true })
        .eq("estado", estado);
      if (error) return null;
      return count ?? 0;
    };
    const [enviados, fallidos, pendientes] = await Promise.all([
      contar("enviado"),
      contar("fallido"),
      contar("pendiente"),
    ]);
    const avisos = await sb
      .from("citas_comercial")
      .select("id", { count: "exact", head: true })
      .not("aviso_error", "is", null);
    const avisosFallidos = avisos.error ? 0 : (avisos.count ?? 0);
    const contarEntrega = async (entrega: string) => {
      const { count, error } = await sb
        .from("mensajes_comercial")
        .select("id", { count: "exact", head: true })
        .eq("direccion", "out")
        .eq("entrega", entrega);
      if (error) return 0;
      return count ?? 0;
    };
    const [soloEnviados, entregados, leidos, entregaFallidos] = await Promise.all([
      contarEntrega("enviado"),
      contarEntrega("entregado"),
      contarEntrega("leido"),
      contarEntrega("fallido"),
    ]);

    return {
      leads: leads.length,
      conCita,
      visitas,
      ganados,
      perdidos,
      vencidos,
      calientes,
      tibios,
      frios,
      cadencia,
      avisosFallidos,
      entregas: {
        enviados: soloEnviados + entregados + leidos,
        entregados,
        leidos,
        fallidos: entregaFallidos,
      },
      primeraRespuestaMin: medianaMinutos(minutos),
      porCampana: [...campanas.values()].sort((a, b) => b.leads - a.leads).slice(0, 8),
      porAsesor: [...asesores.values()].sort((a, b) => b.leads - a.leads),
      seguimientos: {
        enviados: enviados ?? 0,
        fallidos: fallidos ?? 0,
        pendientes: pendientes ?? 0,
      },
      error: null,
    };
  } catch (e) {
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
      avisosFallidos: 0,
      entregas: { enviados: 0, entregados: 0, leidos: 0, fallidos: 0 },
      primeraRespuestaMin: null,
      porCampana: [],
      porAsesor: [],
      seguimientos: { enviados: 0, fallidos: 0, pendientes: 0 },
      error: e instanceof Error ? e.message : "No pude armar los resultados.",
    };
  }
}
