// Árbol de un abono, lun–sáb:
// 1) Tajada del domingo pasado, si sigue sin pagar. Una sola, no el balde.
//    El próximo domingo no se abre. El sábado tampoco.
// 2) Recargo por no pago (la multa ya cargada, no un $5 inventado).
// 3) Compromiso de pago del día: solo el plan de adelante. El que sigue
//    (recogida u otro) espera a que ese saldo quede en cero. Excepción solo
//    si el equipo asigna el rubro a mano.
// 4) Recargo Cierre semana ($10), si está cargado. No es atraso ni letra.
// 5) Letras atrasadas.
// 6) Letra del día.
// 7) Si sobra: días siguientes, cada uno acuerdo y luego letra.
//    El próximo domingo no se llena, salvo que el pago traiga ese rubro.
//    Sábado: el sobrante no se adelanta solo.
//
// Domingo:
// 1) La tajada del día, antes que la letra atrasada y que otro concepto.
// 2) Recargo, cuota de acuerdo que toque hoy, letra atrasada.
// 3) El excedente va a la letra siguiente, salvo que quede saldo de acuerdo
//    (baja el plan) o el pago traiga rubro domingo (adelanta el próximo
//    domingo, solo hasta el balde que queda). El atraso ya se comió en el 2.

import { createServerSupabase } from "@/lib/supabase/server";
import { distribuirPago } from "./rules";
import { cuotaDeFecha, penalidadDe, type TerminosCuota } from "./cuota";
import { calcularCifras, cubrioCuotaDelDia } from "./cifras";
import { cargosExtraPorContrato, partirCargosNoLetra } from "./extracto-desglose";
import { cuotaAcuerdoHoy, planQueCobra, programadoAcuerdoDe, type AcuerdoActivo } from "./acuerdo";
import { devolucionDeVehiculo, devolucionVigente } from "./devolucion";
import { inactivacionDeVehiculo, inactivacionVigente } from "./inactivo";
import { pausaDeVehiculo, pausaVigente } from "./pausa-productiva";
import { diaSemana, fechaContable, hoyPanama, pasoCorte, esPagoPuntual, esDomingo, domingoDelCiclo, rangoDiaPanama } from "./fecha";
import { tajadaDomingoQueFalta } from "./cifras";
import { atrasoAcuerdoPorContrato, pagoHoyContrato } from "./pagos-dia";
import type { AsignacionPago, Obligacion, ResultadoPago, TipoObligacion } from "./types";
import {
  asegurarCargoSalida,
  borrarCargoSalidaDelPago,
  destinoDePago,
  idsVehiculoYCliente,
  upsertSalidaAutorizada,
} from "./salidas-aplicar";
import { destinoLibre, destinoPorNombre, partirMontoInterior, type DestinoInterior } from "./salidas-interior";
import { CARGO_DE_CONCEPTO, cubetaDeConcepto } from "./rubros-pago";
import { quitarCierreSiLaLetraQuedoCubierta } from "./cierre-semana";

export const PRIORIDAD: Record<TipoObligacion, number> = {
  salida_interior: 5,
  recargo: 8,
  acuerdo: 12,
  cierre_semana: 15,
  saldo_anterior: 20,
  cuenta_diaria: 30,
  domingo: 6,
  mantenimiento: 41,
  panapass: 42,
  exceso_km: 44,
  ajuste: 45,
  recogida: 46,
};

const ETIQUETA: Record<TipoObligacion, string> = {
  salida_interior: "salida al interior",
  acuerdo: "arreglo",
  saldo_anterior: "saldo anterior",
  recargo: "recargo",
  cuenta_diaria: "cuota de hoy",
  domingo: "domingo",
  mantenimiento: "mantenimiento",
  panapass: "panapass",
  cierre_semana: "Recargo Cierre semana",
  exceso_km: "exceso de kilometraje",
  ajuste: "ajuste",
  recogida: "recogida de vehículo",
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function diaSiguiente(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + n));
  return dt.toISOString().slice(0, 10);
}

/** Sobrante: días siguientes, cada uno acuerdo y luego letra, hasta que se acabe. */
function adelantarDias(opts: {
  sobrante: number;
  acuerdos: AcuerdoActivo[];
  letra: number;
  desde: string;
}): { asignaciones: AsignacionPago[]; sobrante: number; aplicado: number } {
  let queda = r2(opts.sobrante);
  const saldos = new Map(opts.acuerdos.map((a) => [a.id, Math.max(Number(a.saldo) || 0, 0)]));
  const asignaciones: AsignacionPago[] = [];
  let aplicado = 0;
  for (let i = 1; i <= 14 && queda > 0.009; i++) {
    const fecha = diaSiguiente(opts.desde, i);
    const vivo = opts.acuerdos.find((a) => (saldos.get(a.id) ?? 0) > 0.009);
    if (vivo) {
      const a = vivo;
      const cupo = Math.min(cuotaAcuerdoHoy(a, fecha), saldos.get(a.id) ?? 0, queda);
      if (cupo > 0.009) {
        const toma = r2(cupo);
        asignaciones.push({
          tipo: "acuerdo",
          aplicado: toma,
          ref: a.id,
          etiqueta: `acuerdo ${fecha}`,
        });
        saldos.set(a.id, r2((saldos.get(a.id) ?? 0) - toma));
        queda = r2(queda - toma);
        aplicado = r2(aplicado + toma);
      }
    }
    if (opts.letra > 0.009 && queda > 0.009) {
      const toma = r2(Math.min(opts.letra, queda));
      asignaciones.push({ tipo: "cuenta_diaria", aplicado: toma, etiqueta: `letra ${fecha}` });
      queda = r2(queda - toma);
      aplicado = r2(aplicado + toma);
    }
  }
  return { asignaciones, sobrante: queda, aplicado };
}

/** Excedente de un domingo, después de la tajada y de lo que ya está vencido.
 *  Rubro domingo: el balde, hasta donde quede. Si no, el saldo del acuerdo.
 *  Lo que aún sobre: letras siguientes, sin abrir otra tajada. */
