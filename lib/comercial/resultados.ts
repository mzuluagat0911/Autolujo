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
    const ahoraIso = new Date().toISOString();
    const contarLeads = async (aplicar: (q: any) => any): Promise<number | null> => {
      const { count, error } = await aplicar(
        sb.from("conversaciones_comercial").select("id", { count: "exact", head: true }),
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
      return { ...vacio, error: "Falta aplicar la migración 0039 para ver resultados." };
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
      const { data, error } = await sb
        .from("conversaciones_comercial")
        .select("etapa, anuncio, asesor_id, created_at, primera_respuesta_at")
        .order("created_at", { ascending: false })
        .range(desde, desde + 999);
      if (error && /primera_respuesta_at/i.test(error.message)) {
        const retry = await sb
          .from("conversaciones_comercial")
          .select("etapa, anuncio, asesor_id")
          .order("created_at", { ascending: false })
          .range(desde, desde + 999);
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
