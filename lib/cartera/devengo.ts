// Devengo diario de la cuota.
//
// `vw_saldo_contrato` = saldo_inicial + cargos − pagos. Sin este job no se
// crea nunca el cargo del día, así que el saldo solo baja y el agente termina
// diciéndole al cliente que no debe nada. Aquí se genera, por contrato activo
// y por día operativo, el cargo `renta` con la cuota que le toca.
//
// Regla de negocio (confirmada): si NO paga un día, ese día queda a tarifa
// plena (letra + descuento perdido). Varios días de atraso = varios días a
// tarifa plena.
//
// CÓMO se representa esa regla importa: el cargo `renta` es SIEMPRE la cuota
// base, y el descuento perdido va SIEMPRE aparte como cargo `multa`. Nunca se
// hornea la tarifa plena dentro de la renta. Un cargo de $35 no se puede
// descomponer después; $30 + $5 sí. Eso es lo que permite:
//   - diferir el recargo cuando el cliente mandó comprobante y falta conciliar,
//   - revertirlo si el pago resulta bueno, o aplicarlo si resulta malo,
//   - explicarle al cliente de dónde sale cada dólar de su saldo.
//
// Determinista e idempotente: uq_cargo_renta_dia (0008) + chequeo de multa.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, sumarDias, pasoCorte, diasEntre } from "./fecha";
import { cuotaDeFecha, penalidadDe, type TerminosCuota } from "./cuota";
import {
  contratosQueCubrieronElDia,
  contratosConComprobantePendienteEnDia,
  comprobantePendienteContrato,
  pagoHoyContrato,
} from "./pagos-dia";
import { cubrioCuotaDelDia } from "./cifras";
import { acuerdoHoyDe, type AcuerdoActivo } from "./acuerdo";

/** Días hacia atrás que el job intenta rellenar si el cron no corrió. */
const MAX_DIAS_ATRAS = 7;

/**
 * Cuántos días se le perdona el recargo a un comprobante sin validar.
 *
 * Sin vencimiento, un comprobante que nadie resuelve difiere el recargo para
 * siempre y basta con mandar una imagen cualquiera cada tarde para no pagarlo
 * nunca. Pasado el plazo el recargo entra; si el pago se concilia después,
 * `recalcularRecargo` lo vuelve a quitar. Se corrige solo en ambas direcciones.
 */
const DIAS_GRACIA_COMPROBANTE = 3;

/** ¿Un comprobante pendiente de esa fecha todavía congela el recargo? */
function graciaVigente(fecha: string, hoy = hoyPanama()): boolean {
  return diasEntre(fecha, hoy) <= DIAS_GRACIA_COMPROBANTE;
}

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
  /** Con comprobante sin validar: el recargo espera al desenlace. */
  diferidos: number;
};

/**
 * Fecha mínima desde la que se puede devengar. Protege el `saldo_inicial`
 * migrado: sin esta variable no se rellenan días pasados, solo el de hoy.
 */