export function partirSobranteDomingo(opts: {
  sobrante: number;
  ya: AsignacionPago[];
  acuerdos: AcuerdoActivo[];
  letra: number;
  desde: string;
  bucketNeto: number;
  adelantarDomingo: boolean;
}): { asignaciones: AsignacionPago[]; sobrante: number; aplicado: number } {
  let queda = r2(opts.sobrante);
  const extra: AsignacionPago[] = [];
  let aplicado = 0;
  const tomar = (asig: AsignacionPago) => {
    extra.push(asig);
    queda = r2(queda - asig.aplicado);
    aplicado = r2(aplicado + asig.aplicado);
  };

  if (opts.adelantarDomingo && queda > 0.009) {
    const yaDom = yaAplicado([...opts.ya, ...extra], "domingo");
    const cupo = r2(Math.max(opts.bucketNeto - yaDom, 0));
    const toma = r2(Math.min(queda, cupo));
    if (toma > 0.009) {
      tomar({ tipo: "domingo", aplicado: toma, etiqueta: ETIQUETA.domingo });
    }
  }

  if (queda > 0.009) {
    const todas = [...opts.ya, ...extra];
    for (const a of opts.acuerdos) {
      if (queda <= 0.009) break;
      const cupo = r2(Math.max((Number(a.saldo) || 0) - yaAplicado(todas, "acuerdo", a.id), 0));
      const toma = r2(Math.min(queda, cupo));
      if (toma <= 0.009) continue;
      tomar({
        tipo: "acuerdo",
        aplicado: toma,
        ref: a.id,
        etiqueta: a.descripcion?.trim() || "acuerdo",
      });
    }
  }

  if (queda > 0.009 && opts.letra > 0.009) {
    const adelanto = adelantarDias({
      sobrante: queda,
      acuerdos: [],
      letra: opts.letra,
      desde: opts.desde,
    });
    extra.push(...adelanto.asignaciones);
    aplicado = r2(aplicado + adelanto.aplicado);
    queda = adelanto.sobrante;
  }

  return { asignaciones: extra, sobrante: queda, aplicado };
}

/**
 * El recargo cargado vive dentro del saldo de la letra. Al partir el pago se
 * saca de ahí: la línea de recargo va primero y la letra no se paga dos veces.
 * `yaFueraDeLaLetra` es la multa de hoy que el estado de cuenta ya restó.
 */
export function partirRecargoDeLaLetra(opts: {
  pendienteAnterior: number;
  cuotaHoy: number;
  recargoAbierto: number;
  yaFueraDeLaLetra?: number;
}): { pendienteAnterior: number; cuotaHoy: number; recargoHoy: number } {
  const recargoHoy = r2(Math.max(Number(opts.recargoAbierto) || 0, 0));
  const yaFuera = r2(Math.min(Math.max(Number(opts.yaFueraDeLaLetra) || 0, 0), recargoHoy));
  let dentro = r2(recargoHoy - yaFuera);
  let pendiente = r2(Math.max(Number(opts.pendienteAnterior) || 0, 0));
  let cuota = r2(Math.max(Number(opts.cuotaHoy) || 0, 0));
  const tomaPend = r2(Math.min(pendiente, dentro));
  pendiente = r2(pendiente - tomaPend);
  dentro = r2(dentro - tomaPend);
  const tomaCuota = r2(Math.min(cuota, dentro));
  cuota = r2(cuota - tomaCuota);
  return { pendienteAnterior: pendiente, cuotaHoy: cuota, recargoHoy };
}

/**
 * El Recargo Cierre semana vive dentro del saldo, pero no es letra atrasada.
 * Se saca de ahí y se cobra después del acuerdo y antes de las letras atrasadas.
 * Solo entra lo que todavía cabe en el saldo: un cargo ya cubierto no se vuelve a pedir.
 */
export function partirCierreDeLaLetra(opts: {
  pendienteAnterior: number;
  cierreAbierto: number;
}): { pendienteAnterior: number; cierreHoy: number } {
  const abierto = r2(Math.max(Number(opts.cierreAbierto) || 0, 0));
  const pendiente = r2(Math.max(Number(opts.pendienteAnterior) || 0, 0));
  const cierreHoy = r2(Math.min(pendiente, abierto));
  return { pendienteAnterior: r2(pendiente - cierreHoy), cierreHoy };
}

function yaAplicado(ya: AsignacionPago[], tipo: TipoObligacion, ref?: string): number {
  return r2(
    ya
      .filter((a) => a.tipo === tipo && (ref ? a.ref === ref : true))
      .reduce((s, a) => s + a.aplicado, 0),
  );
}

/** Lo que todavía falta, descontando abonos de hoy que ya se partieron. */
export function obligacionesRestantes(
  base: {
    acuerdos: { id: string; monto: number; etiqueta?: string }[];
    pendienteAnterior: number;
    recargoHoy: number;
    cierreHoy?: number;
    cuotaHoy: number;
    domingoHoy?: number;
  },
  ya: AsignacionPago[],
): Obligacion[] {
  const out: Obligacion[] = [];
  for (const a of base.acuerdos) {
    const monto = r2(Math.max(a.monto - yaAplicado(ya, "acuerdo", a.id), 0));
    if (monto > 0.009) {
      out.push({
        tipo: "acuerdo",
        prioridad: PRIORIDAD.acuerdo,
        monto,
        ref: a.id,
        etiqueta: a.etiqueta ?? ETIQUETA.acuerdo,
      });
    }
  }
  const cierre = r2(Math.max((base.cierreHoy ?? 0) - yaAplicado(ya, "cierre_semana"), 0));
  if (cierre > 0.009) {
    out.push({
      tipo: "cierre_semana",
      prioridad: PRIORIDAD.cierre_semana,
      monto: cierre,
      etiqueta: ETIQUETA.cierre_semana,
    });
  }
  const pend = r2(Math.max(base.pendienteAnterior - yaAplicado(ya, "saldo_anterior"), 0));
  if (pend > 0.009) {
    out.push({ tipo: "saldo_anterior", prioridad: PRIORIDAD.saldo_anterior, monto: pend, etiqueta: ETIQUETA.saldo_anterior });
  }
  const rec = r2(Math.max(base.recargoHoy - yaAplicado(ya, "recargo"), 0));
  if (rec > 0.009) {
    out.push({ tipo: "recargo", prioridad: PRIORIDAD.recargo, monto: rec, etiqueta: ETIQUETA.recargo });
  }
  const cuota = r2(Math.max(base.cuotaHoy - yaAplicado(ya, "cuenta_diaria"), 0));
  if (cuota > 0.009) {
    out.push({ tipo: "cuenta_diaria", prioridad: PRIORIDAD.cuenta_diaria, monto: cuota, etiqueta: ETIQUETA.cuenta_diaria });
  }
  const dom = r2(Math.max((base.domingoHoy ?? 0) - yaAplicado(ya, "domingo"), 0));
  if (dom > 0.009) {
    out.push({
      tipo: "domingo",
      prioridad: PRIORIDAD.domingo,
      monto: dom,
      etiqueta: ETIQUETA.domingo,
    });
  }
  return out;
}

export function textoComoSeAplico(r: ResultadoPago, money: (n: number) => string): string {
  if (r.asignaciones.length === 0) {
    return r.sobrante > 0.009
      ? `El pago de ${money(r.sobrante)} quedó a favor; no había deudas abiertas.`
      : "No había deudas abiertas a las que aplicar el pago.";
  }
  const partes = r.asignaciones.map((a) => {
    const nombre = a.etiqueta ?? ETIQUETA[a.tipo];
    const prep = /^(cuota|cuenta|salida)\b/i.test(nombre) ? "a la" : "al";
    return `${money(a.aplicado)} ${prep} ${nombre}`;
  });
  let s = `Se aplicó así: ${partes.join(", ")}.`;
  if (r.sobrante > 0.009) s += ` Quedaron ${money(r.sobrante)} a favor.`;
  return s;
}

