// Bandeja del WhatsApp de ventas. No lee ni escribe `conversaciones` de cartera.

import { createServerSupabase } from "@/lib/supabase/server";

export type ChatComercial = {
  id: string;
  waNumero: string;
  ultimoTexto: string | null;
  ultimoMensajeAt: string | null;
  ultimoEntranteAt: string | null;
  noLeidos: number;
  necesitaHumano: boolean;
  motivo: string | null;
  anuncio: string | null;
  campanaId: string | null;
};

export type MensajeComercial = {
  id: string;
  direccion: "in" | "out";
  texto: string | null;
  createdAt: string;
};

function tablaAusente(message: string): boolean {
  return /conversaciones_comercial|mensajes_comercial|schema cache|could not find the table/i.test(message);
}

export async function listarChatsComercial(): Promise<{ chats: ChatComercial[]; error: string | null }> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("conversaciones_comercial")
      .select("id, wa_numero, ultimo_texto, ultimo_mensaje_at, ultimo_entrante_at, no_leidos, necesita_humano, motivo, anuncio, campana_id")
      .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error && /campana_id/i.test(error.message)) {
      const retry = await sb
        .from("conversaciones_comercial")
        .select("id, wa_numero, ultimo_texto, ultimo_mensaje_at, ultimo_entrante_at, no_leidos, necesita_humano, motivo, anuncio")
        .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (retry.error) {
        return { chats: [], error: retry.error.message };
      }
      return { chats: ((retry.data ?? []) as Record<string, unknown>[]).map(filaChat), error: null };
    }
    if (error) {
      return {
        chats: [],
        error: tablaAusente(error.message)
          ? "Falta la migración 0037. Los chats de ventas todavía no tienen bandeja."
          : error.message,
      };
    }
    return {
      chats: ((data ?? []) as Record<string, unknown>[]).map(filaChat),
      error: null,
    };
  } catch (e) {
    return { chats: [], error: e instanceof Error ? e.message : "No pude leer los chats de ventas." };
  }
}

export async function hiloComercial(id: string): Promise<{ chat: ChatComercial | null; mensajes: MensajeComercial[] }> {
  const sb = createServerSupabase();
  const { data: raw } = await sb.from("conversaciones_comercial").select("*").eq("id", id).maybeSingle();
  if (!raw) return { chat: null, mensajes: [] };
  const { data: msgs } = await sb
    .from("mensajes_comercial")
    .select("id, direccion, texto, created_at")
    .eq("conversacion_id", id)
    .order("created_at", { ascending: true })
    .limit(300);
  return {
    chat: filaChat(raw as Record<string, unknown>),
    mensajes: ((msgs ?? []) as { id: string; direccion: string; texto: string | null; created_at: string }[]).map((m) => ({
      id: m.id,
      direccion: m.direccion === "out" ? "out" : "in",
      texto: m.texto,
      createdAt: m.created_at,
    })),
  };
}

export async function historialParaLucia(conversacionId: string): Promise<{ direccion: "in" | "out"; texto: string }[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("mensajes_comercial")
    .select("direccion, texto")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: false })
    .limit(16);
  return ((data ?? []) as { direccion: string; texto: string | null }[])
    .reverse()
    .filter((m) => (m.texto ?? "").trim())
    .map((m) => ({ direccion: m.direccion === "out" ? "out" : "in", texto: m.texto!.trim() }));
}

