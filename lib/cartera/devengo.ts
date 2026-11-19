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
import { hoyPanama, sumarDias, pasoCorte, diasEntre, esDomingo } from "./fecha";
import { cuotaDeFecha, correLetraNueva, letraDiariaEnDomingo, omiteDomingoYaCerrado, penalidadDe, esCumpleanos, tienePermanencia, type TerminosCuota } from "./cuota";
import { descuentosLetraDelDia, descuentoLetraDe } from "./descuento-letra";
import { devolucionesAbiertas, devolucionVigente } from "./devolucion";
import { inactivacionesAbiertas, inactivacionVigente } from "./inactivo";
import { filasUltimaLetra } from "./archivo-caso";
import { fechaCaeEnSinLetra, pausasAbiertas, pausaVigente, ventanasSinLetraPorVehiculo } from "./pausa-productiva";
import {
  contratosQueCubrieronElDia,
  contratosConComprobantePendienteEnDia,
  comprobantePendienteContrato,
  pagoHoyContrato,
} from "./pagos-dia";
import { cubrioCuotaDelDia } from "./cifras";
import { carroSinCliente } from "./envio-pausa";

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
  cliente_id: string | null;
  vehiculo_id: string | null;
  fecha_inicio: string;
  /** Si existe, la letra diaria empieza aquí (no en fecha_inicio). */
  fecha_inicio_letra: string | null;
  created_at?: string | null;
  vehiculo?: {
    numero?: string | null;
    empresa?: { codigo?: string | null } | null;
  } | null;
};

/** Día desde el cual corre la letra diaria. */
function inicioLetraDe(c: { fecha_inicio: string; fecha_inicio_letra?: string | null }): string {
  return (c.fecha_inicio_letra && c.fecha_inicio_letra.trim()) || c.fecha_inicio;
}

/**
 * Fechas de nacimiento por cliente, a prueba de fallos: si la columna aún no
 * existe (migración 0015 sin correr), devuelve vacío y no aplica cumpleaños.
 */
