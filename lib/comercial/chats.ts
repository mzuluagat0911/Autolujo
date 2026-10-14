// Bandeja del WhatsApp de ventas. No lee ni escribe `conversaciones` de cartera.

import { createServerSupabase } from "@/lib/supabase/server";
import { partirArchivo } from "./archivo";
import { entregaNueva } from "./entrega";
import { horasHastaSeguimiento } from "./lead";

export type EtapaComercial = "nuevo" | "conversacion" | "cita" | "visito" | "ganado" | "perdido";
export type TemperaturaLead = "caliente" | "tibio" | "frio";
export type ModoAtencionComercial = "lucia" | "humano";
export type FiltroBandejaComercial =
  | "por_atender"
  | "mios"
  | "sin_asignar"
  | "calientes"
  | "seguimiento"
  | "citas"
  | "cerrados"
  | "todos";

export type ChatComercial = {
  id: string;
  waNumero: string;
  nombre: string | null;
  ultimoTexto: string | null;
  ultimoMensajeAt: string | null;
  ultimoEntranteAt: string | null;
  noLeidos: number;
  necesitaHumano: boolean;
  motivo: string | null;
  anuncio: string | null;
  campanaId: string | null;
  etapa: EtapaComercial;
  temperatura: TemperaturaLead;
  temperaturaScore: number;
  temperaturaMotivo: string | null;
  asesorId: string | null;
  asesorNombre: string | null;
  modoAtencion: ModoAtencionComercial;
  interes: string | null;
  lugar: string | null;
  resumen: string | null;
  proximaAccion: string | null;
  seguimientoAt: string | null;
  intentosSeguimiento: number;
  resultado: string | null;
  motivoPerdida: string | null;
  cerradoAt: string | null;
  updatedAt: string | null;
  borrador: string | null;
};

export type MensajeComercial = {
  id: string;
  direccion: "in" | "out";
  texto: string | null;
  createdAt: string;
  autor: "cliente" | "lucia" | "humano" | "sistema";
  actorNombre: string | null;
  archivoUrl: string | null;
};

export type PaginaChatsComercial = {
  chats: ChatComercial[];
  siguienteCursor: string | null;
  error: string | null;
  crmDisponible: boolean;
};

const CHAT_SELECT_CRM =
  "id, wa_numero, nombre, ultimo_texto, ultimo_mensaje_at, ultimo_entrante_at, no_leidos, necesita_humano, motivo, anuncio, campana_id, etapa, temperatura, temperatura_score, temperatura_motivo, asesor_id, modo_atencion, interes, lugar, resumen, proxima_accion, seguimiento_at, intentos_seguimiento, resultado, motivo_perdida, cerrado_at, updated_at, asesor:equipo!conversaciones_comercial_asesor_id_fkey(nombre)";
const CHAT_SELECT_LEGACY =
  "id, wa_numero, ultimo_texto, ultimo_mensaje_at, ultimo_entrante_at, no_leidos, necesita_humano, motivo, anuncio, campana_id";
const MENSAJE_SELECT_CRM =
  "id, direccion, texto, created_at, autor, actor:equipo!mensajes_comercial_actor_id_fkey(nombre)";
const MENSAJE_SELECT_LEGACY = "id, direccion, texto, created_at";
const PAGE_SIZE = 50;

function tablaAusente(message: string): boolean {
  return /conversaciones_comercial|mensajes_comercial|schema cache|could not find the table/i.test(message);
}

function codificarCursor(chat: ChatComercial): string | null {
  if (!chat.ultimoMensajeAt) return null;
  return Buffer.from(`${chat.ultimoMensajeAt}|${chat.id}`, "utf8").toString("base64url");
}

function decodificarCursor(cursor: string | null | undefined): { at: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    return at && id ? { at, id } : null;
  } catch {
    return null;
  }
}

