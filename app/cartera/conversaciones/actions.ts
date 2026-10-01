"use server";

import { sendAudioBytes, sendTemplate, sendText } from "@/lib/whatsapp/client";
import { wavANotaOpus } from "@/lib/whatsapp/nota-voz";
import {
  tomarChat,
  devolverAlAgente,
  registrarMensaje,
  ventanaAbierta,
  marcarLeida,
} from "@/lib/cartera/pipeline";
import { createServerSupabase } from "@/lib/supabase/server";
import { cobroHoyContrato } from "@/lib/cartera/cobro-hoy";
import { estadoCuentaContrato } from "@/lib/cartera/estado-cuenta";
import { revalidatePath } from "next/cache";
import type { ConversacionDetalle, ConversacionLista, Mensaje } from "./types";
import { alertasGpsPendientes, marcarAlertaGpsVista } from "@/lib/gps/revisar-dia";
import { marcarAlertaSalidaVista, salidasAlertasPendientes, salidasPendientesAval } from "@/lib/cartera/salidas-aplicar";

function revalidar(id?: string) {
  revalidatePath("/cartera/conversaciones");
  if (id) revalidatePath(`/cartera/conversaciones/${id}`);
}

export async function accionTomarChat(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("conversacion_id") ?? "");
  if (!id) return { ok: false, error: "Falta la conversación." };
  try {
    await tomarChat(id);
    await marcarLeida(id);
    revalidar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo tomar el chat." };
  }
}

export async function accionDevolverAgente(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("conversacion_id") ?? "");
  if (!id) return { ok: false, error: "Falta la conversación." };
  try {
    await devolverAlAgente(id);
    revalidar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo devolver el chat." };
  }
}

export async function accionMarcarLeida(conversacionId: string): Promise<void> {
  if (!conversacionId) return;
  await marcarLeida(conversacionId);
  revalidar(conversacionId);
}

/** Envía una respuesta escrita por una persona del equipo (mismo hilo de WhatsApp). */
export async function enviarRespuestaHumana(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("conversacion_id") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();
  if (!id) return { ok: false, error: "Falta la conversación." };
  if (!texto) return { ok: false, error: "Escribe un mensaje." };

  try {
    const sb = createServerSupabase();
    const { data: conv, error } = await sb
      .from("conversaciones")
      .select("wa_numero, ultimo_entrante_at, modo")
      .eq("id", id)
      .single();
    if (error || !conv) return { ok: false, error: "No se encontró la conversación." };

    if ((conv.modo as string) !== "humano") {
      return { ok: false, error: "Primero toma el chat para poder escribir." };
    }

    if (!ventanaAbierta(conv.ultimo_entrante_at as string | null)) {
      return {
        ok: false,
        error:
          "La ventana de 24h está cerrada. El cliente debe escribir primero para poder responder.",
      };
    }

    await sendText(conv.wa_numero as string, texto);
    await registrarMensaje({
      conversacionId: id,
      direccion: "out",
      texto,
      enviadoPor: "Equipo",
    });

    // escalada_at se limpia junto con necesita_humano: si no, la próxima
    // escalada heredaría el reloj de esta y parecería vieja de entrada.
    await sb
      .from("conversaciones")
      .update({ necesita_humano: false, no_leidos: 0, escalada_at: null })
      .eq("id", id);

    revalidar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." };
  }
}

const PLANTILLAS_MORA = {
  mora_sin_respuesta:
    "📌 Apreciado cliente: hemos intentado comunicarnos con usted sin obtener respuesta. Por favor, comuníquese con nosotros a la brevedad para regularizar sus pagos.",
  mora_contacto_referencias:
    "📌 Apreciado cliente: al no recibir respuesta de su parte, procederemos a establecer contacto con las referencias registradas en su contrato.",
  mora_alerta_bloqueo:
    "⚠️ Apreciado cliente: el sistema registra una alerta por posible bloqueo de su carro debido al atraso en sus pagos. Le solicitamos realizar su pago a la brevedad para evitar esta situación.",
  mora_pago_pendiente:
    "⚠️ Apreciado cliente: aún no hemos recibido su pago. Por favor, regularice su cuenta a la brevedad y evite recargos innecesarios.",
  mora_pago_inmediato:
    "🚨 Apreciado cliente: Solicitamos realizar el pago de inmediato para evitar la aplicación de recargos y las acciones correspondientes según su contrato.",
} as const;

export type PlantillaMora = keyof typeof PLANTILLAS_MORA;

