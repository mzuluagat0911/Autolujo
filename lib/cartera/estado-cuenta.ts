// Motor de estado de cuenta. Calcula, por contrato, lo que el cliente debe hoy
// y arma el mensaje con desglose:
//   $5 arreglo · $30 cuota de hoy · $15 saldo anterior  →  Total a pagar hoy: $50
// Todo determinista (código), nunca el LLM.
//
// Esta es la ÚNICA fuente de las cifras. El contexto del agente, el envío
// masivo y el panel leen de aquí. Si cada uno calcula lo suyo, el mismo chat
// termina dando dos números distintos para lo mismo.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, pasoCorte, fechaLarga, sumarDias } from "./fecha";
import type { TerminosCuota } from "./cuota";
import { calcularCifras, textoDesglose, cubrioCuotaDelDia, type Cifras } from "./cifras";
import {
  contratosConPagoEnDia,
  contratosConComprobantePendienteEnDia,
  pagoHoyContrato,
  comprobantePendienteContrato,
  montosDelDiaPorContrato,
  contratosQueCubrieronElDia,
  aplicadoArregloHoyContrato,
  aplicadoArregloHoyPorContrato,
} from "./pagos-dia";
import { ultimoDiaDevengado } from "./devengo";
import { acuerdoHoyDe, type AcuerdoActivo } from "./acuerdo";
import { cuotaDeFecha, esCumpleanos, tienePermanencia } from "./cuota";
import { tratamientoCliente } from "./tratamiento";
import { enAlcanceCodigo, empresasAlcanceCodigos } from "./alcance";
import { GOLD_CUOTAS_PLAN } from "./data/gold-cuotas-plan";

/** Preferir plan del Excel/DB sobre el cálculo desde ledger (piloto Gold). */
function aplicarPlanCuotas(
  computed: { numCuotasTotal: number | null; cuotasPagadas: number | null; cuotasDebe: number | null },
  opts: {
    numero: string | null | undefined;
    empresa: string | null | undefined;
    cuotasPagadasDb: number | null | undefined;
    numTotalDb: number | null | undefined;
  },
): { numCuotasTotal: number | null; cuotasPagadas: number | null; cuotasDebe: number | null } {
  const plan =
    (opts.empresa ?? "").toUpperCase() === "GOLD" && opts.numero
      ? GOLD_CUOTAS_PLAN[opts.numero]
      : undefined;

  const pagadasDb =
    opts.cuotasPagadasDb != null && Number.isFinite(Number(opts.cuotasPagadasDb))
      ? Number(opts.cuotasPagadasDb)
      : null;
  const totalDb =
    opts.numTotalDb != null && Number.isFinite(Number(opts.numTotalDb)) && Number(opts.numTotalDb) > 0
      ? Number(opts.numTotalDb)
      : null;

  const pagadas = pagadasDb ?? plan?.pagadas ?? computed.cuotasPagadas;
  const total = totalDb ?? plan?.total ?? computed.numCuotasTotal;
  let debe: number | null = null;
  if (plan?.faltantes != null && pagadasDb == null) {
    debe = plan.faltantes;
  } else if (total != null && pagadas != null) {
    debe = Math.max(total - pagadas, 0);
  } else {
    debe = computed.cuotasDebe;
  }
  return {
    numCuotasTotal: total != null ? Math.round(total) : null,
    cuotasPagadas: pagadas,
    cuotasDebe: debe,
  };
}

