// Devengo diario de la cuota.
//
// `vw_saldo_contrato` = saldo_inicial + cargos − pagos. Sin este job no se
// crea nunca el cargo del día, así que el saldo solo baja y el agente termina
// diciéndole al cliente que no debe nada. Aquí se genera, por contrato activo
// y por día operativo, el cargo `renta` con la cuota que le toca.
//
// Determinista y idempotente: el índice único uq_cargo_renta_dia (migración
// 0008) impide que un segundo pase duplique la cuota.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, diaSemana, sumarDias } from "./fecha";

/** Días hacia atrás que el job intenta rellenar si el cron no corrió. */
const MAX_DIAS_ATRAS = 7;

/** Términos del contrato que determinan cuánto se cobra cada día. */
export type TerminosCuota = {
  letra_diaria: number;
  cobra_domingo: boolean | null;
  cuota_domingo: number | null;
};

type ContratoDevengo = TerminosCuota & {
  id: string;
  fecha_inicio: string;
};

export type ResultadoDevengo = {
  fecha: string;
  creados: number;
  yaEstaban: number;
  sinCuota: number;
};

/**
 * Cuota que devenga un contrato en una fecha; 0 = ese día no se cobra.
 * Entre semana es la letra diaria; el domingo solo si el contrato lo pactó.
 */
export function cuotaDeFecha(c: TerminosCuota, fecha: string): number {
  if (diaSemana(fecha) === 0) {
    if (!c.cobra_domingo) return 0;
    return Math.max(Number(c.cuota_domingo) || Number(c.letra_diaria) || 0, 0);
  }
  return Math.max(Number(c.letra_diaria) || 0, 0);
}

/**
 * Fecha mínima desde la que se puede devengar. Protege el `saldo_inicial`
 * migrado: sin esta variable no se rellenan días pasados, solo el de hoy.
 */
function devengoDesde(): string | null {
  const v = (process.env.DEVENGO_DESDE ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Crea los cargos de renta que falten para una fecha concreta. */
export async function devengarDia(fecha: string): Promise<ResultadoDevengo> {
  const sb = createServerSupabase();

  const { data: contratos, error } = await sb
    .from("contratos")
    .select("id, fecha_inicio, letra_diaria, cobra_domingo, cuota_domingo")
    .eq("estado", "activo");
  if (error) throw error;

  const { data: existentes } = await sb
    .from("cargos")
    .select("contrato_id")
    .eq("fecha", fecha)
    .eq("tipo", "renta");
  const yaTiene = new Set(
    ((existentes ?? []) as { contrato_id: string }[]).map((r) => r.contrato_id),
  );

  const res: ResultadoDevengo = { fecha, creados: 0, yaEstaban: 0, sinCuota: 0 };
  const filas: Record<string, unknown>[] = [];

  for (const c of ((contratos ?? []) as unknown as ContratoDevengo[])) {
    if (c.fecha_inicio && c.fecha_inicio > fecha) continue; // aún no arrancaba
    if (yaTiene.has(c.id)) { res.yaEstaban++; continue; }
    const monto = cuotaDeFecha(c, fecha);
    if (monto <= 0) { res.sinCuota++; continue; }
    filas.push({
      contrato_id: c.id,
      fecha,
      tipo: "renta",
      concepto: "Cuota diaria",
      monto,
    });
  }

  if (filas.length === 0) return res;

  const { error: errInsert } = await sb.from("cargos").insert(filas);
  if (!errInsert) {
    res.creados = filas.length;
    return res;
  }

  // Si dos pases se cruzaron, el lote entero falla por el índice único.
  // Reintenta fila por fila para no perder los contratos que sí faltaban.
  for (const fila of filas) {
    const { error: e } = await sb.from("cargos").insert(fila);
    if (e) res.yaEstaban++;
    else res.creados++;
  }
  return res;
}

/**
 * Devenga el día de hoy y, si el cron se saltó días, rellena hacia atrás
 * hasta MAX_DIAS_ATRAS sin pasar de DEVENGO_DESDE.
 */
export async function devengarPendientes(): Promise<{
  hoy: string;
  dias: ResultadoDevengo[];
  creados: number;
}> {
  const hoy = hoyPanama();
  const desde = devengoDesde();

  const fechas: string[] = [];
  for (let i = MAX_DIAS_ATRAS; i >= 1; i--) {
    const f = sumarDias(hoy, -i);
    if (desde && f >= desde) fechas.push(f);
  }
  fechas.push(hoy);

  const dias: ResultadoDevengo[] = [];
  for (const f of fechas) dias.push(await devengarDia(f));

  return { hoy, dias, creados: dias.reduce((a, d) => a + d.creados, 0) };
}

/**
 * Hasta qué día está devengado un contrato (última cuota cargada).
 * El agente lo necesita para no afirmar que el saldo "ya incluye hoy".
 */
export async function ultimoDiaDevengado(contratoId: string): Promise<string | null> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("fecha")
    .eq("contrato_id", contratoId)
    .eq("tipo", "renta")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { fecha: string } | null)?.fecha ?? null;
}
