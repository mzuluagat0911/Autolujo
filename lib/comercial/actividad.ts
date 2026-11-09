import { createServerSupabase } from "@/lib/supabase/server";
import { listarAsesoresComerciales } from "./chats";

export type EnCurso = {
  id: string;
  nombre: string;
  etapa: string;
  nota: string;
  cuando: string | null;
};

export type Hecho = {
  id: string;
  cuando: string;
  texto: string;
  chatId: string;
  lead: string;
};

export type ActividadAsesor = {
  id: string;
  nombre: string;
  enCurso: EnCurso[];
  hechos: Hecho[];
};

const ETAPA: Record<string, string> = {
  nuevo: "Nuevo",
  conversacion: "En conversación",
  cita: "Cita agendada",
  visito: "Visitó",
  ganado: "Ganado",
  perdido: "Perdido",
};

export function etiquetaEtapa(etapa: string): string {
  return ETAPA[etapa] ?? etapa;
}

function textoDe(tipo: string, detalle: Record<string, unknown>): string {
  const nota = typeof detalle.observaciones === "string" ? detalle.observaciones.trim() : "";
  const escrito = typeof detalle.texto === "string" ? detalle.texto.trim() : "";
  const cuando = [detalle.fecha, detalle.hora].filter(Boolean).join(" ");
  if (tipo === "mensaje") return escrito ? `Escribió: ${escrito}` : "Escribió en el chat";
  if (tipo === "ficha_actualizada") return nota ? `Anotó: ${nota}` : "Actualizó la ficha";
  if (tipo === "chat_tomado") return "Tomó el chat";
  if (tipo === "chat_devuelto") return "Devolvió el chat a Lucía";
  if (tipo === "cita_agendada") return cuando ? `Agendó la cita del ${cuando}` : "Agendó una cita";
  if (tipo === "cita_reagendada") return cuando ? `Reagendó para el ${cuando}` : "Reagendó la cita";
  if (tipo === "cita_confirmada_llamada") return "Confirmó la cita por llamada";
  if (tipo === "cita_asistio") return "Marcó que el cliente asistió";
  if (tipo === "cita_no_asistio") return "Marcó que no asistió";
  if (tipo === "cita_cancelada") return "Canceló la cita";
  return tipo.replaceAll("_", " ");
}

export async function actividadComercial(): Promise<{ asesores: ActividadAsesor[]; error: string | null }> {
  const sb = createServerSupabase();
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [asesores, abiertos, eventos] = await Promise.all([
    listarAsesoresComerciales(),
    sb
      .from("conversaciones_comercial")
      .select("id, nombre, wa_numero, etapa, observaciones, proxima_accion, ultimo_mensaje_at, asesor_id")
      .not("asesor_id", "is", null)
      .is("cerrado_at", null)
      .order("ultimo_mensaje_at", { ascending: false })
      .limit(400),
    sb
      .from("eventos_comercial")
      .select("id, conversacion_id, actor_id, tipo, detalle, created_at, chat:conversaciones_comercial(nombre, wa_numero)")
      .gte("created_at", desde)
      .not("actor_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  let filasAbiertas = abiertos.data as Record<string, unknown>[] | null;
  let errorAbiertos = abiertos.error?.message ?? null;
  if (abiertos.error && /observaciones/i.test(abiertos.error.message)) {
    const retry = await sb
      .from("conversaciones_comercial")
      .select("id, nombre, wa_numero, etapa, proxima_accion, ultimo_mensaje_at, asesor_id")
      .not("asesor_id", "is", null)
      .is("cerrado_at", null)
      .order("ultimo_mensaje_at", { ascending: false })
      .limit(400);
    filasAbiertas = (retry.data ?? []) as Record<string, unknown>[];
    errorAbiertos = retry.error?.message ?? null;
  }

  const porAsesor = new Map<string, ActividadAsesor>();
  for (const a of asesores) {
    porAsesor.set(a.id, { id: a.id, nombre: a.nombre, enCurso: [], hechos: [] });
  }

  for (const row of filasAbiertas ?? []) {
    const asesorId = String(row.asesor_id ?? "");
    const ficha = porAsesor.get(asesorId);
    if (!ficha || ficha.enCurso.length >= 12) continue;
    const nota = String(row.observaciones ?? row.proxima_accion ?? "").trim();
    ficha.enCurso.push({
      id: String(row.id),
      nombre: String(row.nombre ?? "").trim() || String(row.wa_numero ?? "Lead"),
      etapa: etiquetaEtapa(String(row.etapa ?? "")),
      nota: nota.slice(0, 140),
      cuando: (row.ultimo_mensaje_at as string | null) ?? null,
    });
  }

  for (const row of (eventos.data ?? []) as Record<string, unknown>[]) {
    const asesorId = String(row.actor_id ?? "");
    const ficha = porAsesor.get(asesorId);
    if (!ficha || ficha.hechos.length >= 25) continue;
    const chatRaw = row.chat;
    const chat = Array.isArray(chatRaw) ? chatRaw[0] : chatRaw;
    const lead =
      chat && typeof chat === "object"
        ? String((chat as { nombre?: string | null }).nombre ?? "").trim() ||
          String((chat as { wa_numero?: string | null }).wa_numero ?? "Lead")
        : "Lead";
    const detalle =
      row.detalle && typeof row.detalle === "object" ? (row.detalle as Record<string, unknown>) : {};
    ficha.hechos.push({
      id: String(row.id),
      cuando: String(row.created_at ?? ""),
      texto: textoDe(String(row.tipo ?? ""), detalle),
      chatId: String(row.conversacion_id ?? ""),
      lead,
    });
  }

  const lista = [...porAsesor.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { asesores: lista, error: errorAbiertos ?? eventos.error?.message ?? null };
}