/** Plantilla de mora. Sale aunque la ventana de 24h esté cerrada. */
export async function enviarPlantillaMora(
  conversacionId: string,
  nombre: string,
): Promise<{ ok: boolean; error?: string; texto?: string }> {
  const id = String(conversacionId ?? "").trim();
  const plantilla = PLANTILLAS_MORA[nombre as PlantillaMora];
  if (!id) return { ok: false, error: "Falta la conversación." };
  if (!plantilla) return { ok: false, error: "Esa plantilla no está habilitada." };

  try {
    const sb = createServerSupabase();
    const { data: conv, error } = await sb
      .from("conversaciones")
      .select("wa_numero, modo")
      .eq("id", id)
      .single();
    if (error || !conv) return { ok: false, error: "No se encontró la conversación." };
    if ((conv.modo as string) !== "humano") {
      return { ok: false, error: "Primero toma el chat para poder enviar la plantilla." };
    }

    await sendTemplate(conv.wa_numero as string, nombre, "es");
    await registrarMensaje({
      conversacionId: id,
      direccion: "out",
      texto: plantilla,
      enviadoPor: "Equipo",
    });
    await sb
      .from("conversaciones")
      .update({ necesita_humano: false, no_leidos: 0, escalada_at: null })
      .eq("id", id);
    revalidar(id);
    return { ok: true, texto: plantilla };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar la plantilla." };
  }
}

/** Envía una nota de voz desde el inbox (mismo hilo de WhatsApp). */
export async function enviarAudioHumano(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("conversacion_id") ?? "");
  const file = formData.get("audio");
  if (!id) return { ok: false, error: "Falta la conversación." };
  if (!(file instanceof File) || file.size < 1) {
    return { ok: false, error: "Falta el audio." };
  }
  if (file.size > 16 * 1024 * 1024) {
    return { ok: false, error: "El audio es demasiado pesado (máx. 16 MB)." };
  }

  try {
    const sb = createServerSupabase();
    const { data: conv, error } = await sb
      .from("conversaciones")
      .select("wa_numero, ultimo_entrante_at, modo")
      .eq("id", id)
      .single();
    if (error || !conv) return { ok: false, error: "No se encontró la conversación." };

    if ((conv.modo as string) !== "humano") {
      return { ok: false, error: "Primero toma el chat para poder enviar audio." };
    }

    if (!ventanaAbierta(conv.ultimo_entrante_at as string | null)) {
      return {
        ok: false,
        error:
          "La ventana de 24h está cerrada. El cliente debe escribir primero para poder responder.",
      };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    let ogg: Buffer;
    try {
      ogg = wavANotaOpus(bytes);
    } catch (e) {
      console.error("[enviarAudioHumano] opus", e);
      return { ok: false, error: e instanceof Error ? e.message : "No pude preparar la nota de voz." };
    }

    await sendAudioBytes(conv.wa_numero as string, ogg, "audio/ogg", "nota.ogg", true);

    const path = `chat-audio/${id}/${Date.now()}.wav`;
    const { error: upErr } = await sb.storage.from("comprobantes").upload(path, bytes, {
      contentType: "audio/wav",
      upsert: false,
    });
    if (upErr) {
      console.warn("[enviarAudioHumano] storage:", upErr.message);
    }

    await registrarMensaje({
      conversacionId: id,
      direccion: "out",
      tipo: "audio",
      texto: "🎤 Nota de voz",
      mediaUrl: upErr ? null : path,
      enviadoPor: "Equipo",
    });

    await sb
      .from("conversaciones")
      .update({ necesita_humano: false, no_leidos: 0, escalada_at: null })
      .eq("id", id);

    revalidar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar el audio." };
  }
}

const SEL_LISTA =
  "id, wa_numero, etiqueta, ultimo_texto, ultimo_mensaje_at, no_leidos, estado, modo, necesita_humano, motivo_escalada, ultimo_entrante_at, cliente:clientes(nombre, cedula), vehiculo:vehiculos(numero, empresa:empresas(codigo))";

/** Lista la bandeja (para refresco del cliente sin recargar toda la página). */
export async function cargarBandeja(): Promise<{
  convs: ConversacionLista[];
  error: string | null;
}> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("conversaciones")
      .select(SEL_LISTA)
      .order("necesita_humano", { ascending: false })
      .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return { convs: (data as unknown as ConversacionLista[]) ?? [], error: null };
  } catch (e) {
    return { convs: [], error: e instanceof Error ? e.message : "Error" };
  }
}

/** Hilo del chat, sin el cobro del día. Eso es lo que tiene que aparecer al instante. */
export async function cargarHilo(
  id: string,
): Promise<{ detalle: ConversacionDetalle | null; error: string | null }> {
  try {
    const sb = createServerSupabase();
    const { data: conv, error } = await sb
      .from("conversaciones")
      .select(`${SEL_LISTA}, contrato_id`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!conv) return { detalle: null, error: null };

    const { data: msgs } = await sb
      .from("mensajes")
      .select("id, direccion, tipo, texto, media_url, enviado_por, created_at")
      .eq("conversacion_id", id)
      .order("created_at", { ascending: true });

    const mensajesRaw = (msgs as Mensaje[]) ?? [];
    const mensajes = await Promise.all(
      mensajesRaw.map(async (m) => {
        if (!m.media_url) return m;
        const { data: signed } = await sb.storage
          .from("comprobantes")
          .createSignedUrl(m.media_url, 3600);
        return { ...m, signedUrl: signed?.signedUrl ?? null };
      }),
    );

    const base = conv as unknown as ConversacionLista & { contrato_id: string | null };
    const detalle: ConversacionDetalle = {
      ...base,
      saldo: null,
      mensajes,
      ventana_abierta: ventanaAbierta(base.ultimo_entrante_at),
    };
    return { detalle, error: null };
  } catch (e) {
    return { detalle: null, error: e instanceof Error ? e.message : "Error" };
  }
}