export function money(n: number): string {
  const v = Math.round(n * 100) / 100;
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

export type EstadoCuenta = Cifras & {
  contratoId: string;
  vehiculoNumero: string;
  empresa: string | null;
  empresaId: string | null;
  empresaNombre: string | null;
  clienteNombre: string;
  clienteGenero: string | null;
  clienteTratamiento: string;
  waNumero: string | null;
  pagoHoy: boolean;
  pagoPuntual: boolean;
  pendiente: boolean;
  pendienteMonto: number;
  pendienteHora: string | null;
  hoyYaDevengado: boolean;
  devengadoHasta: string | null;
  cobraDomingo: boolean;
  cuotaDomingo: number;
  esCumpleanos: boolean;
  cumpleLibreAplica: boolean;
  cumpleMotivo: string | null;
  fechaNacimiento: string | null;
  diasAdelantados: number;
  cubiertoHasta: string | null;
  estadoContrato: string;
  /** Total de cuotas del deal (ej. 1095 / 1200). */
  numCuotasTotal: number | null;
  /** Equivalente en cuotas ya abonadas a renta (aprox.). */
  cuotasPagadas: number | null;
  /** Cuotas que aún faltan del total del contrato. */
  cuotasDebe: number | null;
  /**
   * Suma de recargos por no pagar (PAGO_TARDE en ledger)
   * + el de hoy si ya corrió el corte y aún no está como cargo.
   */
  recargosAcumulados: number;
  desglose: string;
  fecha: string;
  templateVars: [string, string, string, string, string];
};

type ContratoRow = TerminosCuota & {
  id: string;
  cliente_id: string | null;
  estado: string;
  fecha_inicio: string | null;
  num_cuotas_total: number | null;
  /** Migrado del Excel (CUOTAS PAGAS). Null si aún no hay columna / dato. */
  cuotas_pagadas?: number | null;
  vehiculo: {
    numero: string;
    empresa: { id: string; codigo: string; nombre: string } | null;
  } | null;
  cliente: { nombre: string; whatsapp: string | null; genero?: string | null } | null;
};

/**
 * Traduce dinero abonado a renta → número de cuotas.
 * "de 1200 cuotas debe 890" = total del deal − cuotas ya cubiertas.
 */
export function resumenCuotas(opts: {
  numTotal: number | null | undefined;
  letra: number;
  pagadoTotal: number;
  extrasTotal: number;
}): { numCuotasTotal: number | null; cuotasPagadas: number | null; cuotasDebe: number | null } {
  const numTotal =
    opts.numTotal != null && Number.isFinite(opts.numTotal) && opts.numTotal > 0
      ? Math.round(Number(opts.numTotal))
      : null;
  const letra = Number(opts.letra) || 0;
  if (!(letra > 0)) {
    return { numCuotasTotal: numTotal, cuotasPagadas: null, cuotasDebe: null };
  }
  const rentaAbonada = Math.max(Number(opts.pagadoTotal) - Number(opts.extrasTotal), 0);
  const cuotasPagadas = Math.max(0, Math.round(rentaAbonada / letra));
  const cuotasDebe = numTotal != null ? Math.max(numTotal - cuotasPagadas, 0) : null;
  return { numCuotasTotal: numTotal, cuotasPagadas, cuotasDebe };
}

function fmtCuotaNum(n: number): string {
  return n.toLocaleString("es-PA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Plan del deal: "X pagadas · Y debe" (de Z). */
export function textoEstadoCuotas(e: {
  numCuotasTotal: number | null;
  cuotasPagadas: number | null;
  cuotasDebe: number | null;
}): string {
  const pagadas = e.cuotasPagadas;
  const debe = e.cuotasDebe;
  if (pagadas == null && debe == null) {
    if (e.numCuotasTotal == null) return "—";
    return `de ${fmtCuotaNum(e.numCuotasTotal)} cuotas`;
  }
  const p = pagadas != null ? fmtCuotaNum(pagadas) : "—";
  const d = debe != null ? fmtCuotaNum(debe) : "—";
  return `${p} pagadas · ${d} debe`;
}

/** @deprecated usar textoEstadoCuotas */
export function textoValorCuotas(e: {
  numCuotasTotal: number | null;
  cuotasDebe: number | null;
  cuotasPagadas?: number | null;
}): string {
  return textoEstadoCuotas({
    numCuotasTotal: e.numCuotasTotal,
    cuotasPagadas: e.cuotasPagadas ?? null,
    cuotasDebe: e.cuotasDebe,
  });
}

/**
 * Atraso operativo (cuotas diarias pendientes), no el plan completo del deal.
 * 0 = al día (solo le toca la de hoy o ya cubrió).
 */
export function cuotasAtraso(e: {
  letra: number;
  pendienteAnterior: number;
  faltaHoy: number;
  pagoPuntual: boolean;
  totalHoy: number;
}): number {
  const letra = Number(e.letra) || 0;
  if (!(letra > 0)) return 0;
  const atrasadas = Math.max(0, Math.round(Number(e.pendienteAnterior) / letra));
  const debeHoy = !e.pagoPuntual && (Number(e.faltaHoy) > 0.009 || Number(e.totalHoy) > 0.009);
  // Si solo debe hoy y no hay saldo anterior → 0 (al día / le toca la de hoy).
  if (atrasadas === 0) return debeHoy ? 0 : 0;
  return atrasadas;
}

/** ¿Ya tiene al menos 1 cuota pagada por delante del día operativo? */
export function esAdelantado(e: { diasAdelantados: number }): boolean {
  return (Number(e.diasAdelantados) || 0) >= 1;
}

/** Cubrió la cuota de HOY y no está adelantado. */
export function esAlDiaHoy(e: {
  diasAdelantados: number;
  pagoPuntual: boolean;
  totalHoy: number;
}): boolean {
  if (esAdelantado(e)) return false;
  return e.pagoPuntual || e.totalHoy <= 0.009;
}

/**
 * "Pago adelantado · N cuotas" · "Al día" · "Le toca la de hoy" · "Debe N cuotas".
 * Cierre del día = 00:00: si ya pagó mañana, es adelantado (no solo “al día”).
 */
export function textoSituacionCuotas(e: {
  letra: number;
  pendienteAnterior: number;
  faltaHoy: number;
  pagoPuntual: boolean;
  totalHoy: number;
  pendiente: boolean;
  diasAdelantados?: number;
}): string {
  if (e.pendiente) return "Comprobante en validación";
  const adel = Math.max(0, Math.floor(Number(e.diasAdelantados) || 0));
  if (adel >= 1) {
    return adel === 1
      ? "Pago adelantado · 1 cuota"
      : `Pago adelantado · ${adel.toLocaleString("es-PA")} cuotas`;
  }
  if (e.pagoPuntual || e.totalHoy <= 0.009) return "Al día";
  const atrasadas = cuotasAtraso(e);
  if (atrasadas <= 0) return "Le toca la de hoy";
  if (atrasadas === 1) return "Debe 1 cuota";
  return `Debe ${atrasadas.toLocaleString("es-PA")} cuotas`;
}

function armar(
  c: ContratoRow,
  cifras: Cifras,
  extra: {
    hoy: string;
    pagoHoy: boolean;
    pagoPuntual: boolean;
    pendiente: boolean;
    pendienteMonto: number;
    pendienteHora: string | null;
    hoyYaDevengado: boolean;
    devengadoHasta: string | null;
    esCumpleanos: boolean;
    cumpleLibreAplica: boolean;
    cumpleMotivo: string | null;
    fechaNacimiento: string | null;
    estadoContrato: string;
    numCuotasTotal: number | null;
    cuotasPagadas: number | null;
    cuotasDebe: number | null;
    recargosAcumulados?: number;
    /** Días/cuotas ya pagados con fecha > hoy (Excel / pagos futuros). */
    diasPagoFuturo?: number;
    /** Última fecha futura cubierta por esos pagos. */
    cubiertoHastaPago?: string | null;
  },
): EstadoCuenta {
  const manana = sumarDias(extra.hoy, 1);
  let desglose = textoDesglose(cifras.lineas, money);
  if (cifras.recargoSiTarda > 0.009) {
    const aviso = `${money(cifras.recargoSiTarda)} si no completas antes de las 7 p.m.`;
    desglose = desglose ? `${desglose} · ${aviso}` : aviso;
  }
  if (cifras.domingo) {
    desglose = `${desglose} · ${money(cifras.domingo)} domingo ${Number(manana.slice(8, 10))}`;
  }
  if (!desglose) desglose = `${money(cifras.cuenta)} cuenta`;

  const fecha = fechaLarga(extra.hoy);
  const nombre = c.cliente?.nombre?.split(" ")[0] ?? "cliente";
  const carro = c.vehiculo?.numero ?? "—";
  const emp = c.vehiculo?.empresa ?? null;

  // Crédito en saldo (neto con la cuota de hoy) → cuotas por delante.
  const netoConHoy = cifras.saldoVista + cifras.faltaHoy;
  const credito = Math.max(-netoConHoy, 0);
  const diasPorCredito = cifras.letra > 0 ? Math.floor(credito / cifras.letra) : 0;
  const diasPorPagoFuturo = Math.max(0, Math.floor(Number(extra.diasPagoFuturo) || 0));
  const diasAdelantados = Math.max(diasPorCredito, diasPorPagoFuturo);
  const hastaCredito = diasPorCredito > 0 ? sumarDias(extra.hoy, diasPorCredito) : null;
  const hastaPago = extra.cubiertoHastaPago ?? null;
  const cubiertoHasta =
    diasAdelantados > 0
      ? [hastaCredito, hastaPago].filter(Boolean).sort().at(-1) ??
        sumarDias(extra.hoy, diasAdelantados)
      : null;

  // Adelantado (crédito o pago con fecha futura): NO aplica multa de “no pago” hoy.
  // calcularCifras no ve el adelanto (solo cubrieron/pagoPuntual) y inventaba $5.
  const adelantado = diasAdelantados >= 1;
  let cifrasOut = cifras;
  let desgloseOut = desglose;
  let recargosAcc = Math.max(Number(extra.recargosAcumulados) || 0, 0);
  if (adelantado) {
    if (cifras.recargo > 0.009) {
      // Quitá el fantasma de hoy si se había sumado al acumulado (aún no en ledger).
      recargosAcc = Math.max(recargosAcc - cifras.recargo, 0);
    }
    cifrasOut = {
      ...cifras,
      recargo: 0,
      recargoSiTarda: 0,
      totalHoyTarde: cifras.totalHoy,
      lineas: cifras.lineas.filter((l) => l.concepto !== "por no pagar a tiempo"),
    };
    desgloseOut = textoDesglose(cifrasOut.lineas, money);
    if (cifrasOut.domingo) {
      desgloseOut = `${desgloseOut} · ${money(cifrasOut.domingo)} domingo ${Number(manana.slice(8, 10))}`;
    }
    if (!desgloseOut) desgloseOut = `${money(cifrasOut.cuenta)} cuenta`;
  }

  return {
    ...cifrasOut,
    contratoId: c.id,
    vehiculoNumero: carro,
    empresa: emp?.codigo ?? null,
    empresaId: emp?.id ?? null,
    empresaNombre: emp?.nombre ?? null,
    clienteNombre: c.cliente?.nombre ?? "Sin nombre",
    clienteGenero: c.cliente?.genero ?? null,
    clienteTratamiento: tratamientoCliente(c.cliente?.nombre, c.cliente?.genero ?? null),
    waNumero: c.cliente?.whatsapp ?? null,
    pagoHoy: extra.pagoHoy,
    // Semántica: si ya va por delante, hoy está cubierto.
    pagoPuntual: adelantado ? true : extra.pagoPuntual,
    pendiente: extra.pendiente,
    pendienteMonto: extra.pendienteMonto,
    pendienteHora: extra.pendienteHora,
    hoyYaDevengado: extra.hoyYaDevengado,
    devengadoHasta: extra.devengadoHasta,
    cobraDomingo: Boolean(c.cobra_domingo),
    cuotaDomingo: Number(c.cuota_domingo) || 0,
    esCumpleanos: extra.esCumpleanos,
    cumpleLibreAplica: extra.cumpleLibreAplica,
    cumpleMotivo: extra.cumpleMotivo,
    fechaNacimiento: extra.fechaNacimiento,
    diasAdelantados,
    cubiertoHasta,
    estadoContrato: extra.estadoContrato,
    numCuotasTotal: extra.numCuotasTotal,
    cuotasPagadas: extra.cuotasPagadas,
    cuotasDebe: extra.cuotasDebe,
    recargosAcumulados: recargosAcc,
    desglose: desgloseOut,
    fecha,
    templateVars: [nombre, carro, fecha, desgloseOut, money(cifrasOut.totalHoy)],
  };
}

/**
 * Evalúa el beneficio de cumpleaños libre para un contrato en `hoy`, dadas sus
 * cifras. Aplica solo si HOY es su cumpleaños, tiene >= 1 mes de permanencia y
 * está al día (sin saldo anterior). Devuelve también las cifras corregidas
 * (con la cuota de hoy en 0) cuando aplica.
 */
function evaluarCumple(
  c: ContratoRow,
  nac: string | null,
  hoy: string,
  cifras: Cifras,
  entrada: Parameters<typeof calcularCifras>[0],
): { esCumpleanos: boolean; aplica: boolean; motivo: string | null; cifras: Cifras } {
  if (!esCumpleanos(nac, hoy)) {
    return { esCumpleanos: false, aplica: false, motivo: null, cifras };
  }
  if (!tienePermanencia(c.fecha_inicio, hoy, 1)) {
    return { esCumpleanos: true, aplica: false, motivo: "menos de 1 mes de permanencia", cifras };
  }
  if (cifras.pendienteAnterior > 0.009) {
    return { esCumpleanos: true, aplica: false, motivo: "tiene saldo pendiente; debe estar al día", cifras };
  }
  if (cifras.cuotaHoy <= 0) {
    // Hoy ya era libre (domingo) o ya se cobró: no hay nada que descontar.
    return { esCumpleanos: true, aplica: false, motivo: null, cifras };
  }
  return { esCumpleanos: true, aplica: true, motivo: null, cifras: calcularCifras({ ...entrada, diaLibre: true }) };
}

function terminosDe(c: ContratoRow): TerminosCuota {
  return {
    letra_diaria: Number(c.letra_diaria),
    descuento_puntual: c.descuento_puntual,
    cobra_domingo: c.cobra_domingo,
    cuota_domingo: c.cuota_domingo,
  };
}

const SEL =
  "id, cliente_id, estado, fecha_inicio, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo, num_cuotas_total, cuotas_pagadas, vehiculo:vehiculos(numero, empresa:empresas(id, codigo, nombre)), cliente:clientes(nombre, whatsapp)";
const SEL_SIN_CUOTAS_PAGADAS =
  "id, cliente_id, estado, fecha_inicio, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo, num_cuotas_total, vehiculo:vehiculos(numero, empresa:empresas(id, codigo, nombre)), cliente:clientes(nombre, whatsapp)";

/** Pagos a renta vs cargos extras, por contrato → resumen de cuotas. */
async function cuotasPorContrato(
  contratoIds: string[],
  letraDe: (id: string) => number,
  numTotalDe: (id: string) => number | null,
): Promise<Map<string, ReturnType<typeof resumenCuotas>>> {
  const out = new Map<string, ReturnType<typeof resumenCuotas>>();
  const ids = contratoIds.filter(Boolean);
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const [pg, ext] = await Promise.all([
    sb
      .from("pagos")
      .select("contrato_id, monto")
      .in("contrato_id", ids)
      .in("estado_conciliacion", ["conciliado", "manual"]),
    sb
      .from("cargos")
      .select("contrato_id, monto")
      .in("contrato_id", ids)
      .not("tipo", "in", "(renta,cuenta_diaria,acuerdo)"),
  ]);
  const pagado = new Map<string, number>();
  for (const p of (pg.data ?? []) as { contrato_id: string | null; monto: number }[]) {
    if (!p.contrato_id) continue;
    pagado.set(p.contrato_id, (pagado.get(p.contrato_id) ?? 0) + Number(p.monto || 0));
  }
  const extras = new Map<string, number>();
  for (const x of (ext.data ?? []) as { contrato_id: string; monto: number }[]) {
    extras.set(x.contrato_id, (extras.get(x.contrato_id) ?? 0) + Number(x.monto || 0));
  }
  for (const id of ids) {
    out.set(
      id,
      resumenCuotas({
        numTotal: numTotalDe(id),
        letra: letraDe(id),
        pagadoTotal: pagado.get(id) ?? 0,
        extrasTotal: extras.get(id) ?? 0,
      }),
    );
  }
  return out;
}

/**
 * Fecha de nacimiento por cliente. En una consulta aparte y a prueba de fallos:
 * si la columna aún no existe (migración 0015 sin correr), devuelve vacío y el
 * beneficio de cumpleaños simplemente no aplica todavía.
 */
async function nacimientosDe(clienteIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = clienteIds.filter(Boolean);
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data, error } = await sb.from("clientes").select("id, fecha_nacimiento").in("id", ids);
  if (error) return out; // columna inexistente u otro problema → sin cumpleaños
  for (const r of (data ?? []) as { id: string; fecha_nacimiento: string | null }[]) {
    out.set(r.id, r.fecha_nacimiento ?? null);
  }
  return out;
}

/** Género (Sr./Sra.). Consulta aparte: si falta la migración 0023, no rompe cartera. */
async function generosDe(clienteIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = clienteIds.filter(Boolean);
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data, error } = await sb.from("clientes").select("id, genero").in("id", ids);
  if (error) return out;
  for (const r of (data ?? []) as { id: string; genero: string | null }[]) {
    out.set(r.id, r.genero ?? null);
  }
  return out;
}

async function acuerdosActivos(): Promise<Map<string, AcuerdoActivo[]>> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("acuerdos")
    .select("id, contrato_id, saldo, cuota_diaria, cuota_domingo, descripcion")
    .eq("activo", true);
  const out = new Map<string, AcuerdoActivo[]>();
  for (const a of (data ?? []) as (AcuerdoActivo & { contrato_id: string })[]) {
    const list = out.get(a.contrato_id) ?? [];
    list.push(a);
    out.set(a.contrato_id, list);
  }
  return out;
}

