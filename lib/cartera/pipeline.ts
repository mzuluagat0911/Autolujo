// Pipeline de cartera: registra conversaciones/mensajes, sube comprobantes a
// Storage, resuelve el contrato por # de carro y crea el registro de pago.
// Todo el dinero se maneja aquí (código determinista), no en el LLM.

import { createServerSupabase } from "@/lib/supabase/server";
import type { Comprobante } from "@/lib/ai/comprobante";

const BUCKET = "comprobantes";

export type Conversacion = {
  id: string;
  wa_numero: string;
  cliente_id: string | null;
  vehiculo_id: string | null;
  contrato_id: string | null;
  etiqueta: string | null;
  modo: "agente" | "humano";
};

const SEL_CONV = "id, wa_numero, cliente_id, vehiculo_id, contrato_id, etiqueta, modo";

/** Busca (o crea) la conversación de un número de WhatsApp. */
export async function obtenerConversacion(waNumero: string): Promise<Conversacion> {
  const sb = createServerSupabase();
  const { data: existente } = await sb
    .from("conversaciones")
    .select(SEL_CONV)
    .eq("wa_numero", waNumero)
    .maybeSingle();
  if (existente) return existente as Conversacion;

  // Intento vincular a un cliente por su whatsapp/teléfono.
  const { data: cli } = await sb
    .from("clientes")
    .select("id")
    .or(`whatsapp.ilike.%${waNumero},telefono.ilike.%${waNumero}`)
    .limit(1)
    .maybeSingle();

  const { data: creada, error } = await sb
    .from("conversaciones")
    .insert({ wa_numero: waNumero, cliente_id: cli?.id ?? null })
    .select(SEL_CONV)
    .single();
  if (error) throw error;
  return creada as Conversacion;
}

/** ¿La ventana de 24h está abierta? (el cliente escribió en las últimas 24h). */
export function ventanaAbierta(ultimoEntranteAt: string | null | undefined): boolean {
  if (!ultimoEntranteAt) return false;
  return Date.now() - new Date(ultimoEntranteAt).getTime() < 24 * 60 * 60 * 1000;
}

/** El equipo toma el chat: el agente deja de responder en esta conversación. */
export async function tomarChat(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ modo: "humano", necesita_humano: false })
    .eq("id", conversacionId);
}

/** El equipo devuelve el chat al agente. */
export async function devolverAlAgente(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ modo: "agente", necesita_humano: false, motivo_escalada: null })
    .eq("id", conversacionId);
}

/** Marca que la conversación necesita a una persona (escalada del agente). */
export async function marcarEscalada(conversacionId: string, motivo: string | null): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ modo: "humano", necesita_humano: true, motivo_escalada: motivo })
    .eq("id", conversacionId);
}

/** Marca que hay un mensaje nuevo del cliente esperando a la persona que lleva el chat. */
export async function marcarNecesitaHumano(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb.from("conversaciones").update({ necesita_humano: true }).eq("id", conversacionId);
}

/**
 * Reclama un mensaje entrante como "en proceso" usando el UNIQUE de
 * wa_message_id como candado. Si Meta reintenta el webhook, el segundo intento
 * choca con el unique y devuelve null → no se reprocesa (no duplica pagos).
 * Devuelve el id del mensaje si lo reclamó, o null si ya existía.
 */
export async function reclamarMensajeEntrante(opts: {
  conversacionId: string;
  waMessageId?: string | null;
  tipo: "text" | "image";
  texto: string;
}): Promise<string | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("mensajes")
    .insert({
      conversacion_id: opts.conversacionId,
      direccion: "in",
      tipo: opts.tipo,
      texto: opts.texto,
      wa_message_id: opts.waMessageId ?? null,
    })
    .select("id")
    .single();
  if (error) return null; // violación de unique (wa_message_id) → duplicado

  const ahora = new Date().toISOString();
  // no_leidos: se incrementa en SQL para evitar condiciones de carrera.
  const { data: conv } = await sb
    .from("conversaciones")
    .select("no_leidos")
    .eq("id", opts.conversacionId)
    .maybeSingle();
  const noLeidos = Number((conv as { no_leidos?: number } | null)?.no_leidos ?? 0) + 1;
  await sb
    .from("conversaciones")
    .update({
      ultimo_mensaje_at: ahora,
      ultimo_entrante_at: ahora, // el cliente escribió → abre/renueva la ventana de 24h
      ultimo_texto: opts.texto.slice(0, 140),
      no_leidos: noLeidos,
    })
    .eq("id", opts.conversacionId);
  return data.id as string;
}

/** El equipo abrió el chat: limpia el contador de no leídos. */
export async function marcarLeida(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb.from("conversaciones").update({ no_leidos: 0 }).eq("id", conversacionId);
}

/** Completa un mensaje ya reclamado (ej. la imagen del comprobante y el pago). */
export async function completarMensaje(
  mensajeId: string,
  patch: { mediaUrl?: string | null; pagoId?: string | null },
): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("mensajes")
    .update({ media_url: patch.mediaUrl ?? null, pago_id: patch.pagoId ?? null })
    .eq("id", mensajeId);
}

