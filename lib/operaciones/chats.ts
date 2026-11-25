// Bandeja del WhatsApp de mantenimiento (+507 6623-6501). No mezcla cobro ni comercial.

import { createServerSupabase } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/cartera/telefono";
import { sendText } from "@/lib/whatsapp/client";
import { phoneIdMantenimiento } from "./whatsapp";

export type ChatMantenimiento = {
  id: string;
  waNumero: string;
  nombre: string | null;
  ultimoTexto: string | null;
  ultimoMensajeAt: string | null;
  noLeidos: number;
};

export type MensajeMantenimiento = {
  id: string;
  direccion: "in" | "out";
  texto: string | null;
  createdAt: string;
  autorNombre: string | null;
};

function tablaAusente(message: string): boolean {
  return /conversaciones_mantenimiento|mensajes_mantenimiento|schema cache|could not find the table/i.test(
    message,
  );
}

export async function listarChatsMantenimiento(): Promise<{
  chats: ChatMantenimiento[];
  error: string | null;
}> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("conversaciones_mantenimiento")
    .select("id, wa_numero, nombre, ultimo_texto, ultimo_mensaje_at, no_leidos")
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
    .limit(80);
  if (error) {
    if (tablaAusente(error.message)) {
      return { chats: [], error: "Falta aplicar la migración 0058 (chats de mantenimiento)." };
    }
    return { chats: [], error: error.message };
  }
  return {
    chats: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      waNumero: String(r.wa_numero ?? ""),
      nombre: (r.nombre as string | null) ?? null,
      ultimoTexto: (r.ultimo_texto as string | null) ?? null,
      ultimoMensajeAt: (r.ultimo_mensaje_at as string | null) ?? null,
      noLeidos: Number(r.no_leidos) || 0,
    })),
    error: null,
  };
}

export async function hiloMantenimiento(conversacionId: string): Promise<{
  mensajes: MensajeMantenimiento[];
  error: string | null;
}> {
  const sb = createServerSupabase();
  await sb.from("conversaciones_mantenimiento").update({ no_leidos: 0 }).eq("id", conversacionId);
  const { data, error } = await sb
    .from("mensajes_mantenimiento")
    .select("id, direccion, texto, created_at, autor:equipo!mensajes_mantenimiento_autor_id_fkey(nombre)")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return { mensajes: [], error: error.message };
  return {
    mensajes: ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const autor = Array.isArray(r.autor) ? r.autor[0] : r.autor;
      return {
        id: String(r.id),
        direccion: r.direccion as "in" | "out",
        texto: (r.texto as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
        autorNombre: (autor as { nombre?: string } | null)?.nombre ?? null,
      };
    }),
    error: null,
  };
}

/** Entrante o saliente desde el webhook / la bandeja. */
export async function guardarMensajeMantenimiento(input: {
  waNumero: string;
  texto: string | null;
  direccion: "in" | "out";
  waMessageId?: string | null;
  nombrePerfil?: string | null;
  autorId?: string | null;
}): Promise<{ conversacionId: string } | null> {
  const wa = normalizarTelefono(input.waNumero) ?? String(input.waNumero ?? "").replace(/\D/g, "");
  if (!wa) return null;
  const sb = createServerSupabase();
  const ahora = new Date().toISOString();

  const { data: prev } = await sb
    .from("conversaciones_mantenimiento")
    .select("id, no_leidos, nombre")
    .eq("wa_numero", wa)
    .maybeSingle();

  let conversacionId = (prev as { id: string } | null)?.id ?? null;
  if (!conversacionId) {
    const { data: creada, error } = await sb
      .from("conversaciones_mantenimiento")
      .insert({
        wa_numero: wa,
        nombre: input.nombrePerfil?.trim() || null,
        ultimo_mensaje_at: ahora,
        ultimo_entrante_at: input.direccion === "in" ? ahora : null,
        ultimo_texto: (input.texto ?? "").slice(0, 280) || null,
        no_leidos: input.direccion === "in" ? 1 : 0,
        updated_at: ahora,
      })
      .select("id")
      .single();
    if (error || !creada) {
      console.error("[mant-chat] crear conv", error?.message);
      return null;
    }
    conversacionId = (creada as { id: string }).id;
  } else {
    const noLeidos = Number((prev as { no_leidos?: number }).no_leidos) || 0;
    const patch: Record<string, unknown> = {
      ultimo_mensaje_at: ahora,
      ultimo_texto: (input.texto ?? "").slice(0, 280) || null,
      updated_at: ahora,
    };
    if (input.direccion === "in") {
      patch.ultimo_entrante_at = ahora;
      patch.no_leidos = noLeidos + 1;
    }
    if (input.nombrePerfil?.trim() && !(prev as { nombre?: string | null }).nombre) {
      patch.nombre = input.nombrePerfil.trim();
    }
    await sb.from("conversaciones_mantenimiento").update(patch).eq("id", conversacionId);
  }

  if (input.waMessageId) {
    const { data: dup } = await sb
      .from("mensajes_mantenimiento")
      .select("id")
      .eq("wa_message_id", input.waMessageId)
      .maybeSingle();
    if (dup) return { conversacionId };
  }

  const { error: mErr } = await sb.from("mensajes_mantenimiento").insert({
    conversacion_id: conversacionId,
    direccion: input.direccion,
    texto: input.texto,
    wa_message_id: input.waMessageId ?? null,
    autor_id: input.autorId ?? null,
  });
  if (mErr) console.error("[mant-chat] mensaje", mErr.message);
  return { conversacionId };
}

export async function responderMantenimiento(input: {
  conversacionId: string;
  texto: string;
  autorId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const texto = input.texto.trim();
  if (!texto) return { ok: false, error: "Escribí el mensaje." };
  const phoneId = phoneIdMantenimiento();
  if (!phoneId) return { ok: false, error: "Falta WHATSAPP_MANTENIMIENTO_PHONE_NUMBER_ID." };

  const sb = createServerSupabase();
  const { data: conv, error } = await sb
    .from("conversaciones_mantenimiento")
    .select("id, wa_numero")
    .eq("id", input.conversacionId)
    .maybeSingle();
  if (error || !conv) return { ok: false, error: error?.message ?? "No encontré el chat." };

  const to = String((conv as { wa_numero: string }).wa_numero);
  try {
    await sendText(to, texto, phoneId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar por WhatsApp." };
  }

  await guardarMensajeMantenimiento({
    waNumero: to,
    texto,
    direccion: "out",
    autorId: input.autorId ?? null,
  });
  return { ok: true };
}