/** Estado de cuenta de un solo contrato. */
export async function estadoCuentaContrato(contratoId: string): Promise<EstadoCuenta | null> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();

  const { data: c, error: errSel } = await sb.from("contratos").select(SEL).eq("id", contratoId).maybeSingle();
  let row: ContratoRow | null = c as unknown as ContratoRow | null;
  if (errSel && /cuotas_pagadas/i.test(errSel.message)) {
    const retry = await sb.from("contratos").select(SEL_SIN_CUOTAS_PAGADAS).eq("id", contratoId).maybeSingle();
    row = retry.data
      ? ({ ...(retry.data as unknown as ContratoRow), cuotas_pagadas: null } as ContratoRow)
      : null;
  }
  if (!row) return null;

  const [s, pago, multa, devengadoHasta, pend, acuerdosMap, arregloAplicado, cuotasMap, generos, multasTodas] =
    await Promise.all([
    sb.from("vw_saldo_contrato").select("saldo_actual").eq("contrato_id", contratoId).maybeSingle(),
    pagoHoyContrato(contratoId, hoy),
    sb.from("cargos").select("id").eq("contrato_id", contratoId).eq("fecha", hoy)
      .eq("tipo", "multa").eq("concepto_codigo", "PAGO_TARDE").limit(1),
    ultimoDiaDevengado(contratoId),
    comprobantePendienteContrato(contratoId, hoy),
    acuerdosActivos(),
    aplicadoArregloHoyContrato(contratoId, hoy),
    cuotasPorContrato(
      [contratoId],
      () => Number(row.letra_diaria) || 0,
      () => row.num_cuotas_total ?? null,
    ),
    generosDe(row.cliente_id ? [row.cliente_id] : []),
    sb.from("cargos").select("monto").eq("contrato_id", contratoId).eq("tipo", "multa")
      .eq("concepto_codigo", "PAGO_TARDE"),
  ]);

  if (row.cliente) {
    row.cliente = { ...row.cliente, genero: generos.get(row.cliente_id!) ?? null };
  }

  const hoyYaDevengado = devengadoHasta != null && devengadoHasta >= hoy;
  const acuerdoHoy = Math.max(acuerdoHoyDe(acuerdosMap.get(contratoId) ?? [], hoy), arregloAplicado);
  const meta = cuotaDeFecha(terminosDe(row), hoy) + acuerdoHoy;
  const pagoPuntual = cubrioCuotaDelDia(pago.pagadoPuntualCuota, meta);
  // Contrato cerrado (devuelto/finalizado/abandonado…): ya NO corre cuota diaria;
  // solo queda la deuda pendiente. Se trata como "día libre" permanente.
  const contratoCerrado = row.estado !== "activo";
  const entrada = {
    terminos: terminosDe(row),
    saldo: Number((s.data as { saldo_actual: number } | null)?.saldo_actual ?? 0),
    pagoHoy: pago.pagoHoy,
    pagoPuntual,
    pagadoHoy: pago.pagadoCuota,
    acuerdoHoy,
    faltaAcuerdo: acuerdoHoy,
    pendiente: pend.pendiente,
    hoy,
    corte: pasoCorte(),
    multaHoyRegistrada: (multa.data?.length ?? 0) > 0,
    hoyYaDevengado,
    diaLibre: contratoCerrado,
  };
  const cifrasBase = calcularCifras(entrada);
  const nac = row.cliente_id ? (await nacimientosDe([row.cliente_id])).get(row.cliente_id) ?? null : null;
  const cumple = evaluarCumple(row, nac, hoy, cifrasBase, entrada);
  const cuotas = aplicarPlanCuotas(
    cuotasMap.get(contratoId) ??
      resumenCuotas({
        numTotal: row.num_cuotas_total,
        letra: Number(row.letra_diaria) || 0,
        pagadoTotal: 0,
        extrasTotal: 0,
      }),
    {
      numero: row.vehiculo?.numero,
      empresa: row.vehiculo?.empresa?.codigo,
      cuotasPagadasDb: row.cuotas_pagadas,
      numTotalDb: row.num_cuotas_total,
    },
  );
  const cifras = cumple.cifras;
  const recargosLedger = ((multasTodas.data ?? []) as { monto: number }[]).reduce(
    (s, g) => s + Number(g.monto || 0),
    0,
  );
  const recargosAcumulados =
    recargosLedger +
    (cifras.recargo > 0.009 && !(multa.data?.length ?? 0) ? cifras.recargo : 0);

  return armar(row, cifras, {
    hoy,
    pagoHoy: pago.pagoHoy,
    pagoPuntual,
    pendiente: pend.pendiente,
    pendienteMonto: pend.monto,
    pendienteHora: pend.hora,
    hoyYaDevengado,
    devengadoHasta,
    esCumpleanos: cumple.esCumpleanos,
    cumpleLibreAplica: cumple.aplica,
    cumpleMotivo: cumple.motivo,
    fechaNacimiento: nac,
    estadoContrato: row.estado,
    numCuotasTotal: cuotas.numCuotasTotal,
    cuotasPagadas: cuotas.cuotasPagadas,
    cuotasDebe: cuotas.cuotasDebe,
    recargosAcumulados,
  });
}

