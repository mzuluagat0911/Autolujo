// Fotos que llegaron al chat y se quedaron sin fila en Comprobantes.
// El webhook guarda la imagen primero; si Meta deja de reintentar con el
// candado vencido, la foto se ve en el hilo y el pago nunca nace.

import { leerComprobantes } from "@/lib/ai/comprobante";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  bajarArchivoComprobante,
  cerrarLecturaImagen,
  estadoLecturaImagen,
  LECTURA_LISTA,
  procesarPagoComprobante,
  soltarLecturaImagen,
  tomarLecturaImagen,
  type Conversacion,
} from "@/lib/cartera/pipeline";

const SEL_CONV = "id, wa_numero, cliente_id, vehiculo_id, contrato_id, etiqueta, modo";

type MensajeHuerfano = {
  id: string;
  media_url: string;
  enviado_por: string | null;
  conversacion_id: string;
  created_at: string;
};

/**
 * Imágenes con archivo en Storage, sin pago, y con el candado libre (null o
 * lectura vencida). No toca las que ya se cerraron a propósito (`sistema:lista`).
 */
export async function listarFotosSinPago(limite = 20): Promise<MensajeHuerfano[]> {
  const sb = createServerSupabase();
  // No filtrar `enviado_por != lista` en SQL: en Postgres NULL no calza y
  // se perderían las fotos con candado suelto (las que más hay que retomar).
  const { data, error } = await sb
    .from("mensajes")
    .select("id, media_url, enviado_por, pago_id, conversacion_id, created_at, tipo")
    .eq("tipo", "image")
    .eq("direccion", "in")
    .is("pago_id", null)
    .not("media_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(limite * 4, 40));
  if (error || !data) return [];

  const ahora = Date.now();
  const out: MensajeHuerfano[] = [];
  for (const row of data as {
    id: string;
    media_url: string | null;
    enviado_por: string | null;
    pago_id: string | null;
    conversacion_id: string;
    created_at: string;
  }[]) {
    if (!row.media_url) continue;
    if (row.enviado_por === LECTURA_LISTA) continue;
    if (estadoLecturaImagen({ pagoId: row.pago_id, enviadoPor: row.enviado_por }, ahora) !== "tomar") {
      continue;
    }
    out.push({
      id: row.id,
      media_url: row.media_url,
      enviado_por: row.enviado_por,
      conversacion_id: row.conversacion_id,
      created_at: row.created_at,
    });
    if (out.length >= limite) break;
  }
  return out;
}

async function conversacionDe(id: string): Promise<Conversacion | null> {
  const sb = createServerSupabase();
  const { data } = await sb.from("conversaciones").select(SEL_CONV).eq("id", id).maybeSingle();
  return (data as Conversacion | null) ?? null;
}

/**
 * Relee una foto huérfana y crea el pago pendiente si la IA confirma comprobante.
 * Devuelve cuántos pagos nacieron (0 si no era comprobante o ya estaba ocupada).
 */
export async function reprocesarFotoSinPago(mensajeId: string): Promise<number> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("mensajes")
    .select("id, media_url, enviado_por, pago_id, conversacion_id, tipo")
    .eq("id", mensajeId)
    .maybeSingle();
  const row = data as {
    id: string;
    media_url: string | null;
    enviado_por: string | null;
    pago_id: string | null;
    conversacion_id: string;
    tipo: string;
  } | null;
  if (!row || row.tipo !== "image" || !row.media_url || row.pago_id) return 0;
  if (row.enviado_por === LECTURA_LISTA) return 0;

  const conv = await conversacionDe(row.conversacion_id);
  if (!conv) return 0;

  const bytes = await bajarArchivoComprobante(row.media_url);
  if (!bytes) return 0;

  // Candado vencido: suelta restos viejos antes de tomar el turno.
  if (row.enviado_por) await soltarLecturaImagen(mensajeId);
  const turno = await tomarLecturaImagen(mensajeId);
  if (turno !== "tomar") return 0;

  try {
    const lista = (await leerComprobantes(bytes, "image/jpeg")).filter((x) => x.es_comprobante);
    if (lista.length === 0) {
      await cerrarLecturaImagen(mensajeId, null);
      return 0;
    }
    let primerPago: string | null = null;
    let creados = 0;
    for (const c of lista) {
      const res = await procesarPagoComprobante({
        conversacion: conv,
        comprobante: c,
        bytes,
        mime: "image/jpeg",
        path: row.media_url,
      });
      if (res.pagoId) {
        creados++;
        if (!primerPago) primerPago = res.pagoId;
      }
    }
    await cerrarLecturaImagen(mensajeId, primerPago);
    return creados;
  } catch (e) {
    console.error("[comprobantes-huerfanos] lectura falló:", e);
    await soltarLecturaImagen(mensajeId);
    throw e;
  }
}

/** Barrido corto para el cron: reintenta unas pocas fotos sin pago. */
export async function recuperarComprobantesHuerfanos(limite = 10): Promise<{
  revisadas: number;
  creados: number;
  errores: number;
  detalleErrores: string[];
}> {
  const fotos = await listarFotosSinPago(limite);
  let creados = 0;
  let errores = 0;
  const detalleErrores: string[] = [];
  for (const f of fotos) {
    try {
      creados += await reprocesarFotoSinPago(f.id);
    } catch (e) {
      errores++;
      const msg = e instanceof Error ? e.message : String(e);
      if (detalleErrores.length < 5) {
        detalleErrores.push(`${f.id.slice(0, 8)}… ${msg.slice(0, 180)}`);
      }
    }
  }
  return { revisadas: fotos.length, creados, errores, detalleErrores };
}