/** Registra un mensaje y actualiza el resumen de la conversación. */
export async function registrarMensaje(opts: {
  conversacionId: string;
  direccion: "in" | "out";
  tipo?: "text" | "image" | "system";
  texto?: string | null;
  mediaUrl?: string | null;
  waMessageId?: string | null;
  pagoId?: string | null;
  enviadoPor?: string | null;
}): Promise<{ nuevo: boolean }> {
  const sb = createServerSupabase();

  // Idempotencia: si ya registramos este wa_message_id, no repetir.
  if (opts.waMessageId) {
    const { data: dup } = await sb
      .from("mensajes")
      .select("id")
      .eq("wa_message_id", opts.waMessageId)
      .maybeSingle();
    if (dup) return { nuevo: false };
  }

  await sb.from("mensajes").insert({
    conversacion_id: opts.conversacionId,
    direccion: opts.direccion,
    tipo: opts.tipo ?? "text",
    texto: opts.texto ?? null,
    media_url: opts.mediaUrl ?? null,
    wa_message_id: opts.waMessageId ?? null,
    pago_id: opts.pagoId ?? null,
    enviado_por: opts.enviadoPor ?? null,
  });

  const resumen =
    opts.texto ?? (opts.tipo === "image" ? "📷 Comprobante" : "Mensaje");
  await sb
    .from("conversaciones")
    .update({
      ultimo_mensaje_at: new Date().toISOString(),
      ultimo_texto: resumen.slice(0, 140),
    })
    .eq("id", opts.conversacionId);

  return { nuevo: true };
}

/** Últimos mensajes de la conversación (para darle memoria al agente). */
export async function historialReciente(
  conversacionId: string,
  limite = 10,
): Promise<{ direccion: "in" | "out"; texto: string }[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("mensajes")
    .select("direccion, texto, tipo")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: false })
    .limit(limite);
  const filas = ((data ?? []) as { direccion: "in" | "out"; texto: string | null; tipo: string }[])
    .filter((m) => m.tipo !== "system" && m.texto)
    .reverse();
  return filas.map((m) => ({ direccion: m.direccion, texto: m.texto as string }));
}

/** Sube la imagen del comprobante al bucket privado. Devuelve el path. */
export async function subirComprobante(bytes: Buffer, mime: string): Promise<string> {
  const sb = createServerSupabase();
  const ext = mime.includes("png") ? "png" : "jpg";
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

type ResolucionCarro = {
  vehiculoId: string | null;
  contratoId: string | null;
  clienteId: string | null;
  etiqueta: string | null;
  estado: "ok" | "sin_contrato" | "ambiguo" | "sin_carro";
};

/** # de carro (del comentario) → vehículo → contrato ACTIVO. */
export async function resolverContratoPorCarro(numeroCarro: string | null): Promise<ResolucionCarro> {
  const vacio: ResolucionCarro = {
    vehiculoId: null, contratoId: null, clienteId: null, etiqueta: null, estado: "sin_carro",
  };
  if (!numeroCarro) return vacio;
  const sb = createServerSupabase();

  const num = numeroCarro.replace(/\D/g, "") || numeroCarro; // "CARRO 144" -> "144"
  const { data: vehs } = await sb
    .from("vehiculos")
    .select("id, numero, empresa:empresas(codigo)")
    .eq("numero", num);
  if (!vehs?.length) return { ...vacio, estado: "sin_carro" };

  const vehIds = vehs.map((v) => v.id);
  const { data: contratos } = await sb
    .from("contratos")
    .select("id, cliente_id, vehiculo_id")
    .in("vehiculo_id", vehIds)
    .eq("estado", "activo");

  const etiqueta = `Carro ${num}`;
  if (!contratos?.length) {
    return { vehiculoId: vehs[0].id, contratoId: null, clienteId: null, etiqueta, estado: "sin_contrato" };
  }
  if (contratos.length > 1) {
    return { vehiculoId: null, contratoId: null, clienteId: null, etiqueta, estado: "ambiguo" };
  }
  const c = contratos[0];
  return { vehiculoId: c.vehiculo_id, contratoId: c.id, clienteId: c.cliente_id, etiqueta, estado: "ok" };
}

type ResultadoPago = {
  pagoId: string;
  comprobantePath: string;
  resolucion: ResolucionCarro;
  estadoConciliacion: "pendiente" | "manual";
};

/**
 * Flujo completo de un comprobante: sube imagen, resuelve carro/contrato,
 * crea el pago (pendiente de conciliación) y actualiza la conversación.
 */
export async function procesarPagoComprobante(opts: {
  conversacion: Conversacion;
  comprobante: Comprobante;
  bytes: Buffer;
  mime: string;
}): Promise<ResultadoPago> {
  const sb = createServerSupabase();
  const { conversacion, comprobante, bytes, mime } = opts;

  const path = await subirComprobante(bytes, mime);
  const resolucion = await resolverContratoPorCarro(comprobante.numero_carro);

  // Si resolvió un solo contrato activo → queda pendiente de conciliación.
  // Si no (sin carro / sin contrato / ambiguo) → revisión manual.
  const estadoConciliacion = resolucion.estado === "ok" ? "pendiente" : "manual";

  const { data: pago, error } = await sb
    .from("pagos")
    .insert({
      contrato_id: resolucion.contratoId,
      cliente_id: resolucion.clienteId ?? conversacion.cliente_id,
      fecha: comprobante.fecha ?? new Date().toISOString().slice(0, 10),
      monto: comprobante.monto ?? 0,
      banco: comprobante.banco,
      referencia: comprobante.referencia,
      comprobante_url: path,
      numero_carro: comprobante.numero_carro,
      estado_conciliacion: estadoConciliacion,
      notas: `Lectura IA (confianza: ${comprobante.confianza}). Resolución carro: ${resolucion.estado}.`,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Enriquecer la conversación con el carro/contrato detectado.
  if (resolucion.vehiculoId || resolucion.contratoId) {
    await sb
      .from("conversaciones")
      .update({
        vehiculo_id: resolucion.vehiculoId ?? conversacion.vehiculo_id,
        contrato_id: resolucion.contratoId ?? conversacion.contrato_id,
        etiqueta: resolucion.etiqueta ?? conversacion.etiqueta,
      })
      .eq("id", conversacion.id);
  }

  return { pagoId: pago.id as string, comprobantePath: path, resolucion, estadoConciliacion };
}
