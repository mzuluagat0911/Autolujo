// Cierre de semana (regla del contrato): el cliente tiene hasta el LUNES para
// dejar la **letra diaria** al día (incluida la del lunes). Si el MARTES en la
// mañana aún arrastra atraso de PAGOS DIARIOS del lunes o antes, se cobra $10
// (CIERRE_SEMANA).
//
// IMPORTANTE — el $10 NO aplica por:
//   - acuerdos / abonos de arreglo
//   - domingos pendientes
//   - mantenimiento u otros recargos
// Solo por demora o saldo de la CUOTA DIARIA (letra).
//
// Corre el martes a las 7:45. El mensaje sale a las 9.
//
// Un pago ya cruzado esa mañana, o un comprobante que se valida antes de las 9
// y deja la letra atrasada cubierta, no lleva el $10. Si a las 9 el comprobante
// sigue en validación, el cargo entra en el mensaje.
//
// "No cerró la semana" = atraso de letra de días anteriores, ya neto de lo
// pagado hoy. La cuota nueva del martes NO cuenta.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, diaSemana, horaPanama, HORA_EXTRACTO } from "./fecha";
import { estadoCuentaContrato, estadosCuentaHoy } from "./estado-cuenta";

const MONTO_CIERRE = 10;

function antesDelExtracto(): boolean {
  return Number(horaPanama().slice(0, 2)) < HORA_EXTRACTO;
}

/**
 * Atraso de letra que dispara el $10, sin devolver el pago de hoy.
 * Si el cargo de $10 ya está en el saldo, no cuenta como atraso de letra.
 */
function atrasoLetraNeta(
  e: { pendienteAnterior: number; pagadoHoy?: number },
  yaTieneCierre: boolean,
): number {
  const pagado = Math.max(Number(e.pagadoHoy) || 0, 0);
  let neto = Math.max(0, (Number(e.pendienteAnterior) || 0) - pagado);
  if (yaTieneCierre) neto = Math.max(0, Math.round((neto - MONTO_CIERRE) * 100) / 100);
  return neto;
}

export type ResultadoCierreSemana = {
  fecha: string;
  esMartes: boolean;
  deudores: number;
  creados: number;
  yaTenian: number;
};

export async function aplicarCierreSemana(fecha = hoyPanama()): Promise<ResultadoCierreSemana> {
  const res: ResultadoCierreSemana = {
    fecha,
    esMartes: diaSemana(fecha) === 2,
    deudores: 0,
    creados: 0,
    yaTenian: 0,
  };
  if (!res.esMartes) return res; // solo aplica los martes (cierre del lunes)

  const sb = createServerSupabase();

  const estados = await estadosCuentaHoy();
  const ids = estados.map((e) => e.contratoId);
  const [{ data: ya }, { data: pend }] = await Promise.all([
    ids.length
      ? sb
          .from("cargos")
          .select("contrato_id")
          .eq("fecha", fecha)
          .eq("concepto_codigo", "CIERRE_SEMANA")
          .in("contrato_id", ids)
      : Promise.resolve({ data: [] as { contrato_id: string }[] }),
    ids.length
      ? sb
          .from("pagos")
          .select("contrato_id")
          .eq("estado_conciliacion", "pendiente")
          .in("contrato_id", ids)
      : Promise.resolve({ data: [] as { contrato_id: string }[] }),
  ]);
  const yaSet = new Set(((ya ?? []) as { contrato_id: string }[]).map((r) => r.contrato_id));
  const pendientes = new Set(
    ((pend ?? []) as { contrato_id: string | null }[])
      .map((p) => p.contrato_id)
      .filter((id): id is string => Boolean(id)),
  );
  const esperaExtracto = antesDelExtracto();
  // Letra del lunes o antes, ya descontando lo cruzado hoy.
  // Antes de las 9, un comprobante todavía en validación no dispara el $10:
  // si lo cruzan a tiempo, no se cobra; si a las 9 sigue pendiente, sí.
  const deudores = estados.filter((e) => {
    if (atrasoLetraNeta(e, yaSet.has(e.contratoId)) <= 0.009) return false;
    if (esperaExtracto && pendientes.has(e.contratoId)) return false;
    return true;
  });
  res.deudores = deudores.length;
  if (deudores.length === 0) return res;

  res.yaTenian = deudores.filter((d) => yaSet.has(d.contratoId)).length;

  const filas = deudores
    .filter((d) => !yaSet.has(d.contratoId))
    .map((d) => ({
      contrato_id: d.contratoId,
      fecha,
      tipo: "multa",
      concepto_codigo: "CIERRE_SEMANA",
      concepto: "Recargo Cierre semana",
      monto: MONTO_CIERRE,
    }));
  if (filas.length === 0) return res;

  const { error } = await sb.from("cargos").insert(filas);
  if (!error) {
    res.creados = filas.length;
    return res;
  }
  // Fallback uno a uno (por si choca alguna unicidad).
  for (const f of filas) {
    const { error: e } = await sb.from("cargos").insert(f);
    if (e) res.yaTenian++;
    else res.creados++;
  }
  return res;
}

/** Si antes de las 9 la letra atrasada quedó cubierta, saca el $10 de hoy. */
export async function quitarCierreSiLaLetraQuedoCubierta(contratoId: string): Promise<boolean> {
  const fecha = hoyPanama();
  if (diaSemana(fecha) !== 2 || !antesDelExtracto()) return false;
  const est = await estadoCuentaContrato(contratoId);
  if (!est) return false;
  const sb = createServerSupabase();
  const { data: cargos } = await sb
    .from("cargos")
    .select("id")
    .eq("contrato_id", contratoId)
    .eq("fecha", fecha)
    .eq("concepto_codigo", "CIERRE_SEMANA");
  const ids = ((cargos ?? []) as { id: string }[]).map((c) => c.id);
  if (ids.length === 0) return false;
  if (atrasoLetraNeta(est, true) > 0.009) return false;
  const { error } = await sb.from("cargos").delete().in("id", ids);
  return !error;
}