/** Última renta de cada contrato en la ventana de catch-up (7 días). */
async function ultimoDevengoPorContrato(hoy: string): Promise<Map<string, string>> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("contrato_id, fecha")
    .eq("tipo", "renta")
    .gte("fecha", sumarDias(hoy, -7));
  const out = new Map<string, string>();
  for (const r of (data ?? []) as { contrato_id: string; fecha: string }[]) {
    const prev = out.get(r.contrato_id);
    if (!prev || r.fecha > prev) out.set(r.contrato_id, r.fecha);
  }
  return out;
}

/** Pagos con fecha > hoy → cuotas adelantadas (cierre del día = 00:00). */
async function adelantoFuturoPorContrato(
  contratoIds: string[],
  hoy: string,
  letraDe: (id: string) => number,
): Promise<Map<string, { dias: number; hasta: string | null }>> {
  const out = new Map<string, { dias: number; hasta: string | null }>();
  const ids = contratoIds.filter(Boolean);
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("contrato_id, fecha, monto")
    .in("contrato_id", ids)
    .gt("fecha", hoy)
    .in("estado_conciliacion", ["conciliado", "manual"]);
  type Acc = { fechas: Set<string>; monto: number };
  const acc = new Map<string, Acc>();
  for (const p of (data ?? []) as { contrato_id: string | null; fecha: string; monto: number }[]) {
    if (!p.contrato_id || !p.fecha) continue;
    const cur = acc.get(p.contrato_id) ?? { fechas: new Set<string>(), monto: 0 };
    cur.fechas.add(p.fecha);
    cur.monto += Number(p.monto) || 0;
    acc.set(p.contrato_id, cur);
  }
  for (const [id, a] of acc) {
    const letra = letraDe(id);
    const porMonto = letra > 0.009 ? Math.floor(a.monto / letra) : 0;
    const dias = Math.max(a.fechas.size, porMonto);
    const hasta = [...a.fechas].sort().at(-1) ?? null;
    out.set(id, { dias, hasta });
  }
  return out;
}

