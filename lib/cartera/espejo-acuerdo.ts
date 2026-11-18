// El abono inicial y el acuerdo de pago viven fuera de la letra. El pago baja
// el saldo entero, así que cada peso asignado a uno de los dos necesita un
// cargo del mismo monto. Si ese cargo falta, la cuota se descuenta de la letra.

import { createServerSupabase } from "@/lib/supabase/server";
import { fechaContable } from "./fecha";
import type { AsignacionPago } from "./types";

export type ResultadoEspejo =
  | { ok: true; insertados: number }
  | { ok: false; error: string; insertados: number };

function esLineaAbono(a: { tipo?: string; etiqueta?: string | null }): boolean {
  const tipo = a.tipo ?? "";
  if (tipo === "abono_inicial" || tipo === "abono" || tipo === "afiliacion") return true;
  return tipo === "acuerdo" && /abono\s*inicial/i.test(a.etiqueta ?? "");
}

function r2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

function lineasDe(raw: unknown): AsignacionPago[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as { asignaciones?: unknown };
  const arr = Array.isArray(o.asignaciones) ? o.asignaciones : Array.isArray(raw) ? raw : [];
  return arr as AsignacionPago[];
}

function lineasAbono(raw: unknown): AsignacionPago[] {
  return lineasDe(raw).filter((a) => esLineaAbono(a) && (Number(a.aplicado) || 0) > 0.009);
}

function esLineaAcuerdoPago(a: { tipo?: string; etiqueta?: string | null }): boolean {
  return (a.tipo ?? "") === "acuerdo" && !esLineaAbono(a);
}

function lineasAcuerdoPago(raw: unknown): AsignacionPago[] {
  return lineasDe(raw).filter((a) => esLineaAcuerdoPago(a) && (Number(a.aplicado) || 0) > 0.009);
}

export async function borrarCargosAcuerdoDelPago(pagoId: string): Promise<void> {
  if (!pagoId) return;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("id, concepto_codigo")
    .eq("pago_id", pagoId)
    .eq("tipo", "acuerdo");
  const ids = ((data ?? []) as { id: string; concepto_codigo: string | null }[])
    .filter((c) => (c.concepto_codigo ?? "").toUpperCase() !== "SALIDA_INT")
    .map((c) => c.id);
  if (ids.length === 0) return;
  await sb.from("cargos").delete().in("id", ids);
}

async function insertarCargoAcuerdo(fila: {
  contrato_id: string;
  fecha: string;
  concepto: string;
  monto: number;
  pago_id: string;
  acuerdo_id: string | null;
}): Promise<string | null> {
  const sb = createServerSupabase();
  const { error } = await sb.from("cargos").insert({
    ...fila,
    tipo: "acuerdo",
  });
  if (!error) return null;
  if (fila.acuerdo_id && /acuerdo_id/i.test(error.message)) {
    const retry = await sb.from("cargos").insert({ ...fila, tipo: "acuerdo", acuerdo_id: null });
    if (!retry.error) return null;
    return retry.error.message;
  }
  return error.message;
}

type CargoEspejo = {
  id: string;
  monto: number;
  concepto: string | null;
  concepto_codigo: string | null;
};

function esSalida(c: { concepto_codigo: string | null }): boolean {
  return (c.concepto_codigo ?? "").toUpperCase() === "SALIDA_INT";
}

function esCargoAbono(c: { concepto: string | null }): boolean {
  return /abono\s*inicial/i.test(c.concepto ?? "");
}

/** El alta carga la afiliación sin pago_id. Si ese cargo ya cubre el abono,
 *  el espejo lo vuelve a meter en la letra y el extracto lo cobra como cuenta. */
async function afiliacionSueltaCubre(contratoId: string, fecha: string, monto: number): Promise<boolean> {
  if (monto <= 0.009) return false;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("monto, concepto, fecha")
    .eq("contrato_id", contratoId)
    .eq("tipo", "afiliacion")
    .is("pago_id", null);
  return ((data ?? []) as { monto: number; concepto: string | null; fecha: string | null }[]).some(
    (c) =>
      /abono\s*inicial/i.test(c.concepto ?? "") &&
      String(c.fecha ?? "").slice(0, 10) === fecha.slice(0, 10) &&
      Math.abs((Number(c.monto) || 0) - monto) < 0.05,
  );
}

async function cargosEspejoDelPago(
  pagoId: string,
): Promise<{ ok: true; filas: CargoEspejo[] } | { ok: false; error: string }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("cargos")
    .select("id, monto, concepto, concepto_codigo")
    .eq("pago_id", pagoId)
    .eq("tipo", "acuerdo");
  if (error) return { ok: false, error: error.message };
  return { ok: true, filas: (data ?? []) as CargoEspejo[] };
}

