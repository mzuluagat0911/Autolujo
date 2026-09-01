// Envío del estado de cuenta por WhatsApp (template aprobado `estado_cuenta_diario`).
// Usado por: el botón manual (piloto) y el cron diario de las 8am.

import { sendTemplate } from "@/lib/whatsapp/client";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "./fecha";
import { normalizarTelefono } from "./telefono";
import {
  estadoCuentaContrato,
  estadosCuentaHoy,
  type EstadoCuenta,
} from "./estado-cuenta";

const TEMPLATE = "estado_cuenta_diario";

function componentes(vars: string[]) {
  return [{ type: "body", parameters: vars.map((v) => ({ type: "text", text: v })) }];
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
    await sendTemplate(to, TEMPLATE, "es", componentes(e.templateVars));
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

  const [nombre, carro, fecha, desglose, total] = e.templateVars;
  const preview = `Buen día ${nombre} 🌞\n📋 Extracto diario · Carro ${carro} — ${fecha}\n${desglose}\nTotal a pagar hoy: ${total}`;

  try {
    await sendTemplate(dest, TEMPLATE, "es", componentes(e.templateVars));
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
