// Envío del estado de cuenta por WhatsApp.
// Usado por: el botón manual (piloto) y el cron diario de las 9am.
//
// Plantilla principal: `extracto_detalle` (desglose rico variable).
// Fallback: al día / con atraso / estado_cuenta_diario si Meta aún no aprueba.

import { sendTemplate } from "@/lib/whatsapp/client";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "./fecha";
import { normalizarTelefono } from "./telefono";
import {
  estadoCuentaContrato,
  estadosCuentaHoy,
  money,
  type EstadoCuenta,
} from "./estado-cuenta";
import {
  acuerdoSaldoContrato,
  acuerdosSaldoPorContrato,
  armarExtractoDiario,
  cargosExtraAgrupados,
  cargosExtraPorContrato,
  lineasExtractoBase,
  type LineaExtracto,
} from "./extracto-desglose";
import {
  estaAlDia,
  previewEstadoCuenta,
  varsExtractoDetalle,
  type ExtractoCtx,
} from "./extracto-preview";
import { obtenerConversacion, registrarMensaje } from "./pipeline";

export { estaAlDia, previewEstadoCuenta, varsExtractoDetalle };
export type { ExtractoCtx };

const TEMPLATE_DETALLE = "extracto_detalle";
const TEMPLATE_AL_DIA = "extracto_al_dia";
const TEMPLATE_CON_ATRASO = "extracto_con_atraso";
const TEMPLATE_FALLBACK = "estado_cuenta_diario";

type ExtraCtx = ExtractoCtx;

function avisoRecargoDe(e: EstadoCuenta): string {
  return money(e.recargoSiTarda > 0.009 ? e.recargoSiTarda : e.penalidad);
}

function varsFallbackAlDia(e: EstadoCuenta): string[] {
  const [nombre, carro, fecha] = e.templateVars;
  return [
    nombre,
    carro,
    fecha,
    `${money(e.cuenta)} cuenta`,
    money(e.totalHoy),
    avisoRecargoDe(e),
  ];
}

function varsFallbackAtraso(e: EstadoCuenta): string[] {
  const [nombre, carro, fecha] = e.templateVars;
  const lineas = lineasExtractoBase(e);
  const cuenta = lineas.find((l) => l.etiqueta === "cuenta");
  const recargo = lineas.find((l) => l.etiqueta === "por no pagar");
  return [
    nombre,
    carro,
    fecha,
    `${money(cuenta?.monto ?? e.cuenta)} cuenta`,
    `${money(recargo?.monto ?? e.recargo)} por no pagar`,
    money(e.totalHoy),
    avisoRecargoDe(e),
  ];
}

function componentes(vars: string[]) {
  return [{ type: "body", parameters: vars.map((v) => ({ type: "text", text: v })) }];
}

export async function enrichExtracto(e: EstadoCuenta): Promise<ExtraCtx> {
  const [acuerdoSaldo, extras] = await Promise.all([
    acuerdoSaldoContrato(e.contratoId),
    cargosExtraAgrupados(e.contratoId),
  ]);
  return { acuerdoSaldo, extras };
}

async function enviarConFallbacks(to: string, e: EstadoCuenta, ctx: ExtraCtx): Promise<void> {
  try {
    await sendTemplate(to, TEMPLATE_DETALLE, "es", componentes(varsExtractoDetalle(e, ctx)));
    return;
  } catch (err) {
    console.error(
      "[envios] extracto_detalle falló:",
      err instanceof Error ? err.message : err,
    );
  }

  try {
    if (estaAlDia(e)) {
      await sendTemplate(to, TEMPLATE_AL_DIA, "es", componentes(varsFallbackAlDia(e)));
    } else {
      await sendTemplate(to, TEMPLATE_CON_ATRASO, "es", componentes(varsFallbackAtraso(e)));
    }
    return;
  } catch (err) {
    console.error(
      "[envios] extracto_al_dia/con_atraso falló, uso estado_cuenta_diario:",
      err instanceof Error ? err.message : err,
    );
  }

  await sendTemplate(to, TEMPLATE_FALLBACK, "es", componentes(e.templateVars));
}

function hoyStr(): string {
  return hoyPanama();
}

/** Envía el estado de cuenta de UN estado ya calculado y lo registra. Idempotente por día. */
export async function enviarYRegistrar(
  e: EstadoCuenta,
  opts: { forzar?: boolean; ctx?: ExtraCtx } = {},
): Promise<{ ok: boolean; error?: string }> {
  const sb = createServerSupabase();
  const fecha = hoyStr();

  const to = normalizarTelefono(e.waNumero);
  if (!to) {
    await registrar(sb, e, fecha, "fallido");
    return {
      ok: false,
      error: e.waNumero
        ? `El número del cliente no es válido: ${e.waNumero}`
        : "El cliente no tiene número de WhatsApp.",
    };
  }

  if (!opts.forzar) {
    const { data: prev } = await sb
      .from("estados_cuenta")
      .select("estado")
      .eq("contrato_id", e.contratoId)
      .eq("fecha", fecha)
      .maybeSingle();
    if (prev?.estado === "enviado") return { ok: true };
  }

  try {
    const ctx = opts.ctx ?? (await enrichExtracto(e));
    const armado = armarExtractoDiario(e, ctx);
    // No hay cobro hoy (adelantado, ya pagó, o solo domingo listado): no se escribe.
    if (armado.totalCobrarHoy <= 0.009) {
      return { ok: true };
    }
    const preview = previewEstadoCuenta(e, ctx);
    await enviarConFallbacks(to, e, ctx);
    await registrar(sb, e, fecha, "enviado");
    // Histórico del chat: el template de Meta no deja rastro solo; lo espejamos acá.
    await registrarExtractoEnChat(to, preview, e);
    return { ok: true };
  } catch (err) {
    await registrar(sb, e, fecha, "fallido");
    return { ok: false, error: err instanceof Error ? err.message : "Error al enviar." };
  }
}

