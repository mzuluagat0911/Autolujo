// Escalera de recordatorios de pago.
//
// Tras el estado de cuenta de las 9am, si el cliente aún no paga, a las
// 5:30 p.m. sale `ultimo_aviso_pago`. El de la 1:00 p.m. (`recordatorio_pago`)
// está apagado: era otra plantilla cobrada el mismo día.
//
// - 5:30 p.m.: todos los que aún deben hoy y no han pagado.
// - Domingo: la cola base (`estadosCuentaHoy`) solo incluye tajada de
//   domingo, letra atrasada, acuerdo atrasado o acuerdo de domingo. Al día no entra.
// Quien ya pagó o mandó comprobante NO recibe recordatorio: eso lo garantiza
// `estadosCuentaHoy()`, que ya los excluye.
//
// La "lista por llamar" lee el extracto del día ya armado. El recordatorio de
// las 5:30 sigue calculando la cola en vivo. La bitácora evita repetir el aviso.

import { sendTemplate } from "@/lib/whatsapp/client";
import { createServerSupabase } from "@/lib/supabase/server";
import { esDomingo, hoyPanama } from "./fecha";
import { normalizarTelefono } from "./telefono";
import { audienciaDomingo, estadosCuentaHoy, type EstadoCuenta } from "./estado-cuenta";
import { estadosCuentaPanel } from "./estado-cuenta-cache";
import { envioPausado, envioPausadoContrato } from "./envio-pausa";
import { espejarEnChat } from "./pipeline";

const TEMPLATE_POR_NIVEL = {
  mediodia: "recordatorio_pago",
  cierre: "ultimo_aviso_pago",
} as const;
export type NivelRecordatorio = keyof typeof TEMPLATE_POR_NIVEL;

function componentesRecordatorio(e: EstadoCuenta) {
  const [nombre, carro] = e.templateVars;
  return [
    {
      type: "body",
      parameters: [nombre, carro].map((v) => ({ type: "text", text: v })),
    },
  ];
}

/** Mismo texto que la plantilla aprobada en Meta, para dejarlo en el chat. */
function textoRecordatorio(nivel: NivelRecordatorio, nombre: string, carro: string): string {
  if (nivel === "cierre") {
    return `Hola ${nombre}, hoy cierra a las 7:00 p.m. y no queremos que se te acumule la cuenta del carro ${carro}. Si ya pagaste, mándanos el comprobante; si tienes algún inconveniente, escríbenos y lo vemos juntos.`;
  }
  return `Hola ${nombre} 👋 Aún no vemos el pago pendiente de tu carro ${carro}. Puedes hacerlo hasta las 7:00 p.m. y mandarnos el comprobante por aquí. ¡Cualquier cosa nos dices!`;
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
  if (envioPausado(e.empresa) || (await envioPausadoContrato(e.contratoId))) return "ya";
  const to = normalizarTelefono(e.waNumero);
  if (!to) return "sin_numero";
  if (await yaEnviado(sb, e.contratoId, fecha, nivel)) return "ya";
  try {
    const [nombre, carro] = e.templateVars;
    await sendTemplate(to, TEMPLATE_POR_NIVEL[nivel], "es", componentesRecordatorio(e));
    await registrar(sb, e.contratoId, fecha, nivel, "enviado");
    await espejarEnChat(to, textoRecordatorio(nivel, nombre, carro));
    return "enviado";
  } catch {
    await registrar(sb, e.contratoId, fecha, nivel, "fallido");
    return "fallido";
  }
}

/**
 * Manda el recordatorio del nivel indicado.
 * - mediodía (1pm): apagado. No sale ningún mensaje.
 * - cierre (5:30): todos los que aún deben hoy y no han pagado.
 */
export async function enviarRecordatoriosHoy(nivel: NivelRecordatorio): Promise<{
  total: number; enviados: number; fallidos: number; sinNumero: number; yaEstaban: number;
}> {
  if (nivel === "mediodia") {
    return { total: 0, enviados: 0, fallidos: 0, sinNumero: 0, yaEstaban: 0 };
  }
  const sb = createServerSupabase();
  const fecha = hoyPanama();
  const estados = (await estadosCuentaHoy()).filter((e) => !envioPausado(e.empresa));

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
 * Lista "por llamar": quién debe hoy y no ha pagado. Usa el extracto ya armado
 * del día, el mismo que el panel, para no reconstruir la flota en cada visita.
 */
export async function paraLlamarHoy(): Promise<EstadoCuenta[]> {
  const hoy = hoyPanama();
  const domingo = esDomingo(hoy);
  const todos = await estadosCuentaPanel();
  return todos
    .filter((e) => e.totalHoy > 0.009 && !e.pendiente)
    .filter((e) => !domingo || audienciaDomingo(e))
    .sort((a, b) => b.totalHoy - a.totalHoy);
}
