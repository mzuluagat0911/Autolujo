// Recupera comprobantes de HOY (Panamá) para que vuelvan a la cola.
// No usa visión: OpenRouter sin crédito dejaba las fotos en el chat y sin pago.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
import {
  cerrarLecturaImagen,
  LECTURA_LISTA,
  type Conversacion,
} from "@/lib/cartera/pipeline";
import { restaurarComprobantesMalRechazados } from "@/lib/cartera/comprobante-validacion";

export const MARCA_RECUPERADO_SIN_LECTURA =
  "RECUPERADO_SIN_LECTURA: foto del chat sin fila en Comprobantes (crédito de visión agotado). Revisar monto/datos y cruzar con el banco.";

const SEL_CONV = "id, wa_numero, cliente_id, vehiculo_id, contrato_id, etiqueta, modo";

type FotoHoy = {
  id: string;
  media_url: string;
  conversacion_id: string;
  enviado_por: string | null;
  created_at: string;
};

function inicioHoyPanamaIso(hoy: string): string {
  // Panamá UTC−5: el día local empieza a las 05:00Z.
  return `${hoy}T05:00:00.000Z`;
}

async function conversacionDe(id: string): Promise<Conversacion | null> {
  const sb = createServerSupabase();
  const { data } = await sb.from("conversaciones").select(SEL_CONV).eq("id", id).maybeSingle();
  return (data as Conversacion | null) ?? null;
}

/** Fotos entrantes de hoy con archivo y sin pago (incluye las selladas sin fila). */
export async function listarFotosHoySinPago(limite = 200): Promise<FotoHoy[]> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const desde = inicioHoyPanamaIso(hoy);
  const { data, error } = await sb
    .from("mensajes")
    .select("id, media_url, enviado_por, pago_id, conversacion_id, created_at, tipo, direccion")
    .eq("tipo", "image")
    .eq("direccion", "in")
    .is("pago_id", null)
    .not("media_url", "is", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(limite);
  if (error || !data) return [];
  return (data as {
    id: string;
    media_url: string | null;
    enviado_por: string | null;
    conversacion_id: string;
    created_at: string;
  }[])
    .filter((r) => !!r.media_url)
    .map((r) => ({
      id: r.id,
      media_url: r.media_url as string,
      conversacion_id: r.conversacion_id,
      enviado_por: r.enviado_por,
      created_at: r.created_at,
    }));
}

/** Preferimos un vivo; si solo hay rechazado con esa foto, lo reabrimos. */
async function asegurarPagoPorPath(path: string): Promise<string | null> {
  const sb = createServerSupabase();
  const { data: vivos } = await sb
    .from("pagos")
    .select("id, estado_conciliacion")
    .eq("comprobante_url", path)
    .neq("estado_conciliacion", "rechazado")
    .order("created_at", { ascending: true })
    .limit(1);
  const vivo = (vivos as { id: string }[] | null)?.[0];
  if (vivo) return vivo.id;

  const { data: rech } = await sb
    .from("pagos")
    .select("id, notas")
    .eq("comprobante_url", path)
    .eq("estado_conciliacion", "rechazado")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = rech as { id: string; notas: string | null } | null;
  if (!row) return null;
  const notas = (row.notas ?? "")
    .split(" · ")
    .map((t) => t.trim())
    .filter((t) => t && !t.includes("comprobante repetido") && !t.includes("duplicado de recuperación"))
    .join(" · ") || null;
  await sb
    .from("pagos")
    .update({ estado_conciliacion: "pendiente", notas })
    .eq("id", row.id)
    .eq("estado_conciliacion", "rechazado");
  return row.id;
}

/**
 * Crea un pago pendiente a partir de la foto del chat, sin releer con IA.
 * Así vuelve a Comprobantes aunque OpenRouter no tenga crédito.
 */