/** Deja el extracto visible en /cartera/conversaciones. */
async function registrarExtractoEnChat(waNumero: string, preview: string, e: EstadoCuenta) {
  try {
    const conv = await obtenerConversacion(waNumero);
    // Asegura vínculo al contrato del extracto si el chat aún no lo tenía.
    if ((!conv.contrato_id || !conv.vehiculo_id) && e.contratoId) {
      const sb = createServerSupabase();
      const patch: Record<string, unknown> = {};
      if (!conv.contrato_id) patch.contrato_id = e.contratoId;
      if (!conv.etiqueta && e.vehiculoNumero) patch.etiqueta = `Carro ${e.vehiculoNumero}`;
      if (Object.keys(patch).length) {
        await sb.from("conversaciones").update(patch).eq("id", conv.id);
      }
    }
    await registrarMensaje({
      conversacionId: conv.id,
      direccion: "out",
      tipo: "text",
      texto: preview,
      enviadoPor: "sistema",
    });
  } catch (err) {
    console.error(
      "[envios] no pude guardar extracto en chat:",
      e.vehiculoNumero,
      err instanceof Error ? err.message : err,
    );
  }
}

async function registrar(
  sb: ReturnType<typeof createServerSupabase>,
  e: EstadoCuenta,
  fecha: string,
  estado: "enviado" | "fallido",
) {
  const { error } = await sb.from("estados_cuenta").upsert(
    {
      contrato_id: e.contratoId,
      fecha,
      saldo_cuentas: e.cuenta,
      // columnas integer en DB — redondear (a veces vienen fracciones del plan).
      cuotas_pagadas: Math.max(0, Math.round(Number(e.cuotasPagadas) || 0)),
      cuotas_restantes: Math.max(0, Math.round(Number(e.cuotasDebe) || 0)),
      canal: "whatsapp",
      estado,
      enviado_at: estado === "enviado" ? new Date().toISOString() : null,
    },
    { onConflict: "contrato_id,fecha" },
  );
  if (error) {
    console.error("[envios] no pude registrar estados_cuenta:", error.message, e.vehiculoNumero);
  }
}

/** Envío manual del estado de cuenta de un contrato (para el piloto). */
export async function enviarEstadoCuentaContrato(
  contratoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const e = await estadoCuentaContrato(contratoId);
  if (!e) return { ok: false, error: "No se encontró el contrato." };
  return enviarYRegistrar(e, { forzar: true });
}

/**
 * Envío de PRUEBA (piloto): manda el estado de cuenta de un carro a un número
 * destino (para probar a tu propio WhatsApp) o al del cliente si no se indica.
 */
export async function enviarEstadoCuentaPrueba(
  carroNumero: string,
  numeroDestino?: string,
): Promise<{ ok: boolean; error?: string; preview?: string }> {
  const sb = createServerSupabase();
  const num = carroNumero.trim();
  if (!num) return { ok: false, error: "Indica el número de carro." };

  const { data: contrato } = await sb
    .from("contratos")
    .select("id, vehiculo:vehiculos!inner(numero)")
    .eq("estado", "activo")
    .eq("vehiculo.numero", num)
    .limit(1)
    .maybeSingle();
  if (!contrato) return { ok: false, error: `No hay contrato activo para el carro ${num}.` };

  const e = await estadoCuentaContrato(contrato.id as string);
  if (!e) return { ok: false, error: "No pude calcular el estado de cuenta." };

  const dest = normalizarTelefono(numeroDestino?.trim() || e.waNumero);
  if (!dest) return { ok: false, error: "No hay número destino válido (ni del cliente ni indicado)." };

  const ctx = await enrichExtracto(e);
  const preview = previewEstadoCuenta(e, ctx);

  try {
    await enviarConFallbacks(dest, e, ctx);
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al enviar." };
  }
}

/** Envío MASIVO del día (cron 9am). Respeta alcance de cartera (DB) + ENVIOS_MASIVOS. */
export async function enviarEstadosCuentaHoy(): Promise<{
  total: number;
  enviados: number;
  fallidos: number;
  sinNumero: number;
}> {
  const estados = await estadosCuentaHoy(); // ya filtra por alcance
  const ids = estados.map((e) => e.contratoId);
  const [saldos, extras] = await Promise.all([
    acuerdosSaldoPorContrato(ids),
    cargosExtraPorContrato(ids),
  ]);

  let enviados = 0, fallidos = 0, sinNumero = 0;
  const TANDA = 10;
  for (let i = 0; i < estados.length; i += TANDA) {
    const tanda = estados.slice(i, i + TANDA);
    const res = await Promise.allSettled(
      tanda.map((e) =>
        enviarYRegistrar(e, {
          ctx: {
            acuerdoSaldo: saldos.get(e.contratoId) ?? 0,
            extras: extras.get(e.contratoId) ?? [],
          },
        }),
      ),
    );
    for (let j = 0; j < res.length; j++) {
      const r = res[j];
      if (r.status === "fulfilled" && r.value.ok) enviados++;
      else if (!tanda[j].waNumero) sinNumero++;
      else fallidos++;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  return { total: estados.length, enviados, fallidos, sinNumero };
}
