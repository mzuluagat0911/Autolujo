// Envío del estado de cuenta por WhatsApp.
// Usado por: el botón manual (piloto) y el cron diario de las 8am.
//
// Plantillas:
// - `extracto_al_dia`     → ayer pagó / sin atraso (solo cuota de hoy).
// - `extracto_con_atraso` → con días de atraso (cuotas + recargos).
// - `estado_cuenta_diario` → fallback si Meta aún no aprueba las nuevas.
// Todos los montos salen del contrato (letra_diaria / descuento_puntual).

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

const TEMPLATE_AL_DIA = "extracto_al_dia";
const TEMPLATE_CON_ATRASO = "extracto_con_atraso";
const TEMPLATE_FALLBACK = "estado_cuenta_diario";

/** Sin saldo de días anteriores: solo le toca la cuota de hoy. */
export function estaAlDia(e: EstadoCuenta): boolean {
  return e.pendienteAnterior <= 0.009 && e.recargo <= 0.009;
}

function templatePara(e: EstadoCuenta): string {
  return estaAlDia(e) ? TEMPLATE_AL_DIA : TEMPLATE_CON_ATRASO;
}

/**
 * Separa "cuenta" (cuotas del contrato) vs "por no pagar" (recargos).
 * Busca n×letra + k×penalidad ≈ totalHoy para que el desglose sea del contrato,
 * no montos fijos.
 */
function montosAtraso(e: EstadoCuenta): { cuenta: number; recargo: number; total: number } {
  const total = e.totalHoy;
  const letra = e.letra;
  const pen = e.penalidad;

  if (letra > 0.009 && pen > 0.009) {
    let best: { cuenta: number; recargo: number } | null = null;
    for (let n = 1; n <= 60; n++) {
      for (let k = 0; k <= n + 1; k++) {
        const cuenta = n * letra;
        const recargo = k * pen;
        if (Math.abs(cuenta + recargo - total) < 0.05) {
          // Preferir más días de cuota (explica mejor varios días seguidos).
          if (!best || cuenta > best.cuenta) best = { cuenta, recargo };
        }
      }
    }
    if (best) return { ...best, total };
  }

  // Fallback: recargo explícito de hoy / una penalidad si hay atraso en saldo.
  const deLinea = e.lineas.find((l) => l.concepto === "por no pagar a tiempo");
  let recargo = deLinea && deLinea.monto > 0.009 ? deLinea.monto : e.recargo;
  if (recargo <= 0.009 && e.pendienteAnterior > 0.009 && pen > 0.009) recargo = pen;
  return { cuenta: Math.max(total - recargo, 0), recargo, total };
}

/** Vars según plantilla (al día: 6 · con atraso: 7). Todo dinámico del contrato. */
function varsPara(e: EstadoCuenta): string[] {
  const [nombre, carro, fecha] = e.templateVars;
  // Aviso de lo que se suma HOY si no paga antes de las 7 (descuento_puntual del contrato).
  const avisoRecargo = money(e.recargoSiTarda > 0.009 ? e.recargoSiTarda : e.penalidad);
  if (estaAlDia(e)) {
    return [
      nombre,
      carro,
      fecha,
      `${money(e.cuenta)} cuenta`,
      money(e.totalHoy),
      avisoRecargo,
    ];
  }
  const m = montosAtraso(e);
  return [
    nombre,
    carro,
    fecha,
    `${money(m.cuenta)} cuenta`,
    `${money(m.recargo)} por no pagar`,
    money(m.total),
    avisoRecargo,
  ];
}

function componentes(vars: string[]) {
  return [{ type: "body", parameters: vars.map((v) => ({ type: "text", text: v })) }];
}

