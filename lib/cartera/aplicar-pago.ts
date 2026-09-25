// Árbol de un abono (estricto):
// 1) Recargo por no pago.
// 2) Un solo concepto más (acuerdo vencido y, si alcanza, el de hoy;
//    si el carro no eligió, gana el de menor valor).
// 3) Letra diaria de hoy.
// 4) Si sobra: días siguientes, cada uno acuerdo y luego letra,
//    hasta donde alcance (un día, dos, o acuerdo + parte de la letra).

import { createServerSupabase } from "@/lib/supabase/server";
import { distribuirPago } from "./rules";
import { cuotaDeFecha, type TerminosCuota } from "./cuota";
import { calcularCifras, cubrioCuotaDelDia } from "./cifras";
import { acuerdoHoyDe, cuotaAcuerdoHoy, type AcuerdoActivo } from "./acuerdo";
import { fechaContable, hoyPanama, pasoCorte, esPagoPuntual } from "./fecha";
import { pagoHoyContrato } from "./pagos-dia";
import type { AsignacionPago, Obligacion, ResultadoPago, TipoObligacion } from "./types";
import {
  asegurarCargoSalida,
  borrarCargoSalidaDelPago,
  destinoDePago,
  idsVehiculoYCliente,
  upsertSalidaAutorizada,
} from "./salidas-aplicar";
import { destinoLibre, destinoPorNombre, partirMontoInterior, type DestinoInterior } from "./salidas-interior";

export const PRIORIDAD: Record<TipoObligacion, number> = {
  salida_interior: 5,
  recargo: 8,
  acuerdo: 12,
  saldo_anterior: 20,
  cuenta_diaria: 30,
};

const ETIQUETA: Record<TipoObligacion, string> = {
  salida_interior: "salida al interior",
  acuerdo: "arreglo",
  saldo_anterior: "saldo anterior",
  recargo: "recargo",
  cuenta_diaria: "cuota de hoy",
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
    for (const a of opts.acuerdos) {
      const cupo = Math.min(cuotaAcuerdoHoy(a, fecha), saldos.get(a.id) ?? 0, queda);
      if (cupo <= 0.009) continue;
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
    if (opts.letra > 0.009 && queda > 0.009) {
      const toma = r2(Math.min(opts.letra, queda));
      asignaciones.push({ tipo: "cuenta_diaria", aplicado: toma, etiqueta: `letra ${fecha}` });
      queda = r2(queda - toma);
      aplicado = r2(aplicado + toma);
    }
  }
  return { asignaciones, sobrante: queda, aplicado };
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
    cuotaHoy: number;
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
      .eq("activo", true);
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

  const [contratoRes, saldoRes, multaRes, rentaRes, otras, pagado] = await Promise.all([
    sb.from("contratos")
      .select("letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
      .eq("id", contratoId)
      .maybeSingle(),
    sb.from("vw_saldo_contrato").select("saldo_actual").eq("contrato_id", contratoId).maybeSingle(),
    sb.from("cargos").select("id").eq("contrato_id", contratoId).eq("fecha", fecha)
      .eq("tipo", "multa").eq("concepto_codigo", "PAGO_TARDE").limit(1),
    sb.from("cargos").select("id").eq("contrato_id", contratoId).eq("fecha", fecha)
      .eq("tipo", "renta").limit(1),
    asignacionesDeHoy(contratoId, fecha, pagoId),
    pagoHoyContrato(contratoId, fecha),
  ]);

  const terminos = contratoRes.data as TerminosCuota | null;
  if (!terminos) return null;
  const acuerdos = (acuerdosData ?? []) as AcuerdoActivo[];
  const cuotaHoy = cuotaDeFecha(terminos, fecha);
  const multaHoy = (multaRes.data?.length ?? 0) > 0;
  const hoyYaDevengado = (rentaRes.data?.length ?? 0) > 0;
  const saldoVista = Number((saldoRes.data as { saldo_actual: number } | null)?.saldo_actual ?? 0);
  const saldoAntes = saldoVista + monto;
  const pagadoHoyAntes = Math.max((pagado.pagado ?? 0) - monto, 0);
  const estePuntual = esPagoPuntual(pago.pagado_at, fecha);
  const pagadoPuntualAntes = Math.max((pagado.pagadoPuntual ?? 0) - (estePuntual ? monto : 0), 0);
  const acuerdoHoy = acuerdoHoyDe(acuerdos, fecha);
  let preferencia: string | null = null;
  {
    const pref = await sb.from("contratos").select("prioridad_abono").eq("id", contratoId).maybeSingle();
    if (!pref.error) {
      const v = (pref.data as { prioridad_abono?: string | null } | null)?.prioridad_abono ?? null;
      preferencia = v && v !== "menor" ? v : null;
    }
  }
  const cobraAcuerdoHoy = !preferencia || preferencia === "acuerdo";
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
  });

  // Recargo primero, después la cuota de acuerdo (vencida o de hoy, lo que
  // toque y quepa). El saldo completo del plan no se cobra de un golpe.
  const acuerdosBase = cobraAcuerdoHoy
    ? acuerdos
        .map((a) => ({
          id: a.id,
          monto: cuotaAcuerdoHoy(a, fecha),
          etiqueta: a.descripcion?.trim() || "arreglo",
        }))
        .filter((a) => a.monto > 0.009)
    : [];

  const obligaciones = obligacionesRestantes(
    {
      acuerdos: acuerdosBase,
      pendienteAnterior: cifras.pendienteAnterior,
      recargoHoy: cifras.recargo,
      cuotaHoy,
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

  if (resultado.sobrante > 0.009) {
    const adelanto = adelantarDias({
      sobrante: resultado.sobrante,
      acuerdos,
      letra: cuotaHoy,
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

  for (const a of resultado.asignaciones) {
    if (a.tipo !== "acuerdo" || !a.ref) continue;
    const actual = acuerdos.find((x) => x.id === a.ref);
    if (!actual) continue;
    const nuevo = r2(Math.max(Number(actual.saldo) - a.aplicado, 0));
    await sb.from("acuerdos").update({ saldo: nuevo, activo: nuevo > 0.009 }).eq("id", a.ref);
  }

  await asegurarCargosAcuerdoDelPago({
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