type PagoRow = {
  id: string;
  contrato_id: string | null;
  cliente_id?: string | null;
  monto: number;
  pagado_at: string;
  estado_conciliacion: string;
  asignaciones: ResultadoPago | AsignacionPago[] | null;
  notas: string | null;
  rubro?: string | null;
  destino_interior?: string | null;
};

function destinoDesdePago(p: PagoRow): DestinoInterior | null {
  const d = destinoDePago(p.destino_interior);
  if (d) return d;
  const m = /RUBRO:\s*salida_interior\s+(.+?)\s+\$/i.exec(p.notas ?? "");
  if (m?.[1]) return destinoPorNombre(m[1].trim()) ?? destinoLibre(m[1].trim(), Number(p.monto) || 0);
  if (p.rubro === "salida_interior" || p.destino_interior === "otro") {
    return destinoLibre("Otro destino", Number(p.monto) || 0);
  }
  return null;
}

function parseAsignaciones(raw: unknown): ResultadoPago | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as ResultadoPago;
  if (Array.isArray(o.asignaciones)) return o;
  if (Array.isArray(raw)) {
    const asignaciones = raw as AsignacionPago[];
    const totalAplicado = r2(asignaciones.reduce((s, a) => s + a.aplicado, 0));
    return { asignaciones, sobrante: 0, totalAplicado };
  }
  return null;
}

/**
 * El acuerdo vive FUERA de la letra: el pago baja el ledger entero, así que
 * hay que poner un cargo `tipo=acuerdo` por la misma plata para que la letra
 * no se coma lo del arreglo.
 */
export async function asegurarCargosAcuerdoDelPago(opts: {
  contratoId: string;
  pagoId: string;
  fecha: string;
  asignaciones: AsignacionPago[];
}): Promise<void> {
  const sb = createServerSupabase();
  const lineas = opts.asignaciones.filter(
    (a) => a.tipo === "acuerdo" && (Number(a.aplicado) || 0) > 0.009,
  );
  if (lineas.length === 0) {
    await borrarCargosAcuerdoDelPago(opts.pagoId);
    return;
  }

  const { data: ya } = await sb
    .from("cargos")
    .select("id, acuerdo_id, monto")
    .eq("pago_id", opts.pagoId)
    .eq("tipo", "acuerdo");
  const existentes = (ya ?? []) as { id: string; acuerdo_id: string | null; monto: number }[];

  // Si ya hay cargos por el mismo total, no duplicar.
  const sumaYa = r2(existentes.reduce((s, c) => s + (Number(c.monto) || 0), 0));
  const sumaNueva = r2(lineas.reduce((s, a) => s + (Number(a.aplicado) || 0), 0));
  if (existentes.length > 0 && Math.abs(sumaYa - sumaNueva) < 0.05) return;

  if (existentes.length > 0) {
    await borrarCargosAcuerdoDelPago(opts.pagoId);
  }

  for (const a of lineas) {
    const fila: Record<string, unknown> = {
      contrato_id: opts.contratoId,
      fecha: opts.fecha,
      tipo: "acuerdo",
      concepto: a.etiqueta?.trim() || "Abono a arreglo",
      monto: r2(Number(a.aplicado) || 0),
      pago_id: opts.pagoId,
      acuerdo_id: a.ref ?? null,
    };
    const { error } = await sb.from("cargos").insert(fila);
    if (error && /pago_id|acuerdo_id|concepto_codigo/i.test(error.message)) {
      delete fila.pago_id;
      delete fila.acuerdo_id;
      const retry = await sb.from("cargos").insert(fila);
      if (retry.error) {
        console.error("[aplicar-pago] cargo acuerdo:", retry.error.message);
      }
    } else if (error) {
      console.error("[aplicar-pago] cargo acuerdo:", error.message);
    }
  }
}

function esAsignacionCierre(a: AsignacionPago): boolean {
  if (a.tipo === "cierre_semana") return true;
  return /cierre(\s+de)?\s+semana/i.test(a.etiqueta ?? "");
}

function esAsignacionRecargo(a: AsignacionPago): boolean {
  if (esAsignacionCierre(a)) return false;
  if (a.tipo === "recargo") return true;
  return /recargo|por no pagar/i.test(a.etiqueta ?? "");
}

function esCargoRecargo(c: {
  tipo: string;
  concepto: string | null;
  concepto_codigo: string | null;
}): boolean {
  const codigo = (c.concepto_codigo ?? "").toUpperCase();
  if (codigo === "CIERRE_SEMANA" || /cierre(\s+de)?\s+semana/i.test(c.concepto ?? "")) return false;
  if (codigo === "PAGO_TARDE") return true;
  return c.tipo === "multa" && /recargo|por no pagar|pago despu[eé]s/i.test(c.concepto ?? "");
}

/** Multas de recargo que ningún pago marcó todavía como recargo. */
async function recargoAbiertoDelContrato(contratoId: string, excluirPagoId: string): Promise<number> {
  const sb = createServerSupabase();
  const [{ data: cargos }, { data: pagos }] = await Promise.all([
    sb
      .from("cargos")
      .select("monto, tipo, concepto, concepto_codigo, pago_id")
      .eq("contrato_id", contratoId)
      .eq("tipo", "multa"),
    sb
      .from("pagos")
      .select("id, monto, rubro, asignaciones")
      .eq("contrato_id", contratoId)
      .in("estado_conciliacion", ["conciliado", "manual"])
      .neq("id", excluirPagoId),
  ]);
  let abierto = 0;
  for (const c of (cargos ?? []) as {
    monto: number;
    tipo: string;
    concepto: string | null;
    concepto_codigo: string | null;
    pago_id: string | null;
  }[]) {
    if (c.pago_id) continue;
    if (!esCargoRecargo(c)) continue;
    abierto = r2(abierto + (Number(c.monto) || 0));
  }
  if (abierto <= 0.009) return 0;
  for (const p of (pagos ?? []) as {
    monto: number;
    rubro: string | null;
    asignaciones: unknown;
  }[]) {
    const parsed = parseAsignaciones(p.asignaciones);
    const marcado = parsed
      ? r2(parsed.asignaciones.filter(esAsignacionRecargo).reduce((s, a) => s + (Number(a.aplicado) || 0), 0))
      : 0;
    const abono = marcado > 0.009 ? marcado : (p.rubro ?? "").toLowerCase() === "recargo" ? Number(p.monto) || 0 : 0;
    if (abono <= 0.009) continue;
    abierto = r2(Math.max(abierto - abono, 0));
  }
  return abierto;
}