/** Arma estados de todos los contratos activos del alcance. */
async function armarEstadosAlcance(): Promise<EstadoCuenta[]> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const corte = pasoCorte();

  const [contratos, saldos, multasHoy, pagaronHoy, cubrieron, pendientes, lastRenta, pagadoMap, acuerdosMap, arregloMap] =
    await Promise.all([
      sb.from("contratos").select(SEL).eq("estado", "activo"),
      sb.from("vw_saldo_contrato").select("contrato_id, saldo_actual"),
      sb.from("cargos").select("contrato_id").eq("fecha", hoy).eq("tipo", "multa")
        .eq("concepto_codigo", "PAGO_TARDE"),
      contratosConPagoEnDia(hoy),
      contratosQueCubrieronElDia(hoy),
      contratosConComprobantePendienteEnDia(hoy),
      ultimoDevengoPorContrato(hoy),
      montosDelDiaPorContrato(hoy),
      acuerdosActivos(),
      aplicadoArregloHoyPorContrato(hoy),
    ]);

  const saldoMap = new Map<string, number>();
  for (const s of (saldos.data ?? []) as { contrato_id: string; saldo_actual: number | null }[]) {
    saldoMap.set(s.contrato_id, Number(s.saldo_actual ?? 0));
  }
  const multaHoy = new Set((multasHoy.data ?? []).map((g: { contrato_id: string }) => g.contrato_id));

  let filasContrato = (contratos.data ?? []) as unknown as ContratoRow[];
  if (contratos.error && /cuotas_pagadas/i.test(contratos.error.message)) {
    const retry = await sb.from("contratos").select(SEL_SIN_CUOTAS_PAGADAS).eq("estado", "activo");
    filasContrato = ((retry.data ?? []) as unknown as ContratoRow[]).map((c) => ({
      ...c,
      cuotas_pagadas: null,
    }));
  } else if (contratos.error && /num_cuotas_total/i.test(contratos.error.message)) {
    const retry = await sb
      .from("contratos")
      .select(
        "id, cliente_id, estado, fecha_inicio, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo, vehiculo:vehiculos(numero, empresa:empresas(id, codigo, nombre)), cliente:clientes(nombre, whatsapp)",
      )
      .eq("estado", "activo");
    filasContrato = ((retry.data ?? []) as unknown as ContratoRow[]).map((c) => ({
      ...c,
      num_cuotas_total: null,
      cuotas_pagadas: null,
    }));
  }

  const allow = await empresasAlcanceCodigos();
  if (allow) {
    filasContrato = filasContrato.filter((c) =>
      enAlcanceCodigo(c.vehiculo?.empresa?.codigo ?? null, allow),
    );
  }

  const idsAlcance = filasContrato.map((c) => c.id);
  const recargosMap = new Map<string, number>();
  if (idsAlcance.length > 0) {
    const { data: multasAlcance } = await sb
      .from("cargos")
      .select("contrato_id, monto")
      .eq("tipo", "multa")
      .eq("concepto_codigo", "PAGO_TARDE")
      .in("contrato_id", idsAlcance);
    for (const g of (multasAlcance ?? []) as { contrato_id: string; monto: number }[]) {
      recargosMap.set(g.contrato_id, (recargosMap.get(g.contrato_id) ?? 0) + Number(g.monto || 0));
    }
  }

  const cuotasMap = await cuotasPorContrato(
    idsAlcance,
    (id) => Number(filasContrato.find((c) => c.id === id)?.letra_diaria) || 0,
    (id) => filasContrato.find((c) => c.id === id)?.num_cuotas_total ?? null,
  );
  const adelantoMap = await adelantoFuturoPorContrato(
    idsAlcance,
    hoy,
    (id) => Number(filasContrato.find((c) => c.id === id)?.letra_diaria) || 0,
  );
  const nacMap = await nacimientosDe(filasContrato.map((c) => c.cliente_id ?? "").filter(Boolean));
  const genMap = await generosDe(filasContrato.map((c) => c.cliente_id ?? "").filter(Boolean));

  return filasContrato.map((c) => {
    if (c.cliente && c.cliente_id) {
      c = { ...c, cliente: { ...c.cliente, genero: genMap.get(c.cliente_id) ?? null } };
    }
    const acuerdoHoy = Math.max(acuerdoHoyDe(acuerdosMap.get(c.id) ?? [], hoy), arregloMap.get(c.id) ?? 0);
    const pagoHoy = pagaronHoy.has(c.id);
    const pagoPuntual = cubrieron.has(c.id);
    const pendiente = pendientes.has(c.id);
    const devengadoHasta = lastRenta.get(c.id) ?? null;
    const hoyYaDevengado = devengadoHasta != null && devengadoHasta >= hoy;
    const entrada = {
      terminos: terminosDe(c),
      saldo: saldoMap.get(c.id) ?? 0,
      pagoHoy,
      pagoPuntual,
      pagadoHoy: pagadoMap.get(c.id) ?? 0,
      acuerdoHoy,
      faltaAcuerdo: acuerdoHoy,
      pendiente,
      hoy,
      corte,
      multaHoyRegistrada: multaHoy.has(c.id),
      hoyYaDevengado,
    };
    const cifrasBase = calcularCifras(entrada);
    const nac = c.cliente_id ? nacMap.get(c.cliente_id) ?? null : null;
    const cumple = evaluarCumple(c, nac, hoy, cifrasBase, entrada);
    const cuotas = aplicarPlanCuotas(
      cuotasMap.get(c.id) ?? {
        numCuotasTotal: c.num_cuotas_total ?? null,
        cuotasPagadas: null,
        cuotasDebe: null,
      },
      {
        numero: c.vehiculo?.numero,
        empresa: c.vehiculo?.empresa?.codigo,
        cuotasPagadasDb: c.cuotas_pagadas,
        numTotalDb: c.num_cuotas_total,
      },
    );
    const cifras = cumple.cifras;
    const recargosAcumulados =
      (recargosMap.get(c.id) ?? 0) +
      (cifras.recargo > 0.009 && !multaHoy.has(c.id) ? cifras.recargo : 0);
    const adel = adelantoMap.get(c.id);
    return armar(c, cifras, {
      hoy,
      pagoHoy,
      pagoPuntual,
      pendiente,
      pendienteMonto: 0,
      pendienteHora: null,
      hoyYaDevengado,
      devengadoHasta,
      esCumpleanos: cumple.esCumpleanos,
      cumpleLibreAplica: cumple.aplica,
      cumpleMotivo: cumple.motivo,
      fechaNacimiento: nac,
      estadoContrato: c.estado,
      numCuotasTotal: cuotas.numCuotasTotal,
      cuotasPagadas: cuotas.cuotasPagadas,
      cuotasDebe: cuotas.cuotasDebe,
      recargosAcumulados,
      diasPagoFuturo: adel?.dias ?? 0,
      cubiertoHastaPago: adel?.hasta ?? null,
    });
  });
}