/** TOTAL a pagar hoy del contrato. No bloquea la apertura del chat. */
export async function cargarSaldoChat(contratoId: string): Promise<number | null> {
  const id = String(contratoId ?? "").trim();
  if (!id) return null;
  try {
    const estado = await estadoCuentaContrato(id);
    if (!estado) return null;
    const cobro = await cobroHoyContrato(estado);
    return Math.round(cobro.totalCobrarHoy * 100) / 100;
  } catch {
    return null;
  }
}

/** Carga el detalle de una conversación (mensajes + saldo). */
export async function cargarDetalle(
  id: string,
): Promise<{ detalle: ConversacionDetalle | null; error: string | null }> {
  const hilo = await cargarHilo(id);
  if (!hilo.detalle) return hilo;
  const contratoId = hilo.detalle.contrato_id;
  if (!contratoId) return hilo;
  hilo.detalle.saldo = await cargarSaldoChat(contratoId);
  return hilo;
}

export type AlertaEscalada = {
  id: string;
  titulo: string;
  motivo: string | null;
  desde: string | null;
  preview: string | null;
  /** Cambia si hay un mensaje nuevo o se vuelve a escalar → la campana suena otra vez. */
  huella: string;
  clase?: "chat" | "gps" | "salida";
  href?: string;
};

/** Chats que Marcela (o el sistema) pasó a una persona y nadie ha tomado. */
export async function cargarAlertasEscalada(): Promise<AlertaEscalada[]> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("conversaciones")
      .select(
        "id, etiqueta, motivo_escalada, escalada_at, ultimo_texto, ultimo_mensaje_at, cliente:clientes(nombre), vehiculo:vehiculos(numero)",
      )
      .eq("necesita_humano", true)
      .order("escalada_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    const chats = ((data ?? []) as unknown as {
      id: string;
      etiqueta: string | null;
      motivo_escalada: string | null;
      escalada_at: string | null;
      ultimo_texto: string | null;
      ultimo_mensaje_at: string | null;
      cliente: { nombre: string } | null;
      vehiculo: { numero: string } | null;
    }[]).map((c) => ({
      id: c.id,
      titulo: c.vehiculo?.numero
        ? `Carro ${c.vehiculo.numero}`
        : c.etiqueta ?? c.cliente?.nombre ?? "Cliente",
      motivo: c.motivo_escalada,
      desde: c.escalada_at,
      preview: c.ultimo_texto,
      huella: [c.id, c.escalada_at ?? "", c.motivo_escalada ?? "", c.ultimo_mensaje_at ?? ""].join("|"),
      clase: "chat" as const,
      href: `/cartera/conversaciones/${c.id}`,
    }));
    const gps = await alertasGpsPendientes();
    const extras: AlertaEscalada[] = gps.map((g) => ({
      id: g.id,
      titulo: g.titulo,
      motivo: g.motivo,
      desde: g.desde,
      preview: null,
      huella: `${g.id}|${g.desde}|${g.motivo}`,
      clase: "gps" as const,
      href: hrefRastreo(g.titulo),
    }));
    const salidas = await salidasPendientesAval();
    const extrasSalida: AlertaEscalada[] = salidas.map((s) => ({
      id: s.id,
      titulo: s.titulo,
      motivo: s.motivo,
      desde: s.desde,
      preview: null,
      huella: `${s.id}|${s.desde}|${s.motivo}`,
      clase: "salida" as const,
      href: "/cartera/pagos",
    }));
    const ops = await salidasAlertasPendientes();
    const extrasOps: AlertaEscalada[] = ops.map((s) => ({
      id: s.id,
      titulo: s.titulo,
      motivo: s.motivo,
      desde: s.desde,
      preview: null,
      huella: `${s.id}|${s.desde}|${s.motivo}`,
      clase: s.tipo.startsWith("gps_") ? ("gps" as const) : ("salida" as const),
      href: s.tipo.startsWith("gps_") ? hrefRastreo(s.titulo) : "/cartera/pagos",
    }));
    return [...extrasOps, ...extrasSalida, ...extras, ...chats];
  } catch {
    return [];
  }
}

/** "Carro GOLD · G10" → /cartera/rastreo?carro=G10 */
function hrefRastreo(titulo: string): string {
  const m = /carro\s+(.+)$/i.exec(titulo.trim());
  const raw = (m?.[1] ?? titulo).split("·").pop()?.trim();
  if (!raw) return "/cartera/rastreo";
  return `/cartera/rastreo?carro=${encodeURIComponent(raw)}`;
}

export async function accionVerAlertaGps(id: string): Promise<void> {
  if (id.startsWith("salerta:")) {
    await marcarAlertaSalidaVista(id);
    revalidatePath("/cartera/rastreo");
    revalidatePath("/cartera/pagos");
    return;
  }
  await marcarAlertaGpsVista(id);
  revalidatePath("/cartera/rastreo");
}