export function previewEstadoCuenta(e: EstadoCuenta): string {
  const vars = varsPara(e);
  if (estaAlDia(e)) {
    const [nombre, carro, fecha, desglose, total, avisoRecargo] = vars;
    return [
      `Buen día ${nombre} 🌞`,
      ``,
      `❌ EXTRACTO DIARIO`,
      ``,
      fecha,
      ``,
      `🔹 Carro ${carro}`,
      ``,
      desglose,
      ``,
      `*DEBE TOTAL PAGAR HOY: ${total}*`,
      ``,
      `*RECUERDE:* El sistema cierra a las 7:00 p.m.`,
      `*Se genera ${avisoRecargo} de recargo por no pagar.*`,
      ``,
      `Envíanos tu comprobante por aquí. ¡Gracias!`,
    ].join("\n");
  }
  const [nombre, carro, fecha, lineaCuenta, lineaRecargo, total, avisoRecargo] = vars;
  return [
    `Buen día ${nombre} 🌞`,
    ``,
    `❌ EXTRACTO DIARIO`,
    ``,
    fecha,
    ``,
    `🔹 Carro ${carro}`,
    ``,
    lineaCuenta,
    lineaRecargo,
    ``,
    `*DEBE TOTAL PAGAR HOY: ${total}*`,
    ``,
    `*RECUERDE:* El sistema cierra a las 7:00 p.m.`,
    `*Se genera ${avisoRecargo} de recargo por no pagar.*`,
    ``,
    `Envíanos tu comprobante por aquí. ¡Gracias!`,
  ].join("\n");
}

function hoyStr(): string {
  return hoyPanama();
}

/** Envía el estado de cuenta de UN estado ya calculado y lo registra. Idempotente por día. */
export async function enviarYRegistrar(
  e: EstadoCuenta,
  opts: { forzar?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const sb = createServerSupabase();
  const fecha = hoyStr();

  // Normalizado: en el control hay números guardados sin prefijo país.
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

  // Idempotencia: si ya se envió hoy y no forzamos, no repetir.
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
    const vars = varsPara(e);
    try {
      await sendTemplate(to, templatePara(e), "es", componentes(vars));
    } catch (err) {
      // Si la plantilla nueva aún no está APPROVED, no dejamos sin extracto.
      console.error(
        `[envios] ${templatePara(e)} falló, uso ${TEMPLATE_FALLBACK}:`,
        err instanceof Error ? err.message : err,
      );
      await sendTemplate(to, TEMPLATE_FALLBACK, "es", componentes(e.templateVars));
    }
    await registrar(sb, e, fecha, "enviado");
    return { ok: true };
  } catch (err) {
    await registrar(sb, e, fecha, "fallido");
    return { ok: false, error: err instanceof Error ? err.message : "Error al enviar." };
  }
}

async function registrar(
  sb: ReturnType<typeof createServerSupabase>,
  e: EstadoCuenta,
  fecha: string,
  estado: "enviado" | "fallido",
) {
  await sb.from("estados_cuenta").upsert(
    {
      contrato_id: e.contratoId,
      fecha,
      saldo_cuentas: e.cuenta,
      cuotas_pagadas: e.cuotasPagadas,
      cuotas_restantes: e.cuotasDebe,
      canal: "whatsapp",
      estado,
      enviado_at: estado === "enviado" ? new Date().toISOString() : null,
    },
    { onConflict: "contrato_id,fecha" },
  );
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

  const tpl = templatePara(e);
  const vars = varsPara(e);
  const preview = previewEstadoCuenta(e);

  try {
    await sendTemplate(dest, tpl, "es", componentes(vars));
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al enviar." };
  }
}

/** Envío MASIVO del día (para el cron 8am). Manda a todos los contratos activos. */
export async function enviarEstadosCuentaHoy(): Promise<{
  total: number;
  enviados: number;
  fallidos: number;
  sinNumero: number;
}> {
  const estados = await estadosCuentaHoy();
  let enviados = 0, fallidos = 0, sinNumero = 0;

  // En tandas de 10 para no saturar la API de Meta.
  const TANDA = 10;
  for (let i = 0; i < estados.length; i += TANDA) {
    const tanda = estados.slice(i, i + TANDA);
    const res = await Promise.allSettled(tanda.map((e) => enviarYRegistrar(e)));
    for (let j = 0; j < res.length; j++) {
      const r = res[j];
      if (r.status === "fulfilled" && r.value.ok) enviados++;
      else if (!tanda[j].waNumero) sinNumero++;
      else fallidos++;
    }
    await new Promise((r) => setTimeout(r, 400)); // respiro entre tandas
  }

  return { total: estados.length, enviados, fallidos, sinNumero };
}
