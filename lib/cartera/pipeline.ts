// Pipeline de cartera: registra conversaciones/mensajes, sube comprobantes a
// Storage, resuelve el contrato por # de carro y crea el registro de pago.
// Todo el dinero se maneja aquí (código determinista), no en el LLM.

import { createServerSupabase } from "@/lib/supabase/server";
import type { Comprobante } from "@/lib/ai/comprobante";

const BUCKET = "comprobantes";

type Conversacion = {
  id: string;
  wa_numero: string;
  cliente_id: string | null;
  vehiculo_id: string | null;
  contrato_id: string | null;
  etiqueta: string | null;
};

/** Busca (o crea) la conversación de un número de WhatsApp. */
export async function obtenerConversacion(waNumero: string): Promise<Conversacion> {
  const sb = createServerSupabase();
  const { data: existente } = await sb
    .from("conversaciones")
    .select("id, wa_numero, cliente_id, vehiculo_id, contrato_id, etiqueta")
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
    .select("id, wa_numero, cliente_id, vehiculo_id, contrato_id, etiqueta")
    .single();
  if (error) throw error;
  return creada as Conversacion;
}

/** ¿Ya registramos este mensaje de Meta? (idempotencia antes de trabajo pesado). */
export async function mensajeYaExiste(waMessageId?: string | null): Promise<boolean> {
  if (!waMessageId) return false;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("mensajes")
    .select("id")
    .eq("wa_message_id", waMessageId)
    .maybeSingle();
  return !!data;
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

  return { pagoId: pago.id as string, resolucion, estadoConciliacion };
}