async function nacimientosPorCliente(): Promise<Map<string, string | null>> {
  const sb = createServerSupabase();
  const { data, error } = await sb.from("clientes").select("id, fecha_nacimiento");
  const out = new Map<string, string | null>();
  if (error) return out;
  for (const r of (data ?? []) as { id: string; fecha_nacimiento: string | null }[]) {
    out.set(r.id, r.fecha_nacimiento ?? null);
  }
  return out;
}

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
    .select("id, cliente_id, vehiculo_id, fecha_inicio, fecha_inicio_letra, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo, created_at, vehiculo:vehiculos(numero, empresa:empresas(codigo))")
    .eq("estado", "activo");
  if (error) throw error;

  const { data: existentes } = await sb
    .from("cargos").select("id, contrato_id, monto").eq("fecha", fecha).eq("tipo", "renta");
  const yaTiene = new Set<string>();
  const rentaPrevia = new Map<string, { id: string; monto: number }>();
  for (const r of (existentes ?? []) as { id: string; contrato_id: string; monto: number }[]) {
    yaTiene.add(r.contrato_id);
    const monto = Number(r.monto) || 0;
    const previa = rentaPrevia.get(r.contrato_id);
    if (!previa || monto > previa.monto) rentaPrevia.set(r.contrato_id, { id: r.id, monto });
  }

  // Saldo + cumpleaños por contrato (el beneficio aplica solo si está al día).
  const idsActivos = ((contratos ?? []) as { id: string }[]).map((c) => c.id);
  const { data: saldos } = idsActivos.length
    ? await sb.from("vw_saldo_contrato").select("contrato_id, saldo_actual").in("contrato_id", idsActivos)
    : { data: [] as { contrato_id: string; saldo_actual: number | null }[] };
  const saldoMap = new Map<string, number>();
  for (const s of (saldos ?? []) as { contrato_id: string; saldo_actual: number | null }[]) {
    saldoMap.set(s.contrato_id, Number(s.saldo_actual ?? 0));
  }
  const nacMap = await nacimientosPorCliente();
  // Primero el cierre: si hoy es la activación, quita las letras del tramo y
  // deja la ventana fechada. Después se leen las ventanas, ya cerradas.
  const [pausas, devoluciones, inactivaciones, descuentosLetra] = await Promise.all([
    pausasAbiertas(),
    devolucionesAbiertas(),
    inactivacionesAbiertas(),
    descuentosLetraDelDia(fecha),
  ]);
  const ventanas = await ventanasSinLetraPorVehiculo();

  const hoy = hoyPanama();
  const domingoPasado = esDomingo(fecha) && fecha < hoy;
  const conLetraPosterior = new Set<string>();
  if (domingoPasado && idsActivos.length) {
    const { data: posteriores, error: errPost } = await sb
      .from("cargos")
      .select("contrato_id")
      .in("contrato_id", idsActivos)
      .eq("tipo", "renta")
      .gt("fecha", fecha)
      .gt("monto", 0);
    if (errPost) throw errPost;
    for (const r of (posteriores ?? []) as { contrato_id: string }[]) conLetraPosterior.add(r.contrato_id);
  }

  const res: ResultadoDevengo = { fecha, creados: 0, yaEstaban: 0, sinCuota: 0 };
  const filas: Record<string, unknown>[] = [];

  for (const c of ((contratos ?? []) as unknown as ContratoDevengo[])) {
    if (inicioLetraDe(c) > fecha) continue;
    if (carroSinCliente(c.vehiculo?.empresa?.codigo, c.vehiculo?.numero, c.created_at)) {
      res.sinCuota++;
      continue;
    }
    const bruto = cuotaDeFecha(c, fecha);
    const descuento = descuentosLetra.get(c.vehiculo_id ?? "") ?? 0;
    const monto = Math.max(Math.round((bruto - descuento) * 100) / 100, 0);
    if (monto <= 0) { res.sinCuota++; continue; }
    // Domingo no abre renta nueva. Se cobra el impago que ya está en el
    // saldo y, si hay balde DOMINGOS, una tajada. Al día queda en $0
    // (G14: saldo $163; sumarle la cuota domingo daba $193 de más).
    // Domingo normal: no abre letra. La excepción (cobra domingo y sin cuota
    // de domingo) sí abre la letra diaria.
    if (esDomingo(fecha) && !letraDiariaEnDomingo(c)) {
      res.sinCuota++;
      continue;
    }
    // Hueco de un domingo viejo: la semana ya siguió con letra, no se rellena.
    if (letraDiariaEnDomingo(c) && omiteDomingoYaCerrado(fecha, hoy, conLetraPosterior.has(c.id))) {
      res.sinCuota++;
      continue;
    }
    // En taller, o devuelto desde la fecha: no se abre letra nueva.
    const vehiculoId = c.vehiculo_id ?? "";
    if (
      fechaCaeEnSinLetra(ventanas.get(vehiculoId) ?? [], fecha) ||
      pausaVigente(pausas.get(vehiculoId), fecha) ||
      devolucionVigente(devoluciones.get(vehiculoId), fecha) ||
      inactivacionVigente(inactivaciones.get(vehiculoId), fecha)
    ) {
      res.sinCuota++;
      continue;
    }
    // Cumpleaños libre: no se genera cargo si es su cumpleaños, tiene >= 1 mes
    // de permanencia y está al día (sin saldo pendiente al momento del devengo).
    const nac = c.cliente_id ? nacMap.get(c.cliente_id) ?? null : null;
    if (
      esCumpleanos(nac, fecha) &&
      tienePermanencia(c.fecha_inicio, fecha, 1) &&
      (saldoMap.get(c.id) ?? 0) <= 0.009
    ) {
      res.sinCuota++;
      continue;
    }
    const previa = rentaPrevia.get(c.id);
    if (previa) {
      if (previa.monto + 0.009 < monto) {
        const { error: errTope } = await sb.from("cargos").update({ monto }).eq("id", previa.id);
        if (errTope) res.yaEstaban++;
        else res.creados++;
      } else res.yaEstaban++;
      continue;
    }
    filas.push({
      contrato_id: c.id,
      fecha,
      tipo: "renta",
      concepto: "Cuota diaria",
      monto,
    });
  }

  filas.push(...(await filasUltimaLetra(fecha, yaTiene)));

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
  // El recargo de no pago solo lo carga el equipo, a mano. El cron no lo crea.
  void fecha;
  return { fecha, creados: 0, yaTenian: 0, diferidos: 0 };
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
  // No crea ni borra la multa. Si el equipo la cargó, se queda.
  void contratoId;
  void fecha;
  return "sin_cambio";
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