export async function listarChatsComercial(opts: {
  filtro?: FiltroBandejaComercial;
  asesorId?: string | null;
  buscar?: string;
  cursor?: string | null;
  limite?: number;
} = {}): Promise<PaginaChatsComercial> {
  try {
    const sb = createServerSupabase();
    const limite = Math.min(Math.max(opts.limite ?? PAGE_SIZE, 1), 100);
    let query = sb
      .from("conversaciones_comercial")
      .select(CHAT_SELECT_CRM)
      .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(limite + 1);

    const filtro = opts.filtro ?? "por_atender";
    if (filtro === "por_atender") {
      query = query
        .is("cerrado_at", null)
        .or(`no_leidos.gt.0,necesita_humano.eq.true,seguimiento_at.lte.${new Date().toISOString()}`);
    } else if (filtro === "mios" && opts.asesorId) {
      query = query.eq("asesor_id", opts.asesorId).is("cerrado_at", null);
    } else if (filtro === "sin_asignar") {
      query = query.is("asesor_id", null).is("cerrado_at", null);
    } else if (filtro === "calientes") {
      query = query.eq("temperatura", "caliente").is("cerrado_at", null);
    } else if (filtro === "seguimiento") {
      query = query.not("seguimiento_at", "is", null).is("cerrado_at", null);
    } else if (filtro === "citas") {
      query = query.eq("etapa", "cita").is("cerrado_at", null);
    } else if (filtro === "cerrados") {
      query = query.not("cerrado_at", "is", null);
    } else {
      query = query.is("cerrado_at", null);
    }

    const buscar = (opts.buscar ?? "").trim().slice(0, 80);
    if (buscar) {
      const limpio = buscar.replace(/[%(),]/g, " ");
      query = query.or(`nombre.ilike.%${limpio}%,wa_numero.ilike.%${limpio}%,interes.ilike.%${limpio}%`);
    }

    const cursor = decodificarCursor(opts.cursor);
    if (cursor) {
      query = query.or(
        `ultimo_mensaje_at.lt.${cursor.at},and(ultimo_mensaje_at.eq.${cursor.at},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error && /nombre|etapa|temperatura|asesor_id|modo_atencion|seguimiento_at|schema cache|relationship/i.test(error.message)) {
      const retry = await sb
        .from("conversaciones_comercial")
        .select(CHAT_SELECT_LEGACY)
        .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
        .limit(limite);
      if (retry.error) {
        return { chats: [], siguienteCursor: null, error: retry.error.message, crmDisponible: false };
      }
      return {
        chats: ((retry.data ?? []) as Record<string, unknown>[]).map(filaChat),
        siguienteCursor: null,
        error: "Falta aplicar la migración 0039 para activar el CRM completo.",
        crmDisponible: false,
      };
    }
    if (error) {
      return {
        chats: [],
        siguienteCursor: null,
        error: tablaAusente(error.message)
          ? "Falta la migración 0037. Los chats de ventas todavía no tienen bandeja."
          : error.message,
        crmDisponible: false,
      };
    }
    const filas = ((data ?? []) as Record<string, unknown>[]).map(filaChat);
    const hayMas = filas.length > limite;
    const chats = hayMas ? filas.slice(0, limite) : filas;
    return {
      chats,
      siguienteCursor: hayMas ? codificarCursor(chats[chats.length - 1]!) : null,
      error: null,
      crmDisponible: true,
    };
  } catch (e) {
    return {
      chats: [],
      siguienteCursor: null,
      error: e instanceof Error ? e.message : "No pude leer los chats de ventas.",
      crmDisponible: false,
    };
  }
}

export async function cambiosChatsComercial(desde: string): Promise<ChatComercial[]> {
  const fecha = new Date(desde);
  if (Number.isNaN(fecha.getTime())) return [];
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("conversaciones_comercial")
    .select(CHAT_SELECT_CRM)
    .gt("updated_at", fecha.toISOString())
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(filaChat);
}

export async function hiloComercial(
  id: string,
  opts: { antesDe?: string | null; limite?: number } = {},
): Promise<{ chat: ChatComercial | null; mensajes: MensajeComercial[]; hayMas: boolean }> {
  const sb = createServerSupabase();
  const { data: raw } = await sb.from("conversaciones_comercial").select("*").eq("id", id).maybeSingle();
  if (!raw) return { chat: null, mensajes: [], hayMas: false };
  const limite = Math.min(Math.max(opts.limite ?? 50, 1), 100);
  let query = sb
    .from("mensajes_comercial")
    .select(MENSAJE_SELECT_CRM)
    .eq("conversacion_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite + 1);
  if (opts.antesDe) query = query.lt("created_at", opts.antesDe);
  const principal = await query;
  let filas = (principal.data ?? []) as unknown as Record<string, unknown>[];
  if (principal.error && /autor|actor_id|relationship|schema cache/i.test(principal.error.message)) {
    let legacy = sb
      .from("mensajes_comercial")
      .select(MENSAJE_SELECT_LEGACY)
      .eq("conversacion_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limite + 1);
    if (opts.antesDe) legacy = legacy.lt("created_at", opts.antesDe);
    const retry = await legacy;
    filas = (retry.data ?? []) as unknown as Record<string, unknown>[];
  }
  const hayMas = filas.length > limite;
  const pagina = (hayMas ? filas.slice(0, limite) : filas).reverse();
  const mensajes = await Promise.all(pagina.map((fila) => conFoto(sb, filaMensaje(fila))));
  return {
    chat: filaChat(raw as Record<string, unknown>),
    mensajes,
    hayMas,
  };
}

export async function mensajesNuevosComercial(
  conversacionId: string,
  desde: string,
): Promise<MensajeComercial[]> {
  const fecha = new Date(desde);
  if (Number.isNaN(fecha.getTime())) return [];
  const sb = createServerSupabase();
  const principal = await sb
    .from("mensajes_comercial")
    .select(MENSAJE_SELECT_CRM)
    .eq("conversacion_id", conversacionId)
    .gt("created_at", fecha.toISOString())
    .order("created_at", { ascending: true })
    .limit(100);
  let filas = (principal.data ?? []) as unknown as Record<string, unknown>[];
  if (principal.error && /autor|actor_id|relationship|schema cache/i.test(principal.error.message)) {
    const retry = await sb
      .from("mensajes_comercial")
      .select(MENSAJE_SELECT_LEGACY)
      .eq("conversacion_id", conversacionId)
      .gt("created_at", fecha.toISOString())
      .order("created_at", { ascending: true })
      .limit(100);
    filas = (retry.data ?? []) as unknown as Record<string, unknown>[];
  }
  return Promise.all(filas.map((fila) => conFoto(sb, filaMensaje(fila))));
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
    .map((m) => ({ ...m, texto: partirArchivo(m.texto).texto }))
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
      .select("id, anuncio, no_leidos, campana_id, etapa, modo_atencion")
      .eq("wa_numero", opts.waNumero)
      .maybeSingle();
    if (previaRes.error && /campana_id|etapa|modo_atencion/i.test(previaRes.error.message)) {
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
        ultimo_texto: (partirArchivo(opts.texto).texto ?? opts.texto).slice(0, 240),
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
        ultimo_texto: (partirArchivo(opts.texto).texto ?? opts.texto).slice(0, 240),
        no_leidos: (prev.no_leidos ?? 0) + 1,
        anuncio: prev.anuncio ?? opts.anuncio ?? null,
        campana_id: prev.campana_id ?? opts.campanaId ?? null,
        ctwa_clid: opts.ctwaClid ?? undefined,
        campana_url: opts.campanaUrl ?? undefined,
        updated_at: ahora,
      };
      const upd = await sb.from("conversaciones_comercial").update(patch).eq("id", conversacionId);
      if (upd.error && /campana_id|ctwa_clid|campana_url|updated_at/i.test(upd.error.message)) {
        const { campana_id: _c, ctwa_clid: _t, campana_url: _u, updated_at: _a, ...sinCampana } = patch;
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
    await sb
      .from("seguimientos_comercial")
      .update({
        estado: "cancelado",
        motivo_cancelado: "El lead respondió.",
        updated_at: ahora,
      })
      .eq("conversacion_id", conversacionId)
      .eq("estado", "pendiente");
    return { conversacionId, repetido: false, error: null };
  } catch (e) {
    return { conversacionId: null, repetido: false, error: e instanceof Error ? e.message : "No pude guardar el chat." };
  }
}

export async function guardarBorradorComercial(conversacionId: string, texto: string): Promise<void> {
  const sb = createServerSupabase();
  const ahora = new Date().toISOString();
  const guardado = await sb
    .from("conversaciones_comercial")
    .update({
      borrador: texto.slice(0, 2000),
      proxima_accion: "Revisar el borrador de Lucía",
      updated_at: ahora,
    })
    .eq("id", conversacionId);
  if (guardado.error && /borrador/i.test(guardado.error.message)) {
    await sb
      .from("conversaciones_comercial")
      .update({
        proxima_accion: `Borrador: ${texto.slice(0, 220)}`,
        updated_at: ahora,
      })
      .eq("id", conversacionId);
  }
}

export async function limpiarBorradorComercial(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  const limpio = await sb
    .from("conversaciones_comercial")
    .update({ borrador: null, updated_at: new Date().toISOString() })
    .eq("id", conversacionId);
  if (limpio.error && /borrador/i.test(limpio.error.message)) return;
}

export async function registrarEntregasComercial(
  estados: { id?: string; status?: string }[],
): Promise<void> {
  const sb = createServerSupabase();
  for (const estado of estados) {
    if (!estado.id || !estado.status) continue;
    const actual = await sb
      .from("mensajes_comercial")
      .select("entrega")
      .eq("wa_message_id", estado.id)
      .maybeSingle();
    if (actual.error) return;
    const siguiente = entregaNueva(actual.data?.entrega as string | null, estado.status);
    if (!siguiente) continue;
    const patch = await sb
      .from("mensajes_comercial")
      .update({ entrega: siguiente, entrega_at: new Date().toISOString() })
      .eq("wa_message_id", estado.id);
    if (patch.error && /entrega/i.test(patch.error.message)) return;
  }
}

export async function registrarSalidaComercial(
  conversacionId: string,
  texto: string,
  opts: { autor?: "lucia" | "humano" | "sistema"; actorId?: string | null; waMessageId?: string | null } = {},
): Promise<MensajeComercial | null> {
  const sb = createServerSupabase();
  const ahora = new Date().toISOString();
  let insertado = await sb
    .from("mensajes_comercial")
    .insert({
      conversacion_id: conversacionId,
      direccion: "out",
      texto,
      autor: opts.autor ?? "lucia",
      actor_id: opts.actorId ?? null,
      ...(opts.waMessageId ? { wa_message_id: opts.waMessageId } : {}),
    })
    .select(MENSAJE_SELECT_CRM)
    .single();
  if (insertado.error && /autor|actor_id|relationship|schema cache/i.test(insertado.error.message)) {
    insertado = await sb
      .from("mensajes_comercial")
      .insert({
        conversacion_id: conversacionId,
        direccion: "out",
        texto,
      })
      .select(MENSAJE_SELECT_LEGACY)
      .single();
  }
  const { data: previa } = await sb
    .from("conversaciones_comercial")
    .select("primera_respuesta_at")
    .eq("id", conversacionId)
    .maybeSingle();
  const actualizado = await sb
    .from("conversaciones_comercial")
    .update({
      ultimo_mensaje_at: ahora,
      ultimo_texto: texto.slice(0, 240),
      updated_at: ahora,
      ...(!previa?.primera_respuesta_at ? { primera_respuesta_at: ahora } : {}),
    })
    .eq("id", conversacionId);
  if (actualizado.error && /primera_respuesta_at/i.test(actualizado.error.message)) {
    const sinRespuesta = await sb
      .from("conversaciones_comercial")
      .update({ ultimo_mensaje_at: ahora, ultimo_texto: texto.slice(0, 240), updated_at: ahora })
      .eq("id", conversacionId);
    if (sinRespuesta.error && /updated_at/i.test(sinRespuesta.error.message)) {
      await sb
        .from("conversaciones_comercial")
        .update({ ultimo_mensaje_at: ahora, ultimo_texto: texto.slice(0, 240) })
        .eq("id", conversacionId);
    }
  } else if (actualizado.error && /updated_at/i.test(actualizado.error.message)) {
    await sb
      .from("conversaciones_comercial")
      .update({ ultimo_mensaje_at: ahora, ultimo_texto: texto.slice(0, 240) })
      .eq("id", conversacionId);
  }
  if (insertado.error || !insertado.data) return null;
  return filaMensaje(insertado.data as Record<string, unknown>);
}

export async function marcarEscaladaComercial(conversacionId: string, motivo: string | null): Promise<void> {
  const sb = createServerSupabase();
  const actualizado = await sb
    .from("conversaciones_comercial")
    .update({
      necesita_humano: true,
      motivo: motivo ?? "Pasar a ventas",
      modo_atencion: "humano",
      proxima_accion: motivo ?? "Atender este lead",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversacionId);
  if (actualizado.error && /modo_atencion|proxima_accion|updated_at/i.test(actualizado.error.message)) {
    await sb
      .from("conversaciones_comercial")
      .update({ necesita_humano: true, motivo: motivo ?? "Pasar a ventas" })
      .eq("id", conversacionId);
  }
}

export async function marcarChatComercialLeido(id: string): Promise<void> {
  const sb = createServerSupabase();
  await sb.from("conversaciones_comercial").update({ no_leidos: 0 }).eq("id", id);
}

export type AsesorComercial = { id: string; nombre: string; rol: string };

export async function listarAsesoresComerciales(): Promise<AsesorComercial[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("equipo")
    .select("id, nombre, rol")
    .eq("activo", true)
    .in("rol", ["admin", "comercial"])
    .order("nombre");
  return (data ?? []) as AsesorComercial[];
}

async function registrarEventoComercial(
  conversacionId: string,
  tipo: string,
  actorId: string | null,
  detalle: Record<string, unknown> = {},
): Promise<void> {
  const sb = createServerSupabase();
  await sb.from("eventos_comercial").insert({
    conversacion_id: conversacionId,
    actor_id: actorId,
    tipo,
    detalle,
  });
}

export async function tomarChatComercial(
  conversacionId: string,
  asesorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = createServerSupabase();
  const ahora = new Date().toISOString();
  const { data, error } = await sb
    .from("conversaciones_comercial")
    .update({
      asesor_id: asesorId,
      modo_atencion: "humano",
      necesita_humano: false,
      motivo: null,
      etapa: "conversacion",
      updated_at: ahora,
    })
    .eq("id", conversacionId)
    .or(`asesor_id.is.null,asesor_id.eq.${asesorId}`)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Otro asesor ya tomó este chat." };
  await cancelarSeguimientosComercial(conversacionId, "Un asesor tomó el chat.");
  await registrarEventoComercial(conversacionId, "chat_tomado", asesorId);
  return { ok: true };
}

export async function actualizarFichaComercial(opts: {
  conversacionId: string;
  actorId: string;
  nombre?: string | null;
  etapa?: EtapaComercial;
  temperatura?: TemperaturaLead;
  interes?: string | null;
  lugar?: string | null;
  proximaAccion?: string | null;
  seguimientoAt?: string | null;
  resultado?: string | null;
  motivoPerdida?: string | null;
  asesorId?: string | null;
  modoAtencion?: ModoAtencionComercial;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = createServerSupabase();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("nombre" in opts) patch.nombre = opts.nombre || null;
  if (opts.etapa) patch.etapa = opts.etapa;
  if (opts.temperatura) patch.temperatura = opts.temperatura;
  if ("interes" in opts) patch.interes = opts.interes || null;
  if ("lugar" in opts) patch.lugar = opts.lugar || null;
  if ("proximaAccion" in opts) patch.proxima_accion = opts.proximaAccion || null;
  if ("seguimientoAt" in opts) patch.seguimiento_at = opts.seguimientoAt || null;
  if ("resultado" in opts) patch.resultado = opts.resultado || null;
  if ("motivoPerdida" in opts) patch.motivo_perdida = opts.motivoPerdida || null;
  if ("asesorId" in opts) patch.asesor_id = opts.asesorId || null;
  if (opts.modoAtencion) patch.modo_atencion = opts.modoAtencion;
  if (opts.etapa === "ganado" || opts.etapa === "perdido") {
    patch.cerrado_at = new Date().toISOString();
    patch.seguimiento_at = null;
  } else if (opts.etapa) {
    patch.cerrado_at = null;
  }
  const { error } = await sb.from("conversaciones_comercial").update(patch).eq("id", opts.conversacionId);
  if (error) return { ok: false, error: error.message };
  if (opts.etapa === "ganado" || opts.etapa === "perdido") {
    await cancelarSeguimientosComercial(opts.conversacionId, `Lead cerrado como ${opts.etapa}.`);
  }
  await registrarEventoComercial(opts.conversacionId, "ficha_actualizada", opts.actorId, patch);
  return { ok: true };
}

export async function guardarAnalisisComercial(opts: {
  conversacionId: string;
  temperatura: TemperaturaLead;
  score: number;
  motivo: string;
  resumen: string;
  interes?: string | null;
  lugar?: string | null;
  proximaAccion: string;
}): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones_comercial")
    .update({
      temperatura: opts.temperatura,
      temperatura_score: Math.min(Math.max(Math.round(opts.score), 0), 100),
      temperatura_motivo: opts.motivo.slice(0, 500),
      resumen: opts.resumen.slice(0, 1000),
      interes: opts.interes?.slice(0, 240) || null,
      lugar: opts.lugar?.slice(0, 160) || null,
      proxima_accion: opts.proximaAccion.slice(0, 300),
      etapa: "conversacion",
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.conversacionId)
    .not("etapa", "in", "(cita,visito,ganado,perdido)");
}

export async function luciaPuedeResponder(conversacionId: string): Promise<boolean> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("conversaciones_comercial")
    .select("modo_atencion, cerrado_at")
    .eq("id", conversacionId)
    .maybeSingle();
  if (error && /modo_atencion|cerrado_at/i.test(error.message)) return true;
  return Boolean(data && data.modo_atencion !== "humano" && !data.cerrado_at);
}

export async function cancelarSeguimientosComercial(
  conversacionId: string,
  motivo: string,
): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("seguimientos_comercial")
    .update({
      estado: "cancelado",
      motivo_cancelado: motivo.slice(0, 300),
      updated_at: new Date().toISOString(),
    })
    .eq("conversacion_id", conversacionId)
    .eq("estado", "pendiente");
  await sb
    .from("conversaciones_comercial")
    .update({ seguimiento_at: null, updated_at: new Date().toISOString() })
    .eq("id", conversacionId);
}

export async function cerrarLeadSinContacto(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  const ahora = new Date().toISOString();
  await cancelarSeguimientosComercial(conversacionId, "El lead pidió no recibir más mensajes.");
  await sb
    .from("conversaciones_comercial")
    .update({
      etapa: "perdido",
      resultado: "No contactar",
      motivo_perdida: "Pidió no recibir más mensajes.",
      modo_atencion: "humano",
      cerrado_at: ahora,
      seguimiento_at: null,
      updated_at: ahora,
    })
    .eq("id", conversacionId);
  await registrarEventoComercial(conversacionId, "opt_out", null);
}

export async function programarSiguienteSeguimiento(
  conversacionId: string,
  temperatura: TemperaturaLead,
): Promise<void> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("conversaciones_comercial")
    .select("intentos_seguimiento, modo_atencion, cerrado_at")
    .eq("id", conversacionId)
    .maybeSingle();
  if (!data || data.modo_atencion === "humano" || data.cerrado_at) return;
  const intento = Number(data.intentos_seguimiento ?? 0) + 1;
  const horas = horasHastaSeguimiento(temperatura, intento);
  if (horas == null) return;
  const programado = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
  await cancelarSeguimientosComercial(conversacionId, "Se recalculó la cadencia.");
  const { error } = await sb.from("seguimientos_comercial").upsert(
    {
      conversacion_id: conversacionId,
      programado_at: programado,
      estado: "pendiente",
      intento,
      motivo_cancelado: null,
      error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversacion_id,intento" },
  );
  if (!error) {
    await sb
      .from("conversaciones_comercial")
      .update({ seguimiento_at: programado, updated_at: new Date().toISOString() })
      .eq("id", conversacionId);
  }
}

function filaMensaje(row: Record<string, unknown>): MensajeComercial & { archivoPath: string | null } {
  const actorRaw = row.actor;
  const actor = Array.isArray(actorRaw) ? actorRaw[0] : actorRaw;
  const direccion = row.direccion === "out" ? "out" : "in";
  const autorRaw = String(row.autor ?? "");
  const autor: MensajeComercial["autor"] =
    direccion === "in"
      ? "cliente"
      : autorRaw === "humano" || autorRaw === "sistema"
        ? autorRaw
        : "lucia";
  const partes = partirArchivo((row.texto as string | null) ?? null);
  return {
    id: String(row.id),
    direccion,
    texto: partes.texto,
    createdAt: String(row.created_at ?? ""),
    autor,
    actorNombre:
      actor && typeof actor === "object"
        ? ((actor as { nombre?: string | null }).nombre ?? null)
        : null,
    archivoUrl: null,
    archivoPath: partes.archivo,
  };
}

async function conFoto(
  sb: ReturnType<typeof createServerSupabase>,
  mensaje: MensajeComercial & { archivoPath?: string | null },
): Promise<MensajeComercial> {
  const { archivoPath, ...resto } = mensaje;
  if (!archivoPath) return resto;
  const { data } = await sb.storage.from("comprobantes").createSignedUrl(archivoPath, 60 * 60);
  return { ...resto, archivoUrl: data?.signedUrl ?? null };
}

function filaChat(row: Record<string, unknown>): ChatComercial {
  const asesorRaw = row.asesor;
  const asesor = Array.isArray(asesorRaw) ? asesorRaw[0] : asesorRaw;
  return {
    id: String(row.id),
    waNumero: String(row.wa_numero ?? ""),
    nombre: (row.nombre as string | null) ?? null,
    ultimoTexto: (row.ultimo_texto as string | null) ?? null,
    ultimoMensajeAt: (row.ultimo_mensaje_at as string | null) ?? null,
    ultimoEntranteAt: (row.ultimo_entrante_at as string | null) ?? null,
    noLeidos: Number(row.no_leidos ?? 0),
    necesitaHumano: Boolean(row.necesita_humano),
    motivo: (row.motivo as string | null) ?? null,
    anuncio: (row.anuncio as string | null) ?? null,
    campanaId: (row.campana_id as string | null) ?? null,
    etapa: esEtapa(row.etapa) ? row.etapa : "nuevo",
    temperatura: esTemperatura(row.temperatura) ? row.temperatura : "tibio",
    temperaturaScore: Math.min(Math.max(Number(row.temperatura_score ?? 40), 0), 100),
    temperaturaMotivo: (row.temperatura_motivo as string | null) ?? null,
    asesorId: (row.asesor_id as string | null) ?? null,
    asesorNombre:
      asesor && typeof asesor === "object"
        ? ((asesor as { nombre?: string | null }).nombre ?? null)
        : null,
    modoAtencion: row.modo_atencion === "humano" ? "humano" : "lucia",
    interes: (row.interes as string | null) ?? null,
    lugar: (row.lugar as string | null) ?? null,
    resumen: (row.resumen as string | null) ?? null,
    proximaAccion: (row.proxima_accion as string | null) ?? null,
    seguimientoAt: (row.seguimiento_at as string | null) ?? null,
    intentosSeguimiento: Number(row.intentos_seguimiento ?? 0),
    resultado: (row.resultado as string | null) ?? null,
    motivoPerdida: (row.motivo_perdida as string | null) ?? null,
    cerradoAt: (row.cerrado_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    borrador: (row.borrador as string | null) ?? null,
  };
}

function esEtapa(value: unknown): value is EtapaComercial {
  return ["nuevo", "conversacion", "cita", "visito", "ganado", "perdido"].includes(String(value));
}

function esTemperatura(value: unknown): value is TemperaturaLead {
  return ["caliente", "tibio", "frio"].includes(String(value));
}
