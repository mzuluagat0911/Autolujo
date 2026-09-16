// Cierre de semana (regla del contrato): el cliente tiene hasta el LUNES para
// dejar la semana cerrada, INCLUIDA la cuota del lunes. Si el MARTES en la
// mañana aún arrastra deuda del lunes o antes, se le cobra $10 (CIERRE_SEMANA).
//
// Corre el martes a primera hora, junto con el cobro de las 8am, para que el
// recargo salga en el estado de cuenta de la mañana.
//
// "No cerró la semana" = tiene ATRASO de días anteriores (pendienteAnterior),
// es decir, algo del lunes o antes sin pagar. La cuota nueva del martes NO
// cuenta (esa es del día de hoy). Reutiliza `estadosCuentaHoy()`, que ya excluye
// a quien pagó, adelantó, tiene comprobante en validación o contrato cerrado.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, diaSemana } from "./fecha";
import { estadosCuentaHoy } from "./estado-cuenta";

const MONTO_CIERRE = 10;

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

  // Quién NO cerró la semana: tiene atraso del lunes o antes (pendienteAnterior).
  // La cuota nueva del martes no cuenta (es del día de hoy).
  const deudores = (await estadosCuentaHoy()).filter((e) => e.pendienteAnterior > 0.009);
  res.deudores = deudores.length;
  if (deudores.length === 0) return res;

  const ids = deudores.map((d) => d.contratoId);
  const { data: ya } = await sb
    .from("cargos")
    .select("contrato_id")
    .eq("fecha", fecha)
    .eq("concepto_codigo", "CIERRE_SEMANA")
    .in("contrato_id", ids);
  const yaSet = new Set(((ya ?? []) as { contrato_id: string }[]).map((r) => r.contrato_id));
  res.yaTenian = yaSet.size;

  const filas = deudores
    .filter((d) => !yaSet.has(d.contratoId))
    .map((d) => ({
      contrato_id: d.contratoId,
      fecha,
      tipo: "multa",
      concepto_codigo: "CIERRE_SEMANA",
      concepto: "No cerrar semana al día (lunes)",
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
