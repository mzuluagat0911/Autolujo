// Escalera de recordatorios de pago.
//
// Tras el estado de cuenta de las 8am, si el cliente aún no paga, se le
// reengancha durante el día (mediodía y cierre). Reutiliza el template
// aprobado `estado_cuenta_diario` (muestra lo que debe hoy → sirve de
// recordatorio). Quien ya pagó o mandó comprobante NO recibe recordatorio:
// eso lo garantiza `estadosCuentaHoy()`, que ya los excluye.
//
// La "lista por llamar" (quién debe hoy y no ha pagado al cierre) se calcula
// en vivo con `paraLlamarHoy()`; la bitácora `recordatorios` solo evita repetir
// el mismo nivel dos veces.

import { sendTemplate } from "@/lib/whatsapp/client";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "./fecha";
import { normalizarTelefono } from "./telefono";
import { estadosCuentaHoy, type EstadoCuenta } from "./estado-cuenta";

const TEMPLATE = "estado_cuenta_diario";
export type NivelRecordatorio = "mediodia" | "cierre";

function componentes(vars: string[]) {
  return [{ type: "body", parameters: vars.map((v) => ({ type: "text", text: v })) }];
}

/** ¿Ya se mandó este nivel hoy? Defensivo: si la tabla no existe, no bloquea. */
async function yaEnviado(
  sb: ReturnType<typeof createServerSupabase>,
  contratoId: string,
  fecha: string,
  nivel: NivelRecordatorio,
): Promise<boolean> {
  const { data, error } = await sb
    .from("recordatorios")
    .select("estado")
    .eq("contrato_id", contratoId)
    .eq("fecha", fecha)
    .eq("nivel", nivel)
    .maybeSingle();
  if (error) return false; // tabla sin migrar u otro problema → deja intentar
  return data?.estado === "enviado";
}

async function registrar(
  sb: ReturnType<typeof createServerSupabase>,
  contratoId: string,
  fecha: string,
  nivel: NivelRecordatorio,
  estado: "enviado" | "fallido",
) {
  // Defensivo: si la tabla `recordatorios` aún no está migrada (0016), no truena
  // el envío por no poder anotar la bitácora.
  const { error } = await sb.from("recordatorios").upsert(
    { contrato_id: contratoId, fecha, nivel, estado, enviado_at: estado === "enviado" ? new Date().toISOString() : null },
    { onConflict: "contrato_id,fecha,nivel" },
  );
  if (error) console.error("[recordatorios] no pude anotar la bitácora:", error.message);
}

async function enviarUno(
  sb: ReturnType<typeof createServerSupabase>,
  e: EstadoCuenta,
  fecha: string,
  nivel: NivelRecordatorio,
): Promise<"enviado" | "fallido" | "sin_numero" | "ya"> {
  const to = normalizarTelefono(e.waNumero);
  if (!to) return "sin_numero";
  if (await yaEnviado(sb, e.contratoId, fecha, nivel)) return "ya";
  try {
    await sendTemplate(to, TEMPLATE, "es", componentes(e.templateVars));
    await registrar(sb, e.contratoId, fecha, nivel, "enviado");
    return "enviado";
  } catch {
    await registrar(sb, e.contratoId, fecha, nivel, "fallido");
    return "fallido";
  }
}

/**
 * Manda el recordatorio del nivel indicado a TODOS los que aún deben hoy y no
 * han pagado. En tandas para no saturar la API de Meta.
 */
export async function enviarRecordatoriosHoy(nivel: NivelRecordatorio): Promise<{
  total: number; enviados: number; fallidos: number; sinNumero: number; yaEstaban: number;
}> {
  const sb = createServerSupabase();
  const fecha = hoyPanama();
  const estados = await estadosCuentaHoy(); // ya excluye a quien pagó o tiene comprobante pendiente

  let enviados = 0, fallidos = 0, sinNumero = 0, yaEstaban = 0;
  const TANDA = 10;
  for (let i = 0; i < estados.length; i += TANDA) {
    const tanda = estados.slice(i, i + TANDA);
    const res = await Promise.all(tanda.map((e) => enviarUno(sb, e, fecha, nivel)));
    for (const r of res) {
      if (r === "enviado") enviados++;
      else if (r === "sin_numero") sinNumero++;
      else if (r === "ya") yaEstaban++;
      else fallidos++;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { total: estados.length, enviados, fallidos, sinNumero, yaEstaban };
}

/**
 * Lista "por llamar": quién debe hoy y no ha pagado. Se calcula en vivo, así
 * que sirve en cualquier momento del día para que el equipo levante el teléfono.
 */
export async function paraLlamarHoy(): Promise<EstadoCuenta[]> {
  return estadosCuentaHoy();
}
