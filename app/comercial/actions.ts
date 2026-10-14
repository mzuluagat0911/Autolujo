"use server";

import { revalidatePath } from "next/cache";
import { sendText } from "@/lib/whatsapp/client";
import { idMensajeEnviado } from "@/lib/comercial/entrega";
import { ventanaAbierta } from "@/lib/cartera/pipeline";
import { sesionEquipo } from "@/lib/equipo/sesion";
import {
  actualizarFichaComercial,
  cambiosChatsComercial,
  hiloComercial,
  listarChatsComercial,
  limpiarBorradorComercial,
  marcarChatComercialLeido,
  mensajesNuevosComercial,
  registrarSalidaComercial,
  tomarChatComercial,
  type ChatComercial,
  type EtapaComercial,
  type FiltroBandejaComercial,
  type MensajeComercial,
  type ModoAtencionComercial,
  type PaginaChatsComercial,
  type TemperaturaLead,
} from "@/lib/comercial/chats";

function refrescar() {
  revalidatePath("/comercial");
  revalidatePath("/comercial/citas");
}

export async function marcarAsistencia(
  id: string,
  asistencia: "asistio" | "no_asistio" | "cancelada",
): Promise<{ ok: boolean; error?: string }> {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "La sesión venció." };
  const { marcarAsistenciaCita } = await import("@/lib/comercial/citas");
  const r = await marcarAsistenciaCita(id, asistencia, sesion.id);
  if (r.ok) refrescar();
  return r;
}

export async function marcarCitaConfirmadaPorLlamada(id: string): Promise<{ ok: boolean; error?: string }> {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "La sesión venció." };
  const { confirmarCitaPorLlamada } = await import("@/lib/comercial/citas");
  const r = await confirmarCitaPorLlamada(id, sesion.id);
  if (r.ok) refrescar();
  return r;
}

export async function cargarBandejaComercial(opts: {
  filtro?: FiltroBandejaComercial;
  buscar?: string;
  cursor?: string | null;
} = {}): Promise<PaginaChatsComercial> {
  const sesion = await sesionEquipo();
  return listarChatsComercial({ ...opts, asesorId: sesion?.id });
}

export async function cargarCambiosComercial(desde: string): Promise<ChatComercial[]> {
  return cambiosChatsComercial(desde);
}

export async function cargarMensajesNuevos(
  id: string,
  desde: string,
): Promise<MensajeComercial[]> {
  if (!id) return [];
  return mensajesNuevosComercial(id, desde);
}

export async function marcarChatLeido(id: string): Promise<void> {
  if (id) await marcarChatComercialLeido(id);
}

export async function cargarHiloComercial(
  id: string,
  antesDe?: string | null,
  marcarLeido = true,
): Promise<{ chat: ChatComercial | null; mensajes: MensajeComercial[]; hayMas: boolean }> {
  if (!id) return { chat: null, mensajes: [], hayMas: false };
  if (marcarLeido) await marcarChatComercialLeido(id);
  return hiloComercial(id, { antesDe, limite: 50 });
}

export async function tomarChat(id: string): Promise<{ ok: boolean; error?: string }> {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "La sesión venció." };
  const r = await tomarChatComercial(id, sesion.id);
  if (r.ok) refrescar();
  return r;
}

export async function guardarFichaComercial(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "La sesión venció." };
  const conversacionId = String(formData.get("conversacion_id") ?? "");
  if (!conversacionId) return { ok: false, error: "Falta el chat." };
  const etapaRaw = String(formData.get("etapa") ?? "");
  const tempRaw = String(formData.get("temperatura") ?? "");
  const modoRaw = String(formData.get("modo_atencion") ?? "");
  const etapa = ["nuevo", "conversacion", "cita", "visito", "ganado", "perdido"].includes(etapaRaw)
    ? (etapaRaw as EtapaComercial)
    : undefined;
  const temperatura = ["caliente", "tibio", "frio"].includes(tempRaw)
    ? (tempRaw as TemperaturaLead)
    : undefined;
  const modoAtencion = ["lucia", "humano"].includes(modoRaw)
    ? (modoRaw as ModoAtencionComercial)
    : undefined;
  const seguimientoRaw = String(formData.get("seguimiento_at") ?? "").trim();
  const seguimientoDate = seguimientoRaw ? new Date(seguimientoRaw) : null;
  const seguimientoAt =
    seguimientoDate && !Number.isNaN(seguimientoDate.getTime())
      ? seguimientoDate.toISOString()
      : null;
  const r = await actualizarFichaComercial({
    conversacionId,
    actorId: sesion.id,
    nombre: String(formData.get("nombre") ?? "").trim() || null,
    etapa,
    temperatura,
    interes: String(formData.get("interes") ?? "").trim() || null,
    lugar: String(formData.get("lugar") ?? "").trim() || null,
    proximaAccion: String(formData.get("proxima_accion") ?? "").trim() || null,
    seguimientoAt,
    resultado: String(formData.get("resultado") ?? "").trim() || null,
    motivoPerdida: String(formData.get("motivo_perdida") ?? "").trim() || null,
    asesorId: String(formData.get("asesor_id") ?? "").trim() || null,
    modoAtencion,
  });
  if (r.ok) refrescar();
  return r;
}

/** Respuesta de una persona, siempre desde el número de ventas. */
export async function enviarRespuestaComercial(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; mensaje?: MensajeComercial }> {
  const id = String(formData.get("conversacion_id") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();
  const phoneId = process.env.WHATSAPP_COMERCIAL_PHONE_NUMBER_ID;
  if (!id) return { ok: false, error: "Falta el chat." };
  if (!texto) return { ok: false, error: "Escribe un mensaje." };
  if (!phoneId) return { ok: false, error: "Falta el número comercial en el entorno." };

  try {
    const sesion = await sesionEquipo();
    if (!sesion) return { ok: false, error: "La sesión venció." };
    const { chat } = await hiloComercial(id);
    if (!chat) return { ok: false, error: "No encontré ese chat de ventas." };
    if (!ventanaAbierta(chat.ultimoEntranteAt)) {
      return {
        ok: false,
        error: "La ventana de 24 horas está cerrada. La persona tiene que escribir primero.",
      };
    }
    const json = await sendText(chat.waNumero, texto, phoneId);
    const mensaje = await registrarSalidaComercial(id, texto, {
      autor: "humano",
      actorId: sesion.id,
      waMessageId: idMensajeEnviado(json),
    });
    await limpiarBorradorComercial(id);
    refrescar();
    return { ok: true, ...(mensaje ? { mensaje } : {}) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." };
  }
}