export async function crearPagoDesdeFotoSinLectura(mensajeId: string): Promise<{
  pagoId: string | null;
  motivo: string;
}> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("mensajes")
    .select("id, media_url, pago_id, conversacion_id, tipo")
    .eq("id", mensajeId)
    .maybeSingle();
  const row = data as {
    id: string;
    media_url: string | null;
    pago_id: string | null;
    conversacion_id: string;
    tipo: string;
  } | null;
  if (!row || row.tipo !== "image" || !row.media_url) {
    return { pagoId: null, motivo: "mensaje_invalido" };
  }
  if (row.pago_id) return { pagoId: row.pago_id, motivo: "ya_tenia_pago" };

  const existente = await asegurarPagoPorPath(row.media_url);
  if (existente) {
    await cerrarLecturaImagen(mensajeId, existente);
    return { pagoId: existente, motivo: "path_ya_en_pagos" };
  }

  const conv = await conversacionDe(row.conversacion_id);
  if (!conv) return { pagoId: null, motivo: "sin_conversacion" };

  const carro =
    (conv.etiqueta ?? "").replace(/^carro\s+/i, "").trim() || null;
  const hoy = hoyPanama();
  const { data: pago, error } = await sb
    .from("pagos")
    .insert({
      contrato_id: conv.contrato_id,
      cliente_id: conv.cliente_id,
      fecha: hoy,
      pagado_at: new Date().toISOString(),
      monto: 0,
      banco: null,
      referencia: null,
      cuenta_destino: null,
      comprobante_url: row.media_url,
      numero_carro: carro,
      origen: "comprobante",
      estado_conciliacion: "pendiente",
      notas: `${MARCA_RECUPERADO_SIN_LECTURA} WhatsApp ${conv.wa_numero}.`,
    })
    .select("id")
    .single();
  if (error || !pago) {
    return { pagoId: null, motivo: error?.message ?? "insert_fallo" };
  }
  const pagoId = pago.id as string;
  await cerrarLecturaImagen(mensajeId, pagoId);
  // Si estaba sellada sin pago, igual queda lista con pago.
  if (row.media_url) {
    await sb
      .from("mensajes")
      .update({ enviado_por: LECTURA_LISTA, pago_id: pagoId })
      .eq("id", mensajeId);
  }
  return { pagoId, motivo: "creado" };
}

/**
 * Rechazados de hoy → pendiente solo si no hay ya otro vivo con la misma foto.
 * Si no, reabrir todos duplicaba la cola.
 */
export async function restaurarRechazadosDeHoy(): Promise<number> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const desde = inicioHoyPanamaIso(hoy);
  const { data, error } = await sb
    .from("pagos")
    .select("id, notas, estado_conciliacion, origen, created_at, fecha, comprobante_url")
    .eq("estado_conciliacion", "rechazado")
    .eq("origen", "comprobante")
    .or(`fecha.eq.${hoy},created_at.gte.${desde}`)
    .limit(400);
  if (error || !data?.length) return 0;

  let n = 0;
  for (const p of data as { id: string; notas: string | null; comprobante_url: string | null }[]) {
    if (p.comprobante_url) {
      const { data: vivo } = await sb
        .from("pagos")
        .select("id")
        .eq("comprobante_url", p.comprobante_url)
        .neq("estado_conciliacion", "rechazado")
        .neq("id", p.id)
        .limit(1)
        .maybeSingle();
      if (vivo) continue;
    }
    const notas = (p.notas ?? "")
      .split(" · ")
      .map((t) => t.trim())
      .filter(
        (t) =>
          t &&
          !t.includes("comprobante repetido") &&
          !t.includes("duplicado de recuperación"),
      )
      .join(" · ") || null;
    const { error: updErr } = await sb
      .from("pagos")
      .update({ estado_conciliacion: "pendiente", notas })
      .eq("id", p.id)
      .eq("estado_conciliacion", "rechazado");
    if (!updErr) n++;
  }
  return n;
}

/** Idempotente: cada foto de hoy sin pago_id gana una fila pendiente. */
export async function asegurarPagosDesdeFotosHoy(limite = 250): Promise<{
  fotosSinPago: number;
  pagosCreados: number;
  yaTenian: number;
  fallidos: { id: string; motivo: string }[];
}> {
  const fotos = await listarFotosHoySinPago(limite);
  let pagosCreados = 0;
  let yaTenian = 0;
  const fallidos: { id: string; motivo: string }[] = [];

  for (const f of fotos) {
    const res = await crearPagoDesdeFotoSinLectura(f.id);
    if (res.motivo === "creado") pagosCreados++;
    else if (res.motivo === "ya_tenia_pago" || res.motivo === "path_ya_en_pagos") yaTenian++;
    else fallidos.push({ id: f.id, motivo: res.motivo });
  }

  return {
    fotosSinPago: fotos.length,
    pagosCreados,
    yaTenian,
    fallidos: fallidos.slice(0, 20),
  };
}

export async function recuperarComprobantesDeHoy(): Promise<{
  hoy: string;
  restauradosMalRechazo: number;
  restauradosHoy: number;
  fotosSinPago: number;
  pagosCreados: number;
  yaTenian: number;
  fallidos: { id: string; motivo: string }[];
}> {
  const hoy = hoyPanama();
  const restauradosMalRechazo = await restaurarComprobantesMalRechazados();
  const restauradosHoy = await restaurarRechazadosDeHoy();
  const desdeFotos = await asegurarPagosDesdeFotosHoy(250);

  return {
    hoy,
    restauradosMalRechazo,
    restauradosHoy,
    ...desdeFotos,
  };
}