/** Recargo Cierre semana que ningún pago marcó todavía como ese concepto. */
async function cierreAbiertoDelContrato(contratoId: string, excluirPagoId: string): Promise<number> {
  const sb = createServerSupabase();
  const [{ data: cargos }, { data: pagos }] = await Promise.all([
    sb
      .from("cargos")
      .select("monto, concepto_codigo, pago_id")
      .eq("contrato_id", contratoId)
      .eq("concepto_codigo", "CIERRE_SEMANA"),
    sb
      .from("pagos")
      .select("id, monto, rubro, asignaciones")
      .eq("contrato_id", contratoId)
      .in("estado_conciliacion", ["conciliado", "manual"])
      .neq("id", excluirPagoId),
  ]);
  let abierto = 0;
  for (const c of (cargos ?? []) as { monto: number; pago_id: string | null }[]) {
    if (c.pago_id) continue;
    abierto = r2(abierto + (Number(c.monto) || 0));
  }
  if (abierto <= 0.009) return 0;
  for (const p of (pagos ?? []) as { monto: number; rubro: string | null; asignaciones: unknown }[]) {
    const parsed = parseAsignaciones(p.asignaciones);
    const marcado = parsed
      ? r2(parsed.asignaciones.filter(esAsignacionCierre).reduce((s, a) => s + (Number(a.aplicado) || 0), 0))
      : 0;
    const abono = marcado > 0.009 ? marcado : (p.rubro ?? "") === "cierre_semana" ? Number(p.monto) || 0 : 0;
    if (abono <= 0.009) continue;
    abierto = r2(Math.max(abierto - abono, 0));
  }
  return abierto;
}

/**
 * El recargo vive fuera de la letra, igual que el acuerdo: el pago baja el
 * saldo único. Si el equipo asigna una parte a recargo y no hay cargo que
 * la cubra, se carga esa diferencia para que no se descuente de la letra.
 * Si el cargo ya existe (lo cargó el equipo), no se duplica.
 */
export async function asegurarCargoRecargoDelPago(opts: {
  contratoId: string;
  pagoId: string;
  fecha: string;
  asignaciones: AsignacionPago[];
}): Promise<void> {
  const sb = createServerSupabase();
  const monto = r2(
    opts.asignaciones
      .filter(esAsignacionRecargo)
      .reduce((s, a) => s + (Number(a.aplicado) || 0), 0),
  );

  const { data: cargos } = await sb
    .from("cargos")
    .select("id, monto, tipo, concepto, concepto_codigo, pago_id")
    .eq("contrato_id", opts.contratoId);
  const recargos = ((cargos ?? []) as {
    id: string;
    monto: number;
    tipo: string;
    concepto: string | null;
    concepto_codigo: string | null;
    pago_id: string | null;
  }[]).filter(esCargoRecargo);
  const propios = recargos.filter((c) => c.pago_id === opts.pagoId);
  const ajenos = r2(
    recargos
      .filter((c) => c.pago_id !== opts.pagoId)
      .reduce((s, c) => s + (Number(c.monto) || 0), 0),
  );

  const { data: otros } = await sb
    .from("pagos")
    .select("id, asignaciones")
    .eq("contrato_id", opts.contratoId)
    .in("estado_conciliacion", ["conciliado", "manual"])
    .neq("id", opts.pagoId);
  let otrosAbonos = 0;
  for (const p of (otros ?? []) as { asignaciones: unknown }[]) {
    const parsed = parseAsignaciones(p.asignaciones);
    if (!parsed) continue;
    for (const a of parsed.asignaciones) {
      if (esAsignacionRecargo(a)) otrosAbonos += Number(a.aplicado) || 0;
    }
  }
  const libre = r2(Math.max(ajenos - r2(otrosAbonos), 0));
  const falta = r2(Math.max(monto - libre, 0));
  const sumaPropia = r2(propios.reduce((s, c) => s + (Number(c.monto) || 0), 0));
  if (Math.abs(sumaPropia - falta) < 0.05 && (falta > 0.009) === (propios.length > 0)) return;

  if (propios.length > 0) {
    await sb.from("cargos").delete().in("id", propios.map((c) => c.id));
  }
  if (falta <= 0.009) return;

  const fila: Record<string, unknown> = {
    contrato_id: opts.contratoId,
    fecha: opts.fecha,
    tipo: "multa",
    concepto: "Recargo",
    concepto_codigo: "PAGO_TARDE",
    monto: falta,
    pago_id: opts.pagoId,
  };
  const { error } = await sb.from("cargos").insert(fila);
  if (error && /pago_id|concepto_codigo/i.test(error.message)) {
    delete fila.pago_id;
    delete fila.concepto_codigo;
    const retry = await sb.from("cargos").insert(fila);
    if (retry.error) console.error("[aplicar-pago] cargo recargo:", retry.error.message);
  } else if (error) {
    console.error("[aplicar-pago] cargo recargo:", error.message);
  }
}

/**
 * Domingo, mantenimiento y el resto de conceptos viven fuera de la letra.
 * Si el equipo asigna plata a uno y no hay cargo pendiente que la cubra,
 * se carga la diferencia. Si el cargo ya estaba, no se duplica.
 */