function devengoDesde(): string | null {
  const v = (process.env.DEVENGO_DESDE ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
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

/**
 * Crea los cargos de renta que falten para una fecha concreta.
 * Siempre a cuota base: el recargo lo pone `aplicarRecargosDelDia`.
 */
export async function devengarDia(fecha: string): Promise<ResultadoDevengo> {
  const sb = createServerSupabase();

  const { data: contratos, error } = await sb
    .from("contratos")
    .select("id, fecha_inicio, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .eq("estado", "activo");
  if (error) throw error;

  const { data: existentes } = await sb
    .from("cargos").select("contrato_id").eq("fecha", fecha).eq("tipo", "renta");
  const yaTiene = new Set(
    ((existentes ?? []) as { contrato_id: string }[]).map((r) => r.contrato_id),
  );

  const res: ResultadoDevengo = { fecha, creados: 0, yaEstaban: 0, sinCuota: 0 };
  const filas: Record<string, unknown>[] = [];

  for (const c of ((contratos ?? []) as unknown as ContratoDevengo[])) {
    if (c.fecha_inicio && c.fecha_inicio > fecha) continue;
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

  const [pagaronPuntual, conPendiente, conRecargo, conRenta] = await Promise.all([
    contratosQueCubrieronElDia(fecha),
    graciaVigente(fecha) ? contratosConComprobantePendienteEnDia(fecha) : new Set<string>(),
    contratosConRecargo(fecha),
    sb.from("cargos").select("contrato_id").eq("fecha", fecha).eq("tipo", "renta"),
  ]);
  const tieneRenta = new Set(
    ((conRenta.data ?? []) as { contrato_id: string }[]).map((r) => r.contrato_id),
  );

  const res: ResultadoRecargo = { fecha, creados: 0, yaTenian: 0, diferidos: 0 };
  const filas: Record<string, unknown>[] = [];

  for (const c of ((contratos ?? []) as unknown as ContratoDevengo[])) {
    if (c.fecha_inicio && c.fecha_inicio > fecha) continue;
    if (!tieneRenta.has(c.id)) continue; // domingo libre u otro día sin cuota
    if (pagaronPuntual.has(c.id)) continue;
    // Mandó comprobante y nadie lo ha validado: el recargo espera. Si el pago
    // resulta malo, `recalcularRecargo` lo aplica retroactivo.
    if (conPendiente.has(c.id)) { res.diferidos++; continue; }
    if (conRecargo.has(c.id)) { res.yaTenian++; continue; }

    const penalidad = penalidadDe(c);
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
 * Recalcula el recargo de UN contrato en UN día, y lo crea o lo borra según
 * corresponda. Es la contraparte del diferimiento: sin esto, un comprobante
 * falso le compraría al cliente una noche gratis.
 *
 * Se llama cada vez que cambia el desenlace de un pago de ese día: al
 * conciliarlo, al rechazarlo, o al registrar un pago en oficina.
 *
 * El recargo NO va cuando:
 *   - el día no tiene cuota (domingo libre) o no está devengado todavía,
 *   - la SUMA de abonos de hoy antes de las 7 cubre cuota + arreglo,
 *   - sigue habiendo un comprobante de ese día sin validar,
 *   - el día aún está abierto (es hoy y no han dado las 7 p.m.).
 */
export async function recalcularRecargo(
  contratoId: string,
  fecha: string,
): Promise<"creado" | "borrado" | "sin_cambio"> {
  const sb = createServerSupabase();

  const [rentaRes, multaRes, contratoRes] = await Promise.all([
    sb.from("cargos").select("id").eq("contrato_id", contratoId)
      .eq("fecha", fecha).eq("tipo", "renta").limit(1),
    sb.from("cargos").select("id").eq("contrato_id", contratoId)
      .eq("fecha", fecha).eq("tipo", "multa").eq("concepto_codigo", "PAGO_TARDE").limit(1),
    sb.from("contratos")
      .select("letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
      .eq("id", contratoId).maybeSingle(),
  ]);

  const multaId = (multaRes.data ?? [])[0]?.id as string | undefined;
  const borrar = async (): Promise<"borrado" | "sin_cambio"> => {
    if (!multaId) return "sin_cambio";
    await sb.from("cargos").delete().eq("id", multaId);
    return "borrado";
  };

  if ((rentaRes.data ?? []).length === 0) return borrar();

  const [{ pagadoPuntual }, { pendiente }, acuerdosRes] = await Promise.all([
    pagoHoyContrato(contratoId, fecha),
    comprobantePendienteContrato(contratoId, fecha),
    sb.from("acuerdos").select("id, saldo, cuota_diaria, cuota_domingo, descripcion")
      .eq("contrato_id", contratoId).eq("activo", true),
  ]);
  const diaAbierto = fecha === hoyPanama() && !pasoCorte();
  const enGracia = pendiente && graciaVigente(fecha);

  const c = contratoRes.data as TerminosCuota | null;
  const acuerdoHoy = acuerdoHoyDe((acuerdosRes.data ?? []) as AcuerdoActivo[], fecha);
  const meta = (c ? cuotaDeFecha(c, fecha) : 0) + acuerdoHoy;
  const cubrio = cubrioCuotaDelDia(pagadoPuntual, meta);

  if (cubrio || enGracia || diaAbierto) return borrar();
  if (multaId) return "sin_cambio";

  const penalidad = c ? penalidadDe(c) : 0;
  if (penalidad <= 0) return "sin_cambio";

  const { error } = await sb.from("cargos").insert({
    contrato_id: contratoId,
    fecha,
    tipo: "multa",
    concepto_codigo: "PAGO_TARDE",
    concepto: "Pago después de las 7 PM",
    monto: penalidad,
  });
  return error ? "sin_cambio" : "creado";
}

/**
 * Devenga el día de hoy y, si el cron se saltó días, rellena hacia atrás
 * hasta MAX_DIAS_ATRAS sin pasar de DEVENGO_DESDE.
 *
 * Cada día PASADO se cierra además con su recargo: si el cron de las 7 p.m. no
 * corrió esa noche, el día quedaría cobrado a cuota puntual para siempre.
 * Hoy no se cierra aquí — su corte todavía no ha llegado.
 */
export async function devengarPendientes(): Promise<{
  hoy: string;
  dias: ResultadoDevengo[];
  recargos: ResultadoRecargo[];
  creados: number;
}> {
  const hoy = hoyPanama();
  const desde = devengoDesde();

  const pasadas: string[] = [];
  for (let i = MAX_DIAS_ATRAS; i >= 1; i--) {
    const f = sumarDias(hoy, -i);
    if (desde && f >= desde) pasadas.push(f);
  }

  // La renta primero: el recargo solo aplica a días que ya tienen cuota.
  const dias: ResultadoDevengo[] = [];
  for (const f of [...pasadas, hoy]) dias.push(await devengarDia(f));

  const recargos: ResultadoRecargo[] = [];
  for (const f of pasadas) recargos.push(await aplicarRecargosDelDia(f));

  return {
    hoy,
    dias,
    recargos,
    creados:
      dias.reduce((a, d) => a + d.creados, 0) + recargos.reduce((a, r) => a + r.creados, 0),
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