/** Deja el cargo espejo igual a lo asignado al abono y al acuerdo de pago.
 *  Cada uno en su cargo: ninguno de los dos baja la letra. */
export async function asegurarCargosAcuerdoDelPago(opts: {
  contratoId: string;
  pagoId: string;
  fecha: string;
  asignaciones: AsignacionPago[];
}): Promise<ResultadoEspejo> {
  const abono = opts.asignaciones.filter((a) => esLineaAbono(a) && (Number(a.aplicado) || 0) > 0.009);
  const acuerdo = opts.asignaciones.filter(
    (a) => esLineaAcuerdoPago(a) && (Number(a.aplicado) || 0) > 0.009,
  );
  if (abono.length === 0 && acuerdo.length === 0) return { ok: true, insertados: 0 };

  const leidos = await cargosEspejoDelPago(opts.pagoId);
  if (!leidos.ok) return { ok: false, error: leidos.error, insertados: 0 };
  const vivos = leidos.filas.filter((c) => !esSalida(c));

  let insertados = 0;
  if (abono.length > 0) {
    const delAbono = vivos.filter(esCargoAbono);
    const sumaNueva = r2(abono.reduce((s, a) => s + (Number(a.aplicado) || 0), 0));
    const alta = await afiliacionSueltaCubre(opts.contratoId, opts.fecha, sumaNueva);
    if (alta) {
      if (delAbono.length > 0) {
        const sb = createServerSupabase();
        await sb.from("cargos").delete().in("id", delAbono.map((c) => c.id));
      }
    } else {
      const sumaYa = r2(delAbono.reduce((s, c) => s + (Number(c.monto) || 0), 0));
      const cuadra = delAbono.length > 0 && Math.abs(sumaYa - sumaNueva) < 0.05;
      if (!cuadra) {
        if (delAbono.length > 0) {
          const sb = createServerSupabase();
          await sb.from("cargos").delete().in("id", delAbono.map((c) => c.id));
        }
        for (const a of abono) {
          const error = await insertarCargoAcuerdo({
            contrato_id: opts.contratoId,
            fecha: opts.fecha,
            concepto: "Abono inicial",
            monto: r2(Number(a.aplicado) || 0),
            pago_id: opts.pagoId,
            acuerdo_id: a.ref ?? null,
          });
          if (error) return { ok: false, error, insertados };
          insertados += 1;
        }
      }
    }
  }

  if (acuerdo.length > 0) {
    const delAcuerdo = vivos.filter((c) => !esCargoAbono(c));
    const sumaYa = r2(delAcuerdo.reduce((s, c) => s + (Number(c.monto) || 0), 0));
    const sumaNueva = r2(acuerdo.reduce((s, a) => s + (Number(a.aplicado) || 0), 0));
    const falta = r2(sumaNueva - sumaYa);
    if (falta > 0.05) {
      const error = await insertarCargoAcuerdo({
        contrato_id: opts.contratoId,
        fecha: opts.fecha,
        concepto: "Acuerdo de pago",
        monto: falta,
        pago_id: opts.pagoId,
        acuerdo_id: acuerdo.find((a) => a.ref)?.ref ?? null,
      });
      if (error) return { ok: false, error, insertados };
      insertados += 1;
    }
  }

  return { ok: true, insertados };
}

async function idsConAcuerdo(contratoIds: string[]): Promise<string[]> {
  const sb = createServerSupabase();
  const out = new Set<string>();
  for (let i = 0; i < contratoIds.length; i += 80) {
    const lote = contratoIds.slice(i, i + 80);
    const { data, error } = await sb.from("acuerdos").select("contrato_id").in("contrato_id", lote);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { contrato_id: string }[]) out.add(row.contrato_id);
  }
  return [...out];
}

/**
 * Recorre los pagos que ya cuentan y crea el cargo espejo que falte.
 * No toca el saldo del acuerdo. Se llama antes de leer el estado de cuenta.
 */
