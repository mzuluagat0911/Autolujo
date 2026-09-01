// Waterfall de un abono: primero arreglo, luego saldo anterior y recargo,
// al final la letra del día. El cliente NO elige; el código reparte y lo deja
// escrito. Si discute la asignación, eso escala a una persona.

import { createServerSupabase } from "@/lib/supabase/server";
import { distribuirPago } from "./rules";
import { cuotaDeFecha, type TerminosCuota } from "./cuota";
import { calcularCifras, cubrioCuotaDelDia } from "./cifras";
import { acuerdoHoyDe, cuotaAcuerdoHoy, type AcuerdoActivo } from "./acuerdo";
import { fechaContable, hoyPanama, pasoCorte, esPagoPuntual } from "./fecha";
import { pagoHoyContrato } from "./pagos-dia";
import type { AsignacionPago, Obligacion, ResultadoPago, TipoObligacion } from "./types";

export const PRIORIDAD: Record<TipoObligacion, number> = {
  acuerdo: 10,
  saldo_anterior: 20,
  recargo: 25,
  cuenta_diaria: 30,
};

const ETIQUETA: Record<TipoObligacion, string> = {
  acuerdo: "arreglo",
  saldo_anterior: "saldo anterior",
  recargo: "recargo",
  cuenta_diaria: "cuota de hoy",
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
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
    const prep = /^(cuota|cuenta)\b/i.test(nombre) ? "a la" : "al";
    return `${money(a.aplicado)} ${prep} ${nombre}`;
  });
  let s = `Se aplicó así: ${partes.join(", ")}.`;
  if (r.sobrante > 0.009) s += ` Quedaron ${money(r.sobrante)} a favor.`;
  return s;
}

type PagoRow = {
  id: string;
  contrato_id: string | null;
  monto: number;
  pagado_at: string;
  estado_conciliacion: string;
  asignaciones: ResultadoPago | AsignacionPago[] | null;
  notas: string | null;
};

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
  const { data: raw, error } = await sb
    .from("pagos")
    .select("id, contrato_id, monto, pagado_at, estado_conciliacion, asignaciones, notas")
    .eq("id", pagoId)
    .maybeSingle();
  if (error || !raw) return null;
  const pago = raw as PagoRow;
  if (!pago.contrato_id) return null;
  if (pago.estado_conciliacion !== "conciliado" && pago.estado_conciliacion !== "manual") {
    return null;
  }

  const ya = parseAsignaciones(pago.asignaciones);
  if (ya) return ya;

  const fecha = fechaContable(pago.pagado_at);
  const contratoId = pago.contrato_id;
  const monto = Number(pago.monto) || 0;

  const [contratoRes, acuerdosRes, saldoRes, multaRes, rentaRes, otras, pagado] = await Promise.all([
    sb.from("contratos")
      .select("letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
      .eq("id", contratoId)
      .maybeSingle(),
    sb.from("acuerdos")
      .select("id, saldo, cuota_diaria, cuota_domingo, descripcion")
      .eq("contrato_id", contratoId)
      .eq("activo", true),
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
  const acuerdos = (acuerdosRes.data ?? []) as AcuerdoActivo[];
  const cuotaHoy = cuotaDeFecha(terminos, fecha);
  const multaHoy = (multaRes.data?.length ?? 0) > 0;
  const hoyYaDevengado = (rentaRes.data?.length ?? 0) > 0;
  const saldoVista = Number((saldoRes.data as { saldo_actual: number } | null)?.saldo_actual ?? 0);
  const saldoAntes = saldoVista + monto;
  const pagadoHoyAntes = Math.max((pagado.pagado ?? 0) - monto, 0);
  const estePuntual = esPagoPuntual(pago.pagado_at, fecha);
  const pagadoPuntualAntes = Math.max((pagado.pagadoPuntual ?? 0) - (estePuntual ? monto : 0), 0);
  const acuerdoHoy = acuerdoHoyDe(acuerdos, fecha);
  const meta = cuotaHoy + acuerdoHoy;
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

  const acuerdosBase = acuerdos
    .map((a) => ({
      id: a.id,
      monto: cuotaAcuerdoHoy(a, fecha),
      etiqueta: a.descripcion?.trim() || "arreglo",
    }))
    .filter((a) => a.monto > 0.009);

  const obligaciones = obligacionesRestantes(
    {
      acuerdos: acuerdosBase,
      pendienteAnterior: cifras.pendienteAnterior,
      recargoHoy: cifras.recargo,
      cuotaHoy,
    },
    otras,
  );

  const resultado = distribuirPago(monto, obligaciones);
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

  await sb.from("pagos").update({ asignaciones: null }).eq("id", pagoId);
}
