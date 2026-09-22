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
// Corre el martes a primera hora, junto con el cobro de las 8am, para que el
// recargo salga en el estado de cuenta de la mañana.
//
// "No cerró la semana" = atraso de letra de días anteriores (pendienteAnterior
// atribuible a renta diaria). La cuota nueva del martes NO cuenta.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, diaSemana } from "./fecha";
import { estadosCuentaHoy } from "./estado-cuenta";
import { filtrarEstadosPorEmpresaEnvio } from "./empresas-envio";

const MONTO_CIERRE = 10;

/**
 * Atraso que dispara el $10: solo demora de LETRA DIARIA.
 * Acuerdos, domingos y otros recargos NO cuentan (ver comentario de archivo).
 * Hoy usamos pendienteAnterior del motor; el piloto Gold / Excel usa la columna
 * `atrasado` o la falta de letra del lunes — nunca DEBE OTROS ni acuerdos.
 */
function atrasoLetraDiaria(e: { pendienteAnterior: number }): boolean {
  return e.pendienteAnterior > 0.009;
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

  // Quién NO cerró la semana: tiene atraso del lunes o antes (pendienteAnterior).
  // La cuota nueva del martes no cuenta (es del día de hoy).
  // Quién NO cerró la letra diaria de la semana (lunes o antes).
  // No contar acuerdos / domingos / otros como motivo del $10.
  const deudores = filtrarEstadosPorEmpresaEnvio(await estadosCuentaHoy()).filter(
    (e) => atrasoLetraDiaria(e),
  );
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
