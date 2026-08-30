"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendText } from "@/lib/whatsapp/client";
import {
  tomarChat,
  devolverAlAgente,
  registrarMensaje,
  ventanaAbierta,
  marcarLeida,
} from "@/lib/cartera/pipeline";
import type { ConversacionDetalle, ConversacionLista, Mensaje } from "./types";

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

    await sb
      .from("conversaciones")
      .update({ necesita_humano: false, no_leidos: 0 })
      .eq("id", id);

    revalidar(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." };
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

/** Carga el detalle de una conversación (mensajes + saldo). */
export async function cargarDetalle(
  id: string,
): Promise<{ detalle: ConversacionDetalle | null; error: string | null }> {
  try {
    const sb = createServerSupabase();
    const { data: conv, error } = await sb
      .from("conversaciones")
      .select(
        `${SEL_LISTA}, contrato_id`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!conv) return { detalle: null, error: null };

    const { data: msgs } = await sb
      .from("mensajes")
      .select("id, direccion, tipo, texto, media_url, enviado_por, created_at")
      .eq("conversacion_id", id)
      .order("created_at", { ascending: true });

    const mensajes = (msgs as Mensaje[]) ?? [];
    for (const m of mensajes) {
      if (m.media_url) {
        const { data: signed } = await sb.storage
          .from("comprobantes")
          .createSignedUrl(m.media_url, 3600);
        m.signedUrl = signed?.signedUrl ?? null;
      }
    }

    let saldo: number | null = null;
    const contratoId = (conv as { contrato_id: string | null }).contrato_id;
    if (contratoId) {
      const { data: s } = await sb
        .from("vw_saldo_contrato")
        .select("saldo_actual")
        .eq("contrato_id", contratoId)
        .maybeSingle();
      saldo = (s as { saldo_actual: number } | null)?.saldo_actual ?? null;
    }

    const base = conv as unknown as ConversacionLista & { contrato_id: string | null };
    const detalle: ConversacionDetalle = {
      ...base,
      saldo,
      mensajes,
      ventana_abierta: ventanaAbierta(base.ultimo_entrante_at),
    };
    return { detalle, error: null };
  } catch (e) {
    return { detalle: null, error: e instanceof Error ? e.message : "Error" };
  }
}