export async function asegurarCargosConceptoDelPago(opts: {
  contratoId: string;
  pagoId: string;
  fecha: string;
  asignaciones: AsignacionPago[];
}): Promise<void> {
  const sb = createServerSupabase();
  const pedidos = new Map<string, number>();
  for (const a of opts.asignaciones) {
    const cubeta = cubetaDeConcepto(a.tipo, a.etiqueta);
    if (!cubeta || cubeta === "por no pagar" || !CARGO_DE_CONCEPTO[a.tipo]) continue;
    pedidos.set(cubeta, r2((pedidos.get(cubeta) ?? 0) + (Number(a.aplicado) || 0)));
  }

  const { data: cargos } = await sb
    .from("cargos")
    .select("id, monto, tipo, concepto, concepto_codigo, pago_id")
    .eq("contrato_id", opts.contratoId);
  const filas = (cargos ?? []) as {
    id: string;
    monto: number;
    tipo: string;
    concepto: string | null;
    concepto_codigo: string | null;
    pago_id: string | null;
  }[];

  const { data: otros } = await sb
    .from("pagos")
    .select("id, asignaciones")
    .eq("contrato_id", opts.contratoId)
    .in("estado_conciliacion", ["conciliado", "manual"])
    .neq("id", opts.pagoId);
  const abonoAjeno = new Map<string, number>();
  for (const p of (otros ?? []) as { asignaciones: unknown }[]) {
    const parsed = parseAsignaciones(p.asignaciones);
    if (!parsed) continue;
    for (const a of parsed.asignaciones) {
      const cubeta = cubetaDeConcepto(a.tipo, a.etiqueta);
      if (!cubeta || cubeta === "por no pagar") continue;
      abonoAjeno.set(cubeta, r2((abonoAjeno.get(cubeta) ?? 0) + (Number(a.aplicado) || 0)));
    }
  }

  const cubetas = new Set<string>([
    ...pedidos.keys(),
    ...filas
      .filter((c) => c.pago_id === opts.pagoId)
      .map((c) => cubetaDeCargoFila(c))
      .filter((c): c is string => Boolean(c) && c !== "por no pagar"),
  ]);

  for (const cubeta of cubetas) {
    const spec = Object.entries(CARGO_DE_CONCEPTO).find(
      ([tipo]) => cubetaDeConcepto(tipo, ETIQUETA[tipo as TipoObligacion]) === cubeta,
    )?.[1];
    if (!spec) continue;
    const monto = pedidos.get(cubeta) ?? 0;
    const deCubeta = filas.filter((c) => cubetaDeCargoFila(c) === cubeta);
    const propios = deCubeta.filter((c) => c.pago_id === opts.pagoId);
    const ajenos = r2(
      deCubeta
        .filter((c) => c.pago_id !== opts.pagoId)
        .reduce((s, c) => s + (Number(c.monto) || 0), 0),
    );
    const libre = r2(Math.max(ajenos - (abonoAjeno.get(cubeta) ?? 0), 0));
    const falta = r2(Math.max(monto - libre, 0));
    const sumaPropia = r2(propios.reduce((s, c) => s + (Number(c.monto) || 0), 0));
    if (Math.abs(sumaPropia - falta) < 0.05 && (falta > 0.009) === (propios.length > 0)) continue;
    if (propios.length > 0) {
      await sb.from("cargos").delete().in("id", propios.map((c) => c.id));
    }
    if (falta <= 0.009) continue;
    const fila: Record<string, unknown> = {
      contrato_id: opts.contratoId,
      fecha: opts.fecha,
      tipo: spec.tipo,
      concepto: spec.concepto,
      monto: falta,
      pago_id: opts.pagoId,
    };
    if (spec.codigo) fila.concepto_codigo = spec.codigo;
    const { error } = await sb.from("cargos").insert(fila);
    if (error && /pago_id|concepto_codigo/i.test(error.message)) {
      delete fila.pago_id;
      delete fila.concepto_codigo;
      const retry = await sb.from("cargos").insert(fila);
      if (retry.error) console.error("[aplicar-pago] cargo concepto:", retry.error.message);
    } else if (error) {
      console.error("[aplicar-pago] cargo concepto:", error.message);
    }
  }
}

function cubetaDeCargoFila(c: {
  tipo: string;
  concepto: string | null;
  concepto_codigo: string | null;
}): string | null {
  const codigo = (c.concepto_codigo ?? "").toUpperCase();
  if (codigo === "DOMINGOS" || /\bdomingo\b/i.test(c.concepto ?? "")) return "domingo";
  if (codigo === "124" || /manten/i.test(c.concepto ?? "")) return "mantenimiento";
  if (codigo === "PANAPASS" || c.tipo === "panapass" || /panapass/i.test(c.concepto ?? "")) return "panapass";
  if (codigo === "CIERRE_SEMANA" || /cierre(\s+de)?\s+semana/i.test(c.concepto ?? "")) return "cierre de semana";
  if (codigo === "122" || (/exceso/i.test(c.concepto ?? "") && /km|kilom/i.test(c.concepto ?? ""))) {
    return "exceso de kilometraje";
  }
  if (c.tipo === "ajuste" || /negociaci[oó]n|^ajuste\b/i.test(c.concepto ?? "")) return "ajuste";
  if (codigo === "RECOGIDA" || /recogida/i.test(c.concepto ?? "")) return "recogida de vehículo";
  return null;
}

export async function borrarCargosAcuerdoDelPago(pagoId: string): Promise<void> {
  if (!pagoId) return;
  const sb = createServerSupabase();
  await sb.from("cargos").delete().eq("pago_id", pagoId).eq("tipo", "acuerdo");
}

async function asignacionesDeHoy(
  contratoId: string,
  fecha: string,
  excluirPagoId: string,
): Promise<AsignacionPago[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("id, asignaciones, fecha, pagado_at")
    .eq("contrato_id", contratoId)
    .in("estado_conciliacion", ["conciliado", "manual"])
    .neq("id", excluirPagoId);
  const out: AsignacionPago[] = [];
  for (const p of (data ?? []) as { id: string; asignaciones: unknown; fecha: string; pagado_at: string }[]) {
    const dia = p.fecha || fechaContable(p.pagado_at);
    if (dia !== fecha) continue;
    const parsed = parseAsignaciones(p.asignaciones);
    if (parsed) out.push(...parsed.asignaciones);
  }
  return out;
}

function abonoDomingoMarcado(p: {
  monto: number;
  rubro?: string | null;
  asignaciones?: unknown;
}): number {
  const raw = p.asignaciones as
    | { asignaciones?: { etiqueta?: string; tipo?: string; aplicado?: number }[] }
    | { etiqueta?: string; tipo?: string; aplicado?: number }[]
    | null
    | undefined;
  const lineas = Array.isArray(raw) ? raw : (raw?.asignaciones ?? []);
  const marcado = lineas
    .filter((a) => a.tipo === "domingo" || /domingo/i.test(a.etiqueta ?? ""))
    .reduce((s, a) => s + (Number(a.aplicado) || 0), 0);
  if (marcado > 0.009) return Math.round(marcado * 100) / 100;
  if (p.rubro === "domingo") return Math.max(Number(p.monto) || 0, 0);
  return 0;
}

/** Tajada que todavía falta, antes de este pago.
 *  Domingo: la del día, tope una cuota, sobre el balde.
 *  Lun–sáb: la del domingo pasado, si sigue sin pagar. El resto del balde
 *  es el próximo domingo y no entra. */