export async function cuadrarEspejosAcuerdo(
  contratoIds: string[],
): Promise<{ insertados: number; error: string | null }> {
  const ids = [...new Set(contratoIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return { insertados: 0, error: null };

  let conAcuerdo: string[];
  try {
    conAcuerdo = await idsConAcuerdo(ids);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No pude leer los acuerdos.";
    console.error("[espejo-acuerdo]", msg);
    return { insertados: 0, error: msg };
  }
  if (conAcuerdo.length === 0) return { insertados: 0, error: null };

  const sb = createServerSupabase();
  type Pago = {
    id: string;
    contrato_id: string;
    pagado_at: string | null;
    fecha: string | null;
    asignaciones: unknown;
  };
  const pagos: Pago[] = [];
  for (let i = 0; i < conAcuerdo.length; i += 40) {
    const lote = conAcuerdo.slice(i, i + 40);
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb
        .from("pagos")
        .select("id, contrato_id, pagado_at, fecha, asignaciones")
        .in("contrato_id", lote)
        .in("estado_conciliacion", ["conciliado", "manual"])
        .not("asignaciones", "is", null)
        .order("id")
        .range(desde, desde + 999);
      if (error) {
        console.error("[espejo-acuerdo]", error.message);
        return { insertados: 0, error: error.message };
      }
      const filas = (data ?? []) as Pago[];
      pagos.push(...filas);
      if (filas.length < 1000) break;
    }
  }

  const candidatos = pagos.filter(
    (p) => lineasAbono(p.asignaciones).length > 0 || lineasAcuerdoPago(p.asignaciones).length > 0,
  );
  if (candidatos.length === 0) return { insertados: 0, error: null };

  const abonoYa = new Map<string, number>();
  const acuerdoYa = new Map<string, number>();
  for (let i = 0; i < candidatos.length; i += 80) {
    const lote = candidatos.slice(i, i + 80).map((p) => p.id);
    const { data, error } = await sb
      .from("cargos")
      .select("pago_id, monto, concepto, concepto_codigo")
      .in("pago_id", lote)
      .eq("tipo", "acuerdo");
    if (error) {
      console.error("[espejo-acuerdo]", error.message);
      return { insertados: 0, error: error.message };
    }
    for (const c of (data ?? []) as {
      pago_id: string | null;
      monto: number;
      concepto: string | null;
      concepto_codigo: string | null;
    }[]) {
      if (!c.pago_id || esSalida(c)) continue;
      const bolsa = esCargoAbono(c) ? abonoYa : acuerdoYa;
      bolsa.set(c.pago_id, r2((bolsa.get(c.pago_id) ?? 0) + (Number(c.monto) || 0)));
    }
  }

  let insertados = 0;
  let error: string | null = null;
  const sueltas = new Map<string, { fecha: string; monto: number }[]>();
  const idsCandidatos = [...new Set(candidatos.map((p) => p.contrato_id))];
  for (let i = 0; i < idsCandidatos.length; i += 80) {
    const lote = idsCandidatos.slice(i, i + 80);
    const { data, error: errSuelta } = await sb
      .from("cargos")
      .select("contrato_id, monto, concepto, fecha")
      .in("contrato_id", lote)
      .eq("tipo", "afiliacion")
      .is("pago_id", null);
    if (errSuelta) {
      console.error("[espejo-acuerdo]", errSuelta.message);
      return { insertados: 0, error: errSuelta.message };
    }
    for (const c of (data ?? []) as {
      contrato_id: string;
      monto: number;
      concepto: string | null;
      fecha: string | null;
    }[]) {
      if (!/abono\s*inicial/i.test(c.concepto ?? "")) continue;
      const lista = sueltas.get(c.contrato_id) ?? [];
      lista.push({ fecha: String(c.fecha ?? "").slice(0, 10), monto: Number(c.monto) || 0 });
      sueltas.set(c.contrato_id, lista);
    }
  }

  for (const p of candidatos) {
    const abono = r2(lineasAbono(p.asignaciones).reduce((s, a) => s + (Number(a.aplicado) || 0), 0));
    const acuerdo = r2(lineasAcuerdoPago(p.asignaciones).reduce((s, a) => s + (Number(a.aplicado) || 0), 0));
    const fecha = p.pagado_at ? fechaContable(p.pagado_at) : (p.fecha ?? "");
    const espejoAbono = abonoYa.get(p.id) ?? 0;
    const cubierto =
      fecha !== "" &&
      (sueltas.get(p.contrato_id) ?? []).some(
        (s) => s.fecha === fecha.slice(0, 10) && Math.abs(s.monto - abono) < 0.05,
      );
    const faltaAbono =
      abono > 0.009 && (cubierto ? espejoAbono > 0.009 : Math.abs(abono - espejoAbono) >= 0.05);
    const faltaAcuerdo = acuerdo - (acuerdoYa.get(p.id) ?? 0) > 0.05;
    if (!faltaAbono && !faltaAcuerdo) continue;
    if (!fecha) {
      error = error ?? "Un pago de acuerdo no tiene fecha.";
      continue;
    }
    const res = await asegurarCargosAcuerdoDelPago({
      contratoId: p.contrato_id,
      pagoId: p.id,
      fecha,
      asignaciones: lineasDe(p.asignaciones),
    });
    insertados += res.insertados;
    if (!res.ok) error = error ?? res.error;
  }
  return { insertados, error };
}