/**
 * Una letra pagada por adelantado nace con su cargo el mismo día.
 * Si el cargo no existe, ese pago queda suelto en el saldo y paga
 * el mantenimiento, el recargo o el cierre. El cargo no pasa de la
 * cuota del día ni de lo que el pago ya cubrió.
 */
export async function asegurarLetraAdelantada(opts: {
  contratoId: string;
  asignaciones: { tipo?: string; etiqueta?: string | null; aplicado?: number }[];
}): Promise<number> {
  const hoy = hoyPanama();
  const porDia = new Map<string, number>();
  for (const a of opts.asignaciones) {
    const tipo = (a.tipo ?? "").toLowerCase();
    if (tipo !== "cuenta_diaria" && tipo !== "cuenta") continue;
    const marca = /^letra (\d{4}-\d{2}-\d{2})$/i.exec(a.etiqueta ?? "");
    if (!marca || marca[1] < hoy) continue;
    const aplicado = Math.max(Number(a.aplicado) || 0, 0);
    if (aplicado <= 0.009) continue;
    porDia.set(marca[1], Math.round(((porDia.get(marca[1]) ?? 0) + aplicado) * 100) / 100);
  }
  if (porDia.size === 0) return 0;

  const sb = createServerSupabase();
  const { data: contrato } = await sb
    .from("contratos")
    .select("id, vehiculo_id, fecha_inicio, fecha_inicio_letra, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .eq("id", opts.contratoId)
    .maybeSingle();
  const c = contrato as (TerminosCuota & {
    vehiculo_id: string | null;
    fecha_inicio: string;
    fecha_inicio_letra: string | null;
  }) | null;
  if (!c?.fecha_inicio) return 0;
  if (inicioLetraDe(c) > hoy && [...porDia.keys()].every((f) => f < inicioLetraDe(c))) return 0;

  const vehiculoId = c.vehiculo_id ?? "";
  const [pausas, devoluciones, inactivaciones, ventanas] = await Promise.all([
    pausasAbiertas(),
    devolucionesAbiertas(),
    inactivacionesAbiertas(),
    ventanasSinLetraPorVehiculo(),
  ]);
  const fechas = [...porDia.keys()];
  const { data: rentas } = await sb
    .from("cargos")
    .select("id, fecha, monto")
    .eq("contrato_id", opts.contratoId)
    .eq("tipo", "renta")
    .in("fecha", fechas);
  const rentaPorFecha = new Map<string, { id: string; monto: number }>();
  for (const r of (rentas ?? []) as { id: string; fecha: string; monto: number }[]) {
    const fecha = String(r.fecha).slice(0, 10);
    const monto = Number(r.monto) || 0;
    const previa = rentaPorFecha.get(fecha);
    if (!previa || monto > previa.monto) rentaPorFecha.set(fecha, { id: r.id, monto });
  }

  const inicio = inicioLetraDe(c);
  let tocados = 0;
  for (const [fecha, asignado] of porDia) {
    if (fecha < inicio) continue;
    if (!correLetraNueva(c, fecha)) continue;
    if (
      fechaCaeEnSinLetra(ventanas.get(vehiculoId) ?? [], fecha) ||
      pausaVigente(pausas.get(vehiculoId), fecha) ||
      devolucionVigente(devoluciones.get(vehiculoId), fecha) ||
      inactivacionVigente(inactivaciones.get(vehiculoId), fecha)
    ) {
      continue;
    }
    const descuento = vehiculoId ? await descuentoLetraDe(vehiculoId, fecha) : 0;
    const cuota = Math.max(Math.round((cuotaDeFecha(c, fecha) - descuento) * 100) / 100, 0);
    if (cuota <= 0.009) continue;
    const objetivo = Math.min(asignado, cuota);
    const previa = rentaPorFecha.get(fecha);
    if (!previa) {
      const { error } = await sb.from("cargos").insert({
        contrato_id: opts.contratoId,
        fecha,
        tipo: "renta",
        concepto: "Cuota diaria",
        monto: objetivo,
      });
      if (!error) tocados++;
      continue;
    }
    if (previa.monto + 0.009 < objetivo) {
      const { error } = await sb.from("cargos").update({ monto: objetivo }).eq("id", previa.id);
      if (!error) tocados++;
    }
  }
  return tocados;
}
