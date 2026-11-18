import { createServerSupabase } from "@/lib/supabase/server";
import { listarAsesoresComerciales } from "./chats";

export type GrupoActividad = "mensaje" | "ficha" | "cita" | "asignacion" | "otro";

export type Movimiento = {
  id: string;
  cuando: string;
  asesorId: string;
  asesor: string;
  lead: string;
  chatId: string;
  grupo: GrupoActividad;
  texto: string;
};

export type Abierto = {
  id: string;
  asesorId: string;
  nombre: string;
  etapa: string;
};

export type PersonaActividad = {
  id: string;
  nombre: string;
  abiertos: number;
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

export function grupoDe(tipo: string): GrupoActividad {
  if (tipo === "mensaje") return "mensaje";
  if (tipo === "ficha_actualizada") return "ficha";
  if (tipo.startsWith("cita_")) return "cita";
  if (tipo === "chat_tomado" || tipo === "chat_devuelto") return "asignacion";
  return "otro";
}

function textoDe(tipo: string, detalle: Record<string, unknown>): string {
  const nota = typeof detalle.observaciones === "string" ? detalle.observaciones.trim() : "";
  const escrito = typeof detalle.texto === "string" ? detalle.texto.trim() : "";
  const cuando = [detalle.fecha, detalle.hora].filter(Boolean).join(" ");
  const corto = (s: string) => (s.length > 72 ? `${s.slice(0, 72)}…` : s);
  if (tipo === "mensaje") return escrito ? `Escribió: ${corto(escrito)}` : "Escribió en el chat";
  if (tipo === "ficha_actualizada") return nota ? `Anotó: ${corto(nota)}` : "Actualizó la ficha";
  if (tipo === "chat_tomado") return "Tomó el chat";
  if (tipo === "chat_devuelto") return "Devolvió el chat a Lucía";
  if (tipo === "cita_agendada") return cuando ? `Agendó la cita del ${cuando}` : "Agendó una cita";
  if (tipo === "cita_reagendada") return cuando ? `Reagendó para el ${cuando}` : "Reagendó la cita";
  if (tipo === "cita_confirmada_llamada") return "Confirmó la cita por llamada";
  if (tipo === "cita_asistio") return "Marcó que el cliente asistió";
  if (tipo === "cita_no_asistio") return "Marcó que no asistió";
  if (tipo === "cita_cancelada") return "Canceló la cita";
  if (tipo === "contrato") return "El contrato cerró el chat";
  return tipo.replaceAll("_", " ");
}

export async function actividadComercial(): Promise<{
  personas: PersonaActividad[];
  abiertos: Abierto[];
  movimientos: Movimiento[];
  error: string | null;
}> {
  const sb = createServerSupabase();
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [asesores, chats, eventos] = await Promise.all([
    listarAsesoresComerciales(),
    sb
      .from("conversaciones_comercial")
      .select("id, nombre, wa_numero, etapa, asesor_id")
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
      .limit(800),
  ]);

  const nombres = new Map(asesores.map((a) => [a.id, a.nombre]));
  const abiertosPorPersona = new Map<string, number>();
  const abiertos: Abierto[] = [];
  for (const row of (chats.data ?? []) as Record<string, unknown>[]) {
    const asesorId = String(row.asesor_id ?? "");
    if (!nombres.has(asesorId)) continue;
    abiertosPorPersona.set(asesorId, (abiertosPorPersona.get(asesorId) ?? 0) + 1);
    if (abiertos.filter((a) => a.asesorId === asesorId).length >= 8) continue;
    abiertos.push({
      id: String(row.id),
      asesorId,
      nombre: String(row.nombre ?? "").trim() || "Lead",
      etapa: etiquetaEtapa(String(row.etapa ?? "")),
    });
  }

  const movimientos: Movimiento[] = [];
  for (const row of (eventos.data ?? []) as Record<string, unknown>[]) {
    const asesorId = String(row.actor_id ?? "");
    const asesor = nombres.get(asesorId);
    if (!asesor) continue;
    const chatRaw = row.chat;
    const chat = Array.isArray(chatRaw) ? chatRaw[0] : chatRaw;
    const lead =
      chat && typeof chat === "object"
        ? String((chat as { nombre?: string | null }).nombre ?? "").trim() || "Lead"
        : "Lead";
    const detalle =
      row.detalle && typeof row.detalle === "object" ? (row.detalle as Record<string, unknown>) : {};
    const tipo = String(row.tipo ?? "");
    movimientos.push({
      id: String(row.id),
      cuando: String(row.created_at ?? ""),
      asesorId,
      asesor,
      lead,
      chatId: String(row.conversacion_id ?? ""),
      grupo: grupoDe(tipo),
      texto: textoDe(tipo, detalle),
    });
  }

  const personas = asesores
    .map((a) => ({ id: a.id, nombre: a.nombre, abiertos: abiertosPorPersona.get(a.id) ?? 0 }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {
    personas,
    abiertos,
    movimientos,
    error: chats.error?.message ?? eventos.error?.message ?? null,
  };
}
