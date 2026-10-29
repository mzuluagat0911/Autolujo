"use server";

import { revalidatePath } from "next/cache";
import { sendAudioBytes, sendTemplate, sendText } from "@/lib/whatsapp/client";
import { wavANotaOpus } from "@/lib/whatsapp/nota-voz";
import { textoConArchivo } from "@/lib/comercial/archivo";
import { aplicarPedidoCita } from "@/lib/comercial/citas";
import { idMensajeEnviado } from "@/lib/comercial/entrega";
import { plantillaCita, plantillaSeguimiento } from "@/lib/comercial/plantillas";
import { sedePorId, type SedeId } from "@/lib/comercial/sedes";
import { ventanaAbierta } from "@/lib/cartera/pipeline";
import { fechaConDia } from "@/lib/cartera/fecha";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionEquipo } from "@/lib/equipo/sesion";
import {
  actualizarFichaComercial,
  cambiosChatsComercial,
  contarFiltrosComercial,
  devolverChatComercial,
  hiloComercial,
  listarChatsComercial,
  limpiarBorradorComercial,
  marcarChatComercialLeido,
  mensajesNuevosComercial,
  registrarSalidaComercial,
  tomarChatComercial,
  type ChatComercial,
  type ConteosBandejaComercial,
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

export async function devolverChat(id: string): Promise<{ ok: boolean; error?: string }> {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "La sesión venció." };
  const r = await devolverChatComercial(id, sesion.id);
  if (r.ok) refrescar();
  return r;
}

