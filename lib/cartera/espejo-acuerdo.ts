// El acuerdo vive fuera de la letra. El pago baja el saldo entero, así que
// cada peso asignado a un acuerdo necesita un cargo `tipo=acuerdo` del mismo
// monto. Si ese cargo falta, la letra se come el arreglo.

import { createServerSupabase } from "@/lib/supabase/server";
import { fechaContable } from "./fecha";
import type { AsignacionPago } from "./types";

export type ResultadoEspejo =
  | { ok: true; insertados: number }
  | { ok: false; error: string; insertados: number };

function r2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

function lineasAcuerdo(raw: unknown): AsignacionPago[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as { asignaciones?: unknown };
  const arr = Array.isArray(o.asignaciones) ? o.asignaciones : Array.isArray(raw) ? raw : [];
  return (arr as AsignacionPago[]).filter(
    (a) => a?.tipo === "acuerdo" && (Number(a.aplicado) || 0) > 0.009,
  );
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

/** Deja el cargo espejo igual a lo asignado al acuerdo en este pago. */
export async function asegurarCargosAcuerdoDelPago(opts: {
  contratoId: string;
  pagoId: string;
  fecha: string;
  asignaciones: AsignacionPago[];
}): Promise<ResultadoEspejo> {
  const sb = createServerSupabase();
  const lineas = opts.asignaciones.filter(
    (a) => a.tipo === "acuerdo" && (Number(a.aplicado) || 0) > 0.009,
  );
  if (lineas.length === 0) {
    await borrarCargosAcuerdoDelPago(opts.pagoId);
    return { ok: true, insertados: 0 };
  }

  const { data: ya, error: errYa } = await sb
    .from("cargos")
    .select("id, monto, concepto_codigo")
    .eq("pago_id", opts.pagoId)
    .eq("tipo", "acuerdo");
  if (errYa) return { ok: false, error: errYa.message, insertados: 0 };

  const existentes = ((ya ?? []) as { id: string; monto: number; concepto_codigo: string | null }[])
    .filter((c) => (c.concepto_codigo ?? "").toUpperCase() !== "SALIDA_INT");
  const sumaYa = r2(existentes.reduce((s, c) => s + (Number(c.monto) || 0), 0));
  const sumaNueva = r2(lineas.reduce((s, a) => s + (Number(a.aplicado) || 0), 0));
  if (existentes.length > 0 && Math.abs(sumaYa - sumaNueva) < 0.05) {
    return { ok: true, insertados: 0 };
  }
  if (existentes.length > 0) {
    await borrarCargosAcuerdoDelPago(opts.pagoId);
  }

  let insertados = 0;
  for (const a of lineas) {
    const error = await insertarCargoAcuerdo({
      contrato_id: opts.contratoId,
      fecha: opts.fecha,
      concepto: a.etiqueta?.trim() || "Abono a arreglo",
      monto: r2(Number(a.aplicado) || 0),
      pago_id: opts.pagoId,
      acuerdo_id: a.ref ?? null,
    });
    if (error) return { ok: false, error, insertados };
    insertados += 1;
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

  const candidatos = pagos.filter((p) => lineasAcuerdo(p.asignaciones).length > 0);
  if (candidatos.length === 0) return { insertados: 0, error: null };

  const espejo = new Map<string, number>();
  for (let i = 0; i < candidatos.length; i += 80) {
    const lote = candidatos.slice(i, i + 80).map((p) => p.id);
    const { data, error } = await sb
      .from("cargos")
      .select("pago_id, monto, concepto_codigo")
      .in("pago_id", lote)
      .eq("tipo", "acuerdo");
    if (error) {
      console.error("[espejo-acuerdo]", error.message);
      return { insertados: 0, error: error.message };
    }
    for (const c of (data ?? []) as {
      pago_id: string | null;
      monto: number;
      concepto_codigo: string | null;
    }[]) {
      if (!c.pago_id) continue;
      if ((c.concepto_codigo ?? "").toUpperCase() === "SALIDA_INT") continue;
      espejo.set(c.pago_id, r2((espejo.get(c.pago_id) ?? 0) + (Number(c.monto) || 0)));
    }
  }

  let insertados = 0;
  let error: string | null = null;
  for (const p of candidatos) {
    const lineas = lineasAcuerdo(p.asignaciones);
    const suma = r2(lineas.reduce((s, a) => s + (Number(a.aplicado) || 0), 0));
    const ya = espejo.get(p.id) ?? 0;
    if (Math.abs(suma - ya) < 0.05) continue;
    const fecha = p.pagado_at ? fechaContable(p.pagado_at) : (p.fecha ?? "");
    if (!fecha) {
      error = error ?? "Un pago de acuerdo no tiene fecha.";
      continue;
    }
    const res = await asegurarCargosAcuerdoDelPago({
      contratoId: p.contrato_id,
      pagoId: p.id,
      fecha,
      asignaciones: lineas,
    });
    insertados += res.insertados;
    if (!res.ok) error = error ?? res.error;
  }
  return { insertados, error };
}
