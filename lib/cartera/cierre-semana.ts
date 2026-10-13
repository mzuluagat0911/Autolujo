// Cierre de semana: el martes se cobran $10 solo si quedó vencido algo de antes.
//
// Entra si:
//   - la letra diaria de ayer o de días pasados sigue sin pagar (la de hoy no), o
//   - la cuota del acuerdo que ya tocaba (ayer, o el domingo que ya pasó) sigue
//     sin pagar.
//
// No entra por el saldo que el acuerdo todavía tiene, ni por mantenimiento,
// kilometraje o domingo, si esa cuota va al día.
//
// Corre el martes a las 7:45. El mensaje sale a las 9.
// Un pago de hoy antes de las 9 cubre el hueco. Si a las 9 el comprobante
// sigue en validación, el cargo entra.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, diaSemana, horaPanama, HORA_EXTRACTO } from "./fecha";
import { estadoCuentaContrato, estadosCuentaHoy, type EstadoCuenta } from "./estado-cuenta";
import { atrasoAcuerdoAcumuladoPorContrato } from "./pagos-dia";

const MONTO_CIERRE = 10;

function antesDelExtracto(): boolean {
  return Number(horaPanama().slice(0, 2)) < HORA_EXTRACTO;
}

export type CierreSemanaInput = {
  pendienteAnterior: number;
  pagadoHoy?: number;
  extrasEnSaldo?: number;
  /** Cuotas de acuerdo ya vencidas que siguen sin pagar. */
  atrasoAcuerdo?: number;
  /** El cargo de $10 de hoy ya está en el saldo. No cuenta como letra atrasada. */
  yaTieneCierre?: boolean;
};

/** Letra de ayer o de antes, sin el saldo del acuerdo ni otros conceptos. */
export function letraAtrasadaParaCierre(e: CierreSemanaInput): number {
  const pagado = Math.max(Number(e.pagadoHoy) || 0, 0);
  let anterior = Math.max(0, (Number(e.pendienteAnterior) || 0) - pagado);
  let extras = Math.max(Number(e.extrasEnSaldo) || 0, 0);
  if (e.yaTieneCierre) {
    anterior = Math.max(0, Math.round((anterior - MONTO_CIERRE) * 100) / 100);
    extras = Math.max(0, Math.round((extras - MONTO_CIERRE) * 100) / 100);
  }
  const toma = Math.min(extras, anterior);
  return Math.max(0, Math.round((anterior - toma) * 100) / 100);
}

/** $10 solo por letra atrasada o por cuota de acuerdo ya vencida. */
export function debeCobrarCierreSemana(e: CierreSemanaInput): boolean {
  if (letraAtrasadaParaCierre(e) > 0.009) return true;
  return Math.max(Number(e.atrasoAcuerdo) || 0, 0) > 0.009;
}

function entradaCierre(e: EstadoCuenta, atrasoAcuerdo: number, yaTieneCierre: boolean): CierreSemanaInput {
  return {
    pendienteAnterior: e.pendienteAnterior,
    pagadoHoy: e.pagadoHoy,
    extrasEnSaldo: e.extrasEnSaldo,
    atrasoAcuerdo,
    yaTieneCierre,
  };
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
  const atrasoAcuerdo = await atrasoAcuerdoAcumuladoPorContrato(fecha);
  // Letra de ayer o antes, o cuota de acuerdo ya vencida.
  // El saldo del plan y los otros conceptos no disparan el $10.
  // Antes de las 9, un comprobante todavía en validación no dispara el cargo.
  const deudores = estados.filter((e) => {
    const cobra = debeCobrarCierreSemana(
      entradaCierre(e, atrasoAcuerdo.get(e.contratoId) ?? 0, yaSet.has(e.contratoId)),
    );
    if (!cobra) return false;
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
  const atrasoAcuerdo = await atrasoAcuerdoAcumuladoPorContrato(fecha, [contratoId]);
  if (debeCobrarCierreSemana(entradaCierre(est, atrasoAcuerdo.get(contratoId) ?? 0, true))) {
    return false;
  }
  const { error } = await sb.from("cargos").delete().in("id", ids);
  return !error;
}

/** Quita el $10 de ese día cuando la letra y el acuerdo iban al día. */
export async function quitarCierresInjustos(
  fecha = hoyPanama(),
): Promise<{ revisados: number; quitados: number; seQuedan: number }> {
  const sb = createServerSupabase();
  const [estados, atrasoAcuerdo] = await Promise.all([
    estadosCuentaHoy(),
    atrasoAcuerdoAcumuladoPorContrato(fecha),
  ]);
  const porContrato = new Map(estados.map((e) => [e.contratoId, e]));
  const { data, error } = await sb
    .from("cargos")
    .select("id, contrato_id, pago_id")
    .eq("fecha", fecha)
    .eq("concepto_codigo", "CIERRE_SEMANA")
    .gt("monto", 0);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as { id: string; contrato_id: string; pago_id: string | null }[];
  const quitar: string[] = [];
  let seQuedan = 0;
  for (const f of filas) {
    if (f.pago_id) {
      seQuedan++;
      continue;
    }
    const est = porContrato.get(f.contrato_id);
    const cobra = est
      ? debeCobrarCierreSemana(entradaCierre(est, atrasoAcuerdo.get(f.contrato_id) ?? 0, true))
      : true;
    if (cobra) seQuedan++;
    else quitar.push(f.id);
  }
  for (let i = 0; i < quitar.length; i += 80) {
    const lote = quitar.slice(i, i + 80);
    const { error: errDel } = await sb.from("cargos").delete().in("id", lote);
    if (errDel) throw new Error(errDel.message);
  }
  return { revisados: filas.length, quitados: quitar.length, seQuedan };
}