export async function cargarConteosComercial(): Promise<ConteosBandejaComercial> {
  const sesion = await sesionEquipo();
  return contarFiltrosComercial(sesion?.id);
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
        error: "La ventana de 24 horas está cerrada. Use una plantilla o espere a que escriba.",
      };
    }
    const tomado = await tomarChatComercial(id, sesion.id);
    if (!tomado.ok && chat.asesorId && chat.asesorId !== sesion.id) {
      return { ok: false, error: tomado.error ?? "Otro asesor ya tomó este chat." };
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

export async function enviarPlantillaComercial(
  conversacionId: string,
  tipo: "seguimiento" | "recordatorio_cita" | "confirma_cita",
): Promise<{ ok: boolean; error?: string; mensaje?: MensajeComercial; texto?: string }> {
  const phoneId = process.env.WHATSAPP_COMERCIAL_PHONE_NUMBER_ID;
  if (!phoneId) return { ok: false, error: "Falta el número comercial en el entorno." };
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "La sesión venció." };
  const { chat } = await hiloComercial(conversacionId);
  if (!chat) return { ok: false, error: "No encontré ese chat de ventas." };
  const tomado = await tomarChatComercial(conversacionId, sesion.id);
  if (!tomado.ok && chat.asesorId && chat.asesorId !== sesion.id) {
    return { ok: false, error: tomado.error ?? "Otro asesor ya tomó este chat." };
  }

  try {
    let name: string;
    let componentes: unknown[];
    let texto: string;
    if (tipo === "seguimiento") {
      const plantilla = plantillaSeguimiento(chat.nombre, Math.min(chat.intentosSeguimiento + 1, 7) || 1);
      name = plantilla.name;
      componentes = plantilla.componentes;
      texto = plantilla.texto;
    } else {
      if (!chat.citaFecha || !chat.citaHora || !chat.citaSede) {
        return { ok: false, error: "Este lead no tiene una cita abierta." };
      }
      const plantilla = plantillaCita(tipo === "recordatorio_cita" ? "dia" : "24h", {
        nombre: chat.nombre ?? "buenas",
        fechaTexto: fechaConDia(chat.citaFecha),
        hora: chat.citaHora,
        sede: sedePorId(chat.citaSede)?.nombre ?? chat.citaSede,
      });
      name = plantilla.name;
      componentes = plantilla.componentes;
      texto = plantilla.texto;
    }
    const json = await sendTemplate(chat.waNumero, name, "es", componentes, phoneId);
    const mensaje = await registrarSalidaComercial(conversacionId, texto, {
      autor: "humano",
      actorId: sesion.id,
      waMessageId: idMensajeEnviado(json),
    });
    await limpiarBorradorComercial(conversacionId);
    refrescar();
    return { ok: true, texto, ...(mensaje ? { mensaje } : {}) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar la plantilla." };
  }
}

export async function agendarCitaComercial(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  texto?: string;
  enviado?: boolean;
}> {
  const phoneId = process.env.WHATSAPP_COMERCIAL_PHONE_NUMBER_ID;
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "La sesión venció." };
  const id = String(formData.get("conversacion_id") ?? "");
  const sedeRaw = String(formData.get("sede") ?? "");
  const sede: SedeId | null = sedeRaw === "chorrera" || sedeRaw === "juan_diaz" ? sedeRaw : null;
  const fecha = String(formData.get("fecha") ?? "").trim();
  const hora = String(formData.get("hora") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const lugar = String(formData.get("lugar") ?? "").trim();
  if (!id) return { ok: false, error: "Falta el chat." };
  const { chat } = await hiloComercial(id);
  if (!chat) return { ok: false, error: "No encontré ese chat de ventas." };
  const tomado = await tomarChatComercial(id, sesion.id);
  if (!tomado.ok && chat.asesorId && chat.asesorId !== sesion.id) {
    return { ok: false, error: tomado.error ?? "Otro asesor ya tomó este chat." };
  }
  const aplicada = await aplicarPedidoCita({
    conversacionId: id,
    waNumero: chat.waNumero,
    pedido: {
      accion: chat.citaFecha ? "reagendar" : "agendar",
      nombre: nombre || chat.nombre,
      sede,
      fecha: fecha || null,
      hora: hora || null,
      lugar: lugar || chat.lugar,
      celular: null,
    },
    anuncio: chat.anuncio,
    campanaId: chat.campanaId,
  });
  if (!aplicada.agendo) {
    return { ok: false, error: aplicada.mensaje ?? "No pude agendar la cita." };
  }
  const texto = aplicada.mensaje ?? "Cita agendada.";
  if (phoneId && ventanaAbierta(chat.ultimoEntranteAt)) {
    try {
      const json = await sendText(chat.waNumero, texto, phoneId);
      await registrarSalidaComercial(id, texto, {
        autor: "humano",
        actorId: sesion.id,
        waMessageId: idMensajeEnviado(json),
      });
      refrescar();
      return { ok: true, texto, enviado: true };
    } catch (e) {
      refrescar();
      return {
        ok: true,
        texto,
        enviado: false,
        error: e instanceof Error ? e.message : "La cita quedó, pero el WhatsApp no salió.",
      };
    }
  }
  refrescar();
  return { ok: true, texto, enviado: false };
}

export async function enviarAudioComercial(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; mensaje?: MensajeComercial }> {
  const id = String(formData.get("conversacion_id") ?? "");
  const file = formData.get("audio");
  const phoneId = process.env.WHATSAPP_COMERCIAL_PHONE_NUMBER_ID;
  if (!id) return { ok: false, error: "Falta el chat." };
  if (!phoneId) return { ok: false, error: "Falta el número comercial en el entorno." };
  if (!(file instanceof File) || file.size < 1) return { ok: false, error: "Falta el audio." };
  if (file.size > 16 * 1024 * 1024) return { ok: false, error: "El audio es demasiado pesado (máx. 16 MB)." };

  try {
    const sesion = await sesionEquipo();
    if (!sesion) return { ok: false, error: "La sesión venció." };
    const { chat } = await hiloComercial(id);
    if (!chat) return { ok: false, error: "No encontré ese chat de ventas." };
    if (!ventanaAbierta(chat.ultimoEntranteAt)) {
      return { ok: false, error: "La ventana de 24 horas está cerrada." };
    }
    const tomado = await tomarChatComercial(id, sesion.id);
    if (!tomado.ok && chat.asesorId && chat.asesorId !== sesion.id) {
      return { ok: false, error: tomado.error ?? "Otro asesor ya tomó este chat." };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    let ogg: Buffer;
    try {
      ogg = wavANotaOpus(bytes);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "No pude preparar la nota de voz." };
    }
    const json = await sendAudioBytes(chat.waNumero, ogg, "audio/ogg", "nota.ogg", true, phoneId);
    const path = `chat-audio-comercial/${id}/${Date.now()}.wav`;
    const sb = createServerSupabase();
    const { error: upErr } = await sb.storage.from("comprobantes").upload(path, bytes, {
      contentType: "audio/wav",
      upsert: false,
    });
    const texto = textoConArchivo("🎤 Nota de voz", upErr ? null : path);
    const mensaje = await registrarSalidaComercial(id, texto, {
      autor: "humano",
      actorId: sesion.id,
      waMessageId: idMensajeEnviado(json),
    });
    refrescar();
    return { ok: true, ...(mensaje ? { mensaje } : {}) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar el audio." };
  }
}