/** Abre el hilo de ventas y guarda el mensaje entrante. No toca cartera. */
export async function registrarEntradaComercial(opts: {
  waNumero: string;
  texto: string;
  waMessageId?: string | null;
  anuncio?: string | null;
  campanaId?: string | null;
  ctwaClid?: string | null;
  campanaUrl?: string | null;
}): Promise<{ conversacionId: string | null; repetido: boolean; error: string | null }> {
  try {
    const sb = createServerSupabase();
    if (opts.waMessageId) {
      const { data: ya } = await sb
        .from("mensajes_comercial")
        .select("id")
        .eq("wa_message_id", opts.waMessageId)
        .maybeSingle();
      if (ya) return { conversacionId: null, repetido: true, error: null };
    }

    let previaRes = await sb
      .from("conversaciones_comercial")
      .select("id, anuncio, no_leidos, campana_id")
      .eq("wa_numero", opts.waNumero)
      .maybeSingle();
    if (previaRes.error && /campana_id/i.test(previaRes.error.message)) {
      previaRes = await sb
        .from("conversaciones_comercial")
        .select("id, anuncio, no_leidos")
        .eq("wa_numero", opts.waNumero)
        .maybeSingle();
    }
    const previa = previaRes.data;
    const ahora = new Date().toISOString();
    let conversacionId = (previa as { id: string } | null)?.id ?? null;
    if (!conversacionId) {
      const nuevo = {
        wa_numero: opts.waNumero,
        anuncio: opts.anuncio ?? null,
        campana_id: opts.campanaId ?? null,
        ctwa_clid: opts.ctwaClid ?? null,
        campana_url: opts.campanaUrl ?? null,
        ultimo_mensaje_at: ahora,
        ultimo_entrante_at: ahora,
        ultimo_texto: opts.texto.slice(0, 240),
        no_leidos: 1,
      };
      let ins = await sb.from("conversaciones_comercial").insert(nuevo).select("id").single();
      if (ins.error && /campana_id|ctwa_clid|campana_url/i.test(ins.error.message)) {
        const { campana_id: _c, ctwa_clid: _t, campana_url: _u, ...sinCampana } = nuevo;
        ins = await sb.from("conversaciones_comercial").insert(sinCampana).select("id").single();
      }
      if (ins.error) {
        return { conversacionId: null, repetido: false, error: ins.error.message };
      }
      conversacionId = (ins.data as { id: string }).id;
    } else {
      const prev = previa as { anuncio: string | null; no_leidos: number; campana_id?: string | null };
      const patch = {
        ultimo_mensaje_at: ahora,
        ultimo_entrante_at: ahora,
        ultimo_texto: opts.texto.slice(0, 240),
        no_leidos: (prev.no_leidos ?? 0) + 1,
        anuncio: prev.anuncio ?? opts.anuncio ?? null,
        campana_id: prev.campana_id ?? opts.campanaId ?? null,
        ctwa_clid: opts.ctwaClid ?? undefined,
        campana_url: opts.campanaUrl ?? undefined,
      };
      const upd = await sb.from("conversaciones_comercial").update(patch).eq("id", conversacionId);
      if (upd.error && /campana_id|ctwa_clid|campana_url/i.test(upd.error.message)) {
        const { campana_id: _c, ctwa_clid: _t, campana_url: _u, ...sinCampana } = patch;
        await sb.from("conversaciones_comercial").update(sinCampana).eq("id", conversacionId);
      }
    }

    const msg = await sb.from("mensajes_comercial").insert({
      conversacion_id: conversacionId,
      direccion: "in",
      texto: opts.texto,
      wa_message_id: opts.waMessageId ?? null,
    });
    if (msg.error) {
      if (/duplicate|23505/i.test(msg.error.message)) {
        return { conversacionId, repetido: true, error: null };
      }
      return { conversacionId, repetido: false, error: msg.error.message };
    }
    return { conversacionId, repetido: false, error: null };
  } catch (e) {
    return { conversacionId: null, repetido: false, error: e instanceof Error ? e.message : "No pude guardar el chat." };
  }
}

export async function registrarSalidaComercial(conversacionId: string, texto: string): Promise<void> {
  const sb = createServerSupabase();
  const ahora = new Date().toISOString();
  await sb.from("mensajes_comercial").insert({
    conversacion_id: conversacionId,
    direccion: "out",
    texto,
  });
  await sb
    .from("conversaciones_comercial")
    .update({ ultimo_mensaje_at: ahora, ultimo_texto: texto.slice(0, 240) })
    .eq("id", conversacionId);
}

export async function marcarEscaladaComercial(conversacionId: string, motivo: string | null): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones_comercial")
    .update({ necesita_humano: true, motivo: motivo ?? "Pasar a ventas" })
    .eq("id", conversacionId);
}

export async function marcarChatComercialLeido(id: string): Promise<void> {
  const sb = createServerSupabase();
  await sb.from("conversaciones_comercial").update({ no_leidos: 0 }).eq("id", id);
}

function filaChat(row: Record<string, unknown>): ChatComercial {
  return {
    id: String(row.id),
    waNumero: String(row.wa_numero ?? ""),
    ultimoTexto: (row.ultimo_texto as string | null) ?? null,
    ultimoMensajeAt: (row.ultimo_mensaje_at as string | null) ?? null,
    ultimoEntranteAt: (row.ultimo_entrante_at as string | null) ?? null,
    noLeidos: Number(row.no_leidos ?? 0),
    necesitaHumano: Boolean(row.necesita_humano),
    motivo: (row.motivo as string | null) ?? null,
    anuncio: (row.anuncio as string | null) ?? null,
    campanaId: (row.campana_id as string | null) ?? null,
  };
}