/**
 * Gravedad operativa para ordenar Situación: a mayor valor, más delicado.
 * Quien más debe hoy va primero; al día y adelantado al final.
 */
export function gravedadSituacion(e: {
  diasAdelantados: number;
  pagoPuntual: boolean;
  totalHoy: number;
  pendiente: boolean;
  pendienteMonto?: number;
  recargosAcumulados?: number;
}): number {
  if (esAdelantado(e)) return -1_000_000 - (Number(e.diasAdelantados) || 0);
  if (esAlDiaHoy(e)) return -1;
  const debe = Math.max(Number(e.totalHoy) || 0, Number(e.pendienteMonto) || 0);
  const recargos = Number(e.recargosAcumulados) || 0;
  // Comprobante en validación: un poco menos urgente que deuda abierta del mismo monto.
  return debe + recargos * 0.001 + (e.pendiente ? -0.5 : 0);
}

/**
 * Panel de Estado de cuenta: TODOS los contratos del alcance.
 * Cierre 00:00: quien ya pagó mañana = «Pago adelantado»; quien solo cubrió hoy = «Al día».
 * Orden: lo más delicado primero (quien más debe).
 */
export async function estadosCuentaPanel(): Promise<EstadoCuenta[]> {
  const todos = await armarEstadosAlcance();
  return [...todos].sort((a, b) => gravedadSituacion(b) - gravedadSituacion(a));
}

/** Cola de cobro / envío: solo quien aún debe hoy (sin comprobante pendiente). */
export async function estadosCuentaHoy(): Promise<EstadoCuenta[]> {
  const todos = await armarEstadosAlcance();
  return todos
    .filter((e) => e.totalHoy > 0.009 && !e.pendiente)
    .sort((a, b) => b.totalHoy - a.totalHoy);
}