async function tajadaDomingoAbierta(
  contratoId: string,
  fecha: string,
  excluirPagoId: string,
  cuota: number,
): Promise<{ tajada: number; bucketNeto: number }> {
  const sb = createServerSupabase();
  const hoyEsDom = esDomingo(fecha);
  const ciclo = domingoDelCiclo(fecha);
  const { desde: desdeHoy, hasta: hastaHoy } = rangoDiaPanama(fecha);
  const { desde: desdeCiclo } = rangoDiaPanama(ciclo);
  const [{ data: cargos }, { data: pagos }] = await Promise.all([
    sb.from("cargos").select("monto, fecha, concepto, concepto_codigo").eq("contrato_id", contratoId),
    sb
      .from("pagos")
      .select("id, monto, rubro, asignaciones, pagado_at")
      .eq("contrato_id", contratoId)
      .in("estado_conciliacion", ["conciliado", "manual"]),
  ]);
  let bucket = 0;
  let alCorte = 0;
  for (const c of (cargos ?? []) as {
    monto: number;
    fecha: string | null;
    concepto: string | null;
    concepto_codigo: string | null;
  }[]) {
    const codigo = (c.concepto_codigo ?? "").toUpperCase();
    if (codigo !== "DOMINGOS" && !/\bdomingo\b/i.test(c.concepto ?? "")) continue;
    const monto = Number(c.monto) || 0;
    bucket += monto;
    if (!c.fecha || c.fecha <= ciclo) alCorte += monto;
  }
  let pagadoHoy = 0;
  let pagadoCiclo = 0;
  let pagadoTotal = 0;
  for (const p of (pagos ?? []) as {
    id: string;
    monto: number;
    rubro?: string | null;
    asignaciones?: unknown;
    pagado_at: string;
  }[]) {
    if (p.id === excluirPagoId) continue;
    const abono = abonoDomingoMarcado(p);
    if (abono <= 0.009) continue;
    pagadoTotal += abono;
    const t = new Date(p.pagado_at).getTime();
    if (t >= desdeHoy.getTime() && t < hastaHoy.getTime()) pagadoHoy += abono;
    if (t >= desdeCiclo.getTime() && t < hastaHoy.getTime()) pagadoCiclo += abono;
  }
  const neto = Math.max(Math.round((bucket - pagadoTotal) * 100) / 100, 0);
  const netoCorte = Math.max(Math.round((alCorte - pagadoTotal) * 100) / 100, 0);
  return {
    bucketNeto: neto,
    tajada: tajadaDomingoQueFalta({
      bucketNeto: hoyEsDom ? neto : netoCorte,
      pagadoHoy: Math.round((hoyEsDom ? pagadoHoy : pagadoCiclo) * 100) / 100,
      cuota,
    }),
  };
}

/**
 * Parte un pago que YA cuenta (conciliado o manual) y baja el saldo del arreglo.
 * Idempotente: si ya tiene `asignaciones`, no vuelve a tocar los acuerdos.
 */
