// Devengo diario de la cuota.
//
// `vw_saldo_contrato` = saldo_inicial + cargos − pagos. Sin este job no se
// crea nunca el cargo del día, así que el saldo solo baja y el agente termina
// diciéndole al cliente que no debe nada. Aquí se genera, por contrato activo
// y por día operativo, el cargo `renta` con la cuota que le toca.
//
// Regla de negocio (confirmada): si NO paga un día, ese día queda a tarifa
// plena (letra + descuento perdido). Varios días de atraso = varios días a
// tarifa plena. El día de HOY arranca a letra puntual a las 7:30 a.m.; si a
// las 7:00 p.m. no pagó, se suma el recargo como cargo `multa` aparte.
//
// Determinista e idempotente: uq_cargo_renta_dia (0008) + chequeo de multa.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, diaSemana, sumarDias, rangoDiaPanama, esPagoPuntual } from "./fecha";

/** Días hacia atrás que el job intenta rellenar si el cron no corrió. */
const MAX_DIAS_ATRAS = 7;

/** Términos del contrato que determinan cuánto se cobra cada día. */
export type TerminosCuota = {
  letra_diaria: number;
  descuento_puntual: number | null;
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

export type ResultadoRecargo = {
  fecha: string;
  creados: number;
  yaTenian: number;
};

/**
 * Cuota base del día (con descuento puntual). 0 = ese día no se cobra.
 * Entre semana es la letra diaria; el domingo solo si el contrato lo pactó.
 */
export function cuotaDeFecha(c: TerminosCuota, fecha: string): number {
  if (diaSemana(fecha) === 0) {
    if (!c.cobra_domingo) return 0;
    return Math.max(Number(c.cuota_domingo) || Number(c.letra_diaria) || 0, 0);
  }
  return Math.max(Number(c.letra_diaria) || 0, 0);
}

/** Tarifa plena: pierde el descuento por no pagar a tiempo ese día. */
export function tarifaPlena(c: TerminosCuota, fecha: string): number {
  const base = cuotaDeFecha(c, fecha);
  if (base <= 0) return 0;
  return base + Math.max(Number(c.descuento_puntual ?? 0), 0);
}

/**
 * Monto del cargo `renta` al devengar un día.
 * - HOY (día abierto): solo la letra puntual; el recargo va aparte a las 7 p.m.
 * - Días pasados con pago PUNTUAL (antes de las 7 p.m.): letra puntual.
 * - Días pasados sin pago o con pago TARDE: tarifa plena.
 */
export function montoDevengoRenta(
  c: TerminosCuota,
  fecha: string,
  hoy: string,
  pagoEseDia: "puntual" | "tarde" | null,
): number {
  const base = cuotaDeFecha(c, fecha);
  if (base <= 0) return 0;
  if (fecha === hoy) return base;
  if (pagoEseDia === "puntual") return base;
  return tarifaPlena(c, fecha);
}

/**
 * Fecha mínima desde la que se puede devengar. Protege el `saldo_inicial`
 * migrado: sin esta variable no se rellenan días pasados, solo el de hoy.
 */
function devengoDesde(): string | null {
  const v = (process.env.DEVENGO_DESDE ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Por contrato: ¿pagó puntual, tarde o no pagó ese día? (según pagado_at) */
async function estadoPagoDelDia(
  fecha: string,
): Promise<Map<string, "puntual" | "tarde">> {
  const sb = createServerSupabase();
  const { desde, hasta } = rangoDiaPanama(fecha);
  const { data } = await sb
    .from("pagos")
    .select("contrato_id, pagado_at")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .gte("pagado_at", desde.toISOString())
    .lt("pagado_at", hasta.toISOString());

  const map = new Map<string, "puntual" | "tarde">();
  for (const p of (data ?? []) as { contrato_id: string | null; pagado_at: string }[]) {
    if (!p.contrato_id) continue;
    if (esPagoPuntual(p.pagado_at, fecha)) {
      map.set(p.contrato_id, "puntual");
    } else if (!map.has(p.contrato_id)) {
      map.set(p.contrato_id, "tarde");
    }
  }
  return map;
}

/** Contratos que ya tienen multa por pago tardío en esa fecha. */
async function contratosConRecargo(fecha: string): Promise<Set<string>> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("contrato_id")
    .eq("fecha", fecha)
    .eq("tipo", "multa")
    .eq("concepto_codigo", "PAGO_TARDE");
  return new Set(((data ?? []) as { contrato_id: string }[]).map((r) => r.contrato_id));
}

/** Crea los cargos de renta que falten para una fecha concreta. */
export async function devengarDia(fecha: string): Promise<ResultadoDevengo> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();

  const { data: contratos, error } = await sb
    .from("contratos")
    .select("id, fecha_inicio, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .eq("estado", "activo");
  if (error) throw error;

  const [existentes, pagosDelDia] = await Promise.all([
    sb.from("cargos").select("contrato_id").eq("fecha", fecha).eq("tipo", "renta"),
    estadoPagoDelDia(fecha),
  ]);
  const yaTiene = new Set(
    ((existentes.data ?? []) as { contrato_id: string }[]).map((r) => r.contrato_id),
  );

  const res: ResultadoDevengo = { fecha, creados: 0, yaEstaban: 0, sinCuota: 0 };
  const filas: Record<string, unknown>[] = [];

  for (const c of ((contratos ?? []) as unknown as ContratoDevengo[])) {
    if (c.fecha_inicio && c.fecha_inicio > fecha) continue;
    if (yaTiene.has(c.id)) { res.yaEstaban++; continue; }
    const monto = montoDevengoRenta(c, fecha, hoy, pagosDelDia.get(c.id) ?? null);
    if (monto <= 0) { res.sinCuota++; continue; }
    const plena = monto > cuotaDeFecha(c, fecha);
    filas.push({
      contrato_id: c.id,
      fecha,
      tipo: "renta",
      concepto: plena ? "Cuota diaria (sin descuento)" : "Cuota diaria",
      monto,
    });
  }

  if (filas.length === 0) return res;

  const { error: errInsert } = await sb.from("cargos").insert(filas);
  if (!errInsert) {
    res.creados = filas.length;
    return res;
  }

  for (const fila of filas) {
    const { error: e } = await sb.from("cargos").insert(fila);
    if (e) res.yaEstaban++;
    else res.creados++;
  }
  return res;
}

/**
 * A las 7:00 p.m. el día pierde el descuento. Si no hubo pago, se anota el
 * recargo como cargo `multa` (PAGO_TARDE) para que el saldo quede correcto.
 */
export async function aplicarRecargosDelDia(fecha: string): Promise<ResultadoRecargo> {
  const sb = createServerSupabase();

  const { data: contratos, error } = await sb
    .from("contratos")
    .select("id, fecha_inicio, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .eq("estado", "activo");
  if (error) throw error;

  const [pagosDelDia, conRecargo, conRenta] = await Promise.all([
    estadoPagoDelDia(fecha),
    contratosConRecargo(fecha),
    sb.from("cargos").select("contrato_id").eq("fecha", fecha).eq("tipo", "renta"),
  ]);
  const tieneRenta = new Set(
    ((conRenta.data ?? []) as { contrato_id: string }[]).map((r) => r.contrato_id),
  );

  const res: ResultadoRecargo = { fecha, creados: 0, yaTenian: 0 };
  const filas: Record<string, unknown>[] = [];

  for (const c of ((contratos ?? []) as unknown as ContratoDevengo[])) {
    if (c.fecha_inicio && c.fecha_inicio > fecha) continue;
    if (!tieneRenta.has(c.id)) continue; // domingo libre u otro día sin cuota
    if (pagosDelDia.get(c.id) === "puntual") continue;
    if (conRecargo.has(c.id)) { res.yaTenian++; continue; }

    const penalidad = Math.max(Number(c.descuento_puntual ?? 0), 0);
    if (penalidad <= 0) continue;

    filas.push({
      contrato_id: c.id,
      fecha,
      tipo: "multa",
      concepto_codigo: "PAGO_TARDE",
      concepto: "Pago después de las 7 PM",
      monto: penalidad,
    });
  }

  if (filas.length === 0) return res;

  const { error: errInsert } = await sb.from("cargos").insert(filas);
  if (!errInsert) {
    res.creados = filas.length;
    return res;
  }

  for (const fila of filas) {
    const { error: e } = await sb.from("cargos").insert(fila);
    if (e) res.yaTenian++;
    else res.creados++;
  }
  return res;
}

/**
 * Devenga el día de hoy y, si el cron se saltó días, rellena hacia atrás
 * hasta MAX_DIAS_ATRAS sin pasar de DEVENGO_DESDE.
 *
 * Antes de devengar hoy, cierra ayer (recargo si no pagó) por si el cron de
 * las 7 p.m. no corrió.
 */
export async function devengarPendientes(): Promise<{
  hoy: string;
  dias: ResultadoDevengo[];
  recargoAyer: ResultadoRecargo;
  creados: number;
}> {
  const hoy = hoyPanama();
  const ayer = sumarDias(hoy, -1);
  const desde = devengoDesde();

  const recargoAyer = await aplicarRecargosDelDia(ayer);

  const fechas: string[] = [];
  for (let i = MAX_DIAS_ATRAS; i >= 1; i--) {
    const f = sumarDias(hoy, -i);
    if (desde && f >= desde) fechas.push(f);
  }
  fechas.push(hoy);

  const dias: ResultadoDevengo[] = [];
  for (const f of fechas) dias.push(await devengarDia(f));

  return {
    hoy,
    dias,
    recargoAyer,
    creados: dias.reduce((a, d) => a + d.creados, 0) + recargoAyer.creados,
  };
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