export async function aplicarPagoEnObligaciones(pagoId: string): Promise<ResultadoPago | null> {
  if (!pagoId) return null;
  const sb = createServerSupabase();
  let q = await sb
    .from("pagos")
    .select("id, contrato_id, cliente_id, monto, pagado_at, estado_conciliacion, asignaciones, notas, rubro, destino_interior")
    .eq("id", pagoId)
    .maybeSingle();
  if (q.error && /rubro|destino_interior/i.test(q.error.message)) {
    q = await sb
      .from("pagos")
      .select("id, contrato_id, cliente_id, monto, pagado_at, estado_conciliacion, asignaciones, notas")
      .eq("id", pagoId)
      .maybeSingle();
  }
  if (q.error || !q.data) return null;
  const pago = q.data as PagoRow;
  if (!pago.contrato_id) return null;
  if (pago.estado_conciliacion !== "conciliado" && pago.estado_conciliacion !== "manual") {
    return null;
  }

  const dest = destinoDesdePago(pago);
  const ya = parseAsignaciones(pago.asignaciones);
  if (ya) {
    await asegurarCargosAcuerdoDelPago({
      contratoId: pago.contrato_id,
      pagoId,
      fecha: fechaContable(pago.pagado_at),
      asignaciones: ya.asignaciones,
    });
    if (dest) {
      const interior = ya.asignaciones
        .filter((a) => a.tipo === "salida_interior")
        .reduce((s, a) => s + a.aplicado, 0);
      if (interior > 0.009) {
        const ids = await idsVehiculoYCliente(pago.contrato_id);
        await asegurarCargoSalida({
          contratoId: pago.contrato_id,
          pagoId,
          dest,
          monto: interior,
          fecha: fechaContable(pago.pagado_at),
        });
        await upsertSalidaAutorizada({
          contratoId: pago.contrato_id,
          vehiculoId: ids.vehiculoId,
          clienteId: pago.cliente_id ?? ids.clienteId,
          pagoId,
          dest,
          monto: interior,
          fecha: fechaContable(pago.pagado_at),
          estado: "autorizada",
          avalPor: pago.estado_conciliacion === "manual" ? "oficina" : "banco",
        });
      }
    }
    await quitarCierreSiLaLetraQuedoCubierta(pago.contrato_id);
    return ya;
  }

  const fecha = fechaContable(pago.pagado_at);
  const contratoId = pago.contrato_id;
  const monto = Number(pago.monto) || 0;

  let acuerdosData: unknown[] | null = null;
  {
    const full = await sb
      .from("acuerdos")
      .select("id, saldo, cuota_diaria, cuota_domingo, descripcion, frecuencia, fecha_especifica")
      .eq("contrato_id", contratoId)
      .eq("activo", true)
      .order("created_at", { ascending: true });
    if (full.error && /frecuencia|fecha_especifica/i.test(full.error.message)) {
      const retry = await sb
        .from("acuerdos")
        .select("id, saldo, cuota_diaria, cuota_domingo, descripcion")
        .eq("contrato_id", contratoId)
        .eq("activo", true);
      acuerdosData = retry.data as unknown[] | null;
    } else {
      acuerdosData = full.data as unknown[] | null;
    }
  }

  const [contratoRes, saldoRes, multaRes, rentaRes, otras, pagado, extrasNoLetra] = await Promise.all([
    sb.from("contratos")
      .select("letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo, vehiculo_id, fecha_inicio_letra")
      .eq("id", contratoId)
      .maybeSingle(),
    sb.from("vw_saldo_contrato").select("saldo_actual").eq("contrato_id", contratoId).maybeSingle(),
    sb.from("cargos").select("id").eq("contrato_id", contratoId).eq("fecha", fecha)
      .eq("tipo", "multa").eq("concepto_codigo", "PAGO_TARDE").limit(1),
    sb.from("cargos").select("id").eq("contrato_id", contratoId).eq("fecha", fecha)
      .eq("tipo", "renta").limit(1),
    asignacionesDeHoy(contratoId, fecha, pagoId),
    pagoHoyContrato(contratoId, fecha),
    cargosExtraPorContrato([contratoId], fecha).then((m) => partirCargosNoLetra(m.get(contratoId) ?? [])),
  ]);

  const contratoRow = contratoRes.data as (TerminosCuota & {
    vehiculo_id?: string | null;
    fecha_inicio_letra?: string | null;
  }) | null;
  const terminos = contratoRow;
  if (!terminos) return null;
  const [pausa, devolucion, inactivacion] = await Promise.all([
    pausaDeVehiculo(contratoRow?.vehiculo_id),
    devolucionDeVehiculo(contratoRow?.vehiculo_id),
    inactivacionDeVehiculo(contratoRow?.vehiculo_id),
  ]);
  const enPausa = pausaVigente(pausa, fecha);
  const devuelto = devolucionVigente(devolucion, fecha);
  const inactivo = inactivacionVigente(inactivacion, fecha);
  const iniLetra = contratoRow?.fecha_inicio_letra?.trim() ?? "";
  const letraNoEmpieza = Boolean(iniLetra && fecha < iniLetra);
  const acuerdos = (acuerdosData ?? []) as AcuerdoActivo[];
  const cuotaHoy = (enPausa || devuelto || inactivo || letraNoEmpieza) && !esDomingo(fecha)
    ? 0
    : cuotaDeFecha(terminos, fecha);
  const multaHoy = (multaRes.data?.length ?? 0) > 0;
  const hoyYaDevengado = (rentaRes.data?.length ?? 0) > 0;
  const saldoVista = Number((saldoRes.data as { saldo_actual: number } | null)?.saldo_actual ?? 0);
  const saldoAntes = saldoVista + monto;
  const pagadoHoyAntes = Math.max((pagado.pagado ?? 0) - monto, 0);
  const estePuntual = esPagoPuntual(pago.pagado_at, fecha);
  const pagadoPuntualAntes = Math.max((pagado.pagadoPuntual ?? 0) - (estePuntual ? monto : 0), 0);
  let atrasoAcuerdo = 0;
  if (!enPausa && acuerdos.length > 0) {
    const mapaAtraso = await atrasoAcuerdoPorContrato(fecha, new Map([[contratoId, acuerdos]]));
    atrasoAcuerdo = mapaAtraso.get(contratoId) ?? 0;
  }
  // Solo el plan de adelante. Recogida y los que siguen esperan a que ese saldo llegue a cero.
  const planCobro = enPausa ? null : planQueCobra(acuerdos);
  const acuerdoHoy = planCobro ? programadoAcuerdoDe(acuerdos, fecha, atrasoAcuerdo) : 0;
  let preferencia: string | null = null;
  {
    const pref = await sb.from("contratos").select("prioridad_abono").eq("id", contratoId).maybeSingle();
    if (!pref.error) {
      const v = (pref.data as { prioridad_abono?: string | null } | null)?.prioridad_abono ?? null;
      preferencia = v && v !== "menor" ? v : null;
    }
  }
  const cobraAcuerdoHoy = !preferencia || preferencia === "acuerdo";
  const hoyEsDomingo = esDomingo(fecha);
  const letraDiaria = Math.max(Number(terminos.letra_diaria) || 0, 0);
  const domingoAbierto = await tajadaDomingoAbierta(
    contratoId,
    fecha,
    pagoId,
    Number(terminos.cuota_domingo) || 0,
  );
  const domingoHoy = domingoAbierto.tajada;
  // Multa de “no pago” = solo letra; el acuerdo no entra a la meta puntual.
  const meta = cuotaHoy;
  const pagoPuntualAntes = cubrioCuotaDelDia(pagadoPuntualAntes, meta);
  const corte = fecha < hoyPanama() || pasoCorte();

  const cifras = calcularCifras({
    terminos,
    saldo: saldoAntes,
    pagoHoy: pagadoHoyAntes > 0.009,
    pagoPuntual: pagoPuntualAntes,
    pagadoHoy: pagadoHoyAntes,
    acuerdoHoy,
    faltaAcuerdo: acuerdoHoy,
    hoy: fecha,
    corte,
    multaHoyRegistrada: multaHoy,
    hoyYaDevengado,
    pendiente: false,
    diaLibre: (enPausa || devuelto || inactivo || letraNoEmpieza) && !hoyEsDomingo,
    cargosFuturos: extrasNoLetra.futuro,
    cargosExtraEnSaldo: extrasNoLetra.debido,
  });

  // Lun–sáb: recargo cargado, luego la cuota de acuerdo. Domingo: la tajada va
  // primero (prioridad 6). El recargo no sale de cifras (ahí está en $0): es
  // la multa que sigue abierta, sacada del saldo de la letra.
  const recargoAbierto = await recargoAbiertoDelContrato(contratoId, pagoId);
  // La letra del árbol es la que sigue abierta, no la tarifa entera.
  // Si ayer ya adelantaron parte, eso ya está en el saldo y no se vuelve a cobrar.
  const letraHoyNeta = r2(Math.max(
    cifras.cuenta - cifras.faltaAcuerdo - cifras.pendienteAnterior - cifras.recargo,
    0,
  ));
  const cuotaArbol = hoyEsDomingo ? 0 : Math.min(cuotaHoy, letraHoyNeta);
  const letraSinRecargo = partirRecargoDeLaLetra({
    pendienteAnterior: cifras.pendienteAnterior,
    cuotaHoy: cuotaArbol,
    recargoAbierto,
    yaFueraDeLaLetra: multaHoy ? Math.min(penalidadDe(terminos), recargoAbierto) : 0,
  });
  const cierreAbierto = await cierreAbiertoDelContrato(contratoId, pagoId);
  const letraSinCierre = partirCierreDeLaLetra({
    pendienteAnterior: letraSinRecargo.pendienteAnterior,
    cierreAbierto,
  });
  const acuerdosBase = cobraAcuerdoHoy && planCobro && acuerdoHoy > 0.009
    ? [{
        id: planCobro.id,
        monto: acuerdoHoy,
        etiqueta: planCobro.descripcion?.trim() || "arreglo",
      }]
    : [];

  const obligaciones = obligacionesRestantes(
    {
      acuerdos: acuerdosBase,
      pendienteAnterior: letraSinCierre.pendienteAnterior,
      recargoHoy: letraSinRecargo.recargoHoy,
      cierreHoy: letraSinCierre.cierreHoy,
      cuotaHoy: letraSinRecargo.cuotaHoy,
      domingoHoy,
    },
    otras,
  );

  let resultado: ResultadoPago;
  if (dest) {
    const { interior, resto } = partirMontoInterior(monto, dest.monto);
    const cola = resto > 0.009 ? distribuirPago(resto, obligaciones) : {
      asignaciones: [] as AsignacionPago[],
      sobrante: 0,
      totalAplicado: 0,
    };
    resultado = {
      asignaciones: [
        {
          tipo: "salida_interior",
          aplicado: interior,
          etiqueta: `salida a ${dest.nombre}`,
        },
        ...cola.asignaciones,
      ],
      sobrante: cola.sobrante,
      totalAplicado: r2(interior + cola.totalAplicado),
    };
  } else {
    resultado = distribuirPago(monto, obligaciones);
  }

  const rubroConcepto =
    pago.rubro === "recargo"
      ? "recargo"
      : pago.rubro && CARGO_DE_CONCEPTO[pago.rubro]
        ? pago.rubro
        : null;
  const rubroOtro = Boolean(rubroConcepto && rubroConcepto !== "domingo");
  if (hoyEsDomingo && resultado.sobrante > 0.009 && !rubroOtro) {
    const parte = partirSobranteDomingo({
      sobrante: resultado.sobrante,
      ya: resultado.asignaciones,
      acuerdos,
      letra: letraDiaria,
      desde: fecha,
      bucketNeto: domingoAbierto.bucketNeto,
      adelantarDomingo: pago.rubro === "domingo",
    });
    if (parte.aplicado > 0.009) {
      resultado = {
        asignaciones: [...resultado.asignaciones, ...parte.asignaciones],
        sobrante: parte.sobrante,
        totalAplicado: r2(resultado.totalAplicado + parte.aplicado),
      };
    }
  } else if (resultado.sobrante > 0.009 && rubroConcepto) {
    const toma = resultado.sobrante;
    resultado = {
      asignaciones: [
        ...resultado.asignaciones,
        {
          tipo: rubroConcepto as TipoObligacion,
          aplicado: toma,
          etiqueta: ETIQUETA[rubroConcepto as TipoObligacion],
        },
      ],
      sobrante: 0,
      totalAplicado: r2(resultado.totalAplicado + toma),
    };
  } else if (resultado.sobrante > 0.009 && pago.rubro === "acuerdo") {
    const plan = acuerdos.find((a) => Number(a.saldo) > 0.009);
    if (plan) {
      const ya = yaAplicado(resultado.asignaciones, "acuerdo", plan.id);
      const cupo = r2(Math.max(Number(plan.saldo) - ya, 0));
      const toma = r2(Math.min(resultado.sobrante, cupo));
      const resto = r2(resultado.sobrante - toma);
      const restantes = acuerdos.map((a) =>
        a.id === plan.id ? { ...a, saldo: r2(Number(a.saldo) - ya - toma) } : a,
      );
      const cola = resto > 0.009 && !enPausa
        ? adelantarDias({ sobrante: resto, acuerdos: restantes, letra: letraDiaria, desde: fecha })
        : { asignaciones: [] as AsignacionPago[], sobrante: enPausa ? resto : 0, aplicado: 0 };
      resultado = {
        asignaciones: [
          ...resultado.asignaciones,
          ...(toma > 0.009
            ? [{
                tipo: "acuerdo" as const,
                aplicado: toma,
                ref: plan.id,
                etiqueta: plan.descripcion?.trim() || "acuerdo",
              }]
            : []),
          ...cola.asignaciones,
        ],
        sobrante: cola.sobrante,
        totalAplicado: r2(resultado.totalAplicado + toma + cola.aplicado),
      };
    }
  } else if (
    resultado.sobrante > 0.009 &&
    diaSemana(fecha) === 6 &&
    pago.rubro !== "cuenta"
  ) {
    // Sábado sin decisión del equipo: no se asume letra ni domingo.
  } else if (resultado.sobrante > 0.009 && !enPausa) {
    const adelanto = adelantarDias({
      sobrante: resultado.sobrante,
      acuerdos,
      letra: letraDiaria,
      desde: fecha,
    });
    if (adelanto.aplicado > 0.009) {
      resultado = {
        asignaciones: [...resultado.asignaciones, ...adelanto.asignaciones],
        sobrante: adelanto.sobrante,
        totalAplicado: r2(resultado.totalAplicado + adelanto.aplicado),
      };
    }
  }

  const payload = {
    asignaciones: resultado.asignaciones,
    sobrante: resultado.sobrante,
    totalAplicado: resultado.totalAplicado,
  };

  const { error: errUp } = await sb
    .from("pagos")
    .update({ asignaciones: payload })
    .eq("id", pagoId);
  if (errUp && /asignaciones/i.test(errUp.message)) {
    const extra = `Aplicación: ${JSON.stringify(payload)}`;
    await sb
      .from("pagos")
      .update({ notas: [pago.notas, extra].filter(Boolean).join(" ") })
      .eq("id", pagoId);
  } else if (errUp) {
    console.error("[aplicar-pago] no pude guardar asignaciones", errUp.message);
    return resultado;
  }

  const abonoPorPlan = new Map<string, number>();
  for (const a of resultado.asignaciones) {
    if (a.tipo !== "acuerdo" || !a.ref) continue;
    abonoPorPlan.set(a.ref, r2((abonoPorPlan.get(a.ref) ?? 0) + a.aplicado));
  }
  for (const [ref, aplicado] of abonoPorPlan) {
    const actual = acuerdos.find((x) => x.id === ref);
    if (!actual) continue;
    const nuevo = r2(Math.max(Number(actual.saldo) - aplicado, 0));
    await sb.from("acuerdos").update({ saldo: nuevo, activo: nuevo > 0.009 }).eq("id", ref);
  }

  await asegurarCargosAcuerdoDelPago({
    contratoId,
    pagoId,
    fecha,
    asignaciones: resultado.asignaciones,
  });
  await asegurarCargoRecargoDelPago({
    contratoId,
    pagoId,
    fecha,
    asignaciones: resultado.asignaciones,
  });
  await asegurarCargosConceptoDelPago({
    contratoId,
    pagoId,
    fecha,
    asignaciones: resultado.asignaciones,
  });

  if (dest) {
    const interior = resultado.asignaciones
      .filter((a) => a.tipo === "salida_interior")
      .reduce((s, a) => s + a.aplicado, 0);
    const ids = await idsVehiculoYCliente(contratoId);
    await asegurarCargoSalida({
      contratoId,
      pagoId,
      dest,
      monto: interior,
      fecha,
    });
    await upsertSalidaAutorizada({
      contratoId,
      vehiculoId: ids.vehiculoId,
      clienteId: pago.cliente_id ?? ids.clienteId,
      pagoId,
      dest,
      monto: interior,
      fecha,
      estado: "autorizada",
      avalPor: pago.estado_conciliacion === "manual" ? "oficina" : "banco",
    });
  }

  await quitarCierreSiLaLetraQuedoCubierta(contratoId);
  return resultado;
}

/** Si se rechaza el pago, se deshace lo aplicado al arreglo. */
export async function revertirPagoEnObligaciones(pagoId: string): Promise<void> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("asignaciones")
    .eq("id", pagoId)
    .maybeSingle();
  const parsed = parseAsignaciones((data as { asignaciones: unknown } | null)?.asignaciones);
  if (!parsed) return;

  for (const a of parsed.asignaciones) {
    if (a.tipo !== "acuerdo" || !a.ref) continue;
    const { data: ac } = await sb.from("acuerdos").select("saldo").eq("id", a.ref).maybeSingle();
    const saldo = Number((ac as { saldo: number } | null)?.saldo ?? 0);
    await sb.from("acuerdos").update({ saldo: r2(saldo + a.aplicado), activo: true }).eq("id", a.ref);
  }

  await Promise.all([
    sb.from("pagos").update({ asignaciones: null, rubro: null, destino_interior: null }).eq("id", pagoId),
    borrarCargoSalidaDelPago(pagoId),
    borrarCargosAcuerdoDelPago(pagoId),
  ]);
}
