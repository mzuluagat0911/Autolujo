"use server";

import { revalidatePath } from "next/cache";
import { invalidarLecturaEstados } from "@/lib/cartera/estado-cuenta-cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, pagadoAtDesdeForm, fechaContable } from "@/lib/cartera/fecha";
import { enviarEstadoCuentaPrueba } from "@/lib/cartera/envios";
import type { FrecuenciaAcuerdo } from "@/lib/cartera/acuerdo";
import { fechaConDiaSemana } from "@/lib/cartera/acuerdo";
import {
  historialPagosContrato,
  type PagoHistorial,
} from "@/lib/cartera/historial-pagos";
import {
  aplicarPagoEnObligaciones,
  revertirPagoEnObligaciones,
} from "@/lib/cartera/aplicar-pago";
import { recalcularRecargo } from "@/lib/cartera/devengo";

const FRECUENCIAS_OK = new Set<FrecuenciaAcuerdo>([
  "dia",
  "domingo",
  "semana",
  "quincena",
  "mes",
  "fecha",
]);

function normalizarFrecuencia(v: unknown): FrecuenciaAcuerdo {
  const s = String(v ?? "dia").trim().toLowerCase();
  return FRECUENCIAS_OK.has(s as FrecuenciaAcuerdo) ? (s as FrecuenciaAcuerdo) : "dia";
}

function fechaONull(v: unknown): string | null {
  const s = String(v ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export type ResultadoPrueba = { ok: boolean; error?: string; preview?: string } | null;

export async function accionEnviarPrueba(
  _prev: ResultadoPrueba,
  formData: FormData,
): Promise<ResultadoPrueba> {
  const carro = String(formData.get("carro") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  if (!carro) return { ok: false, error: "Indica el número de carro." };
  return enviarEstadoCuentaPrueba(carro, numero || undefined);
}

export type CargoEditable = {
  id: string;
  fecha: string;
  tipo: string;
  concepto: string;
  concepto_codigo: string | null;
  monto: number;
};

export type AcuerdoEditable = {
  id: string;
  tipo: string;
  descripcion: string;
  saldo: number;
  cuota_diaria: number;
  cuota_domingo: number;
  monto_total: number;
  activo: boolean;
  frecuencia: FrecuenciaAcuerdo;
  fecha_especifica: string | null;
};

export type LedgerEditable = {
  contratoId: string;
  letraDiaria: number;
  numCuotasTotal: number | null;
  cuotasPagadas: number | null;
  cargos: CargoEditable[];
  acuerdos: AcuerdoEditable[];
  /** null = menor valor. */
  prioridadAbono: string | null;
};

export type CargoDraft = {
  /** null = nuevo */
  id: string | null;
  fecha: string;
  tipo: string;
  concepto: string;
  concepto_codigo: string | null;
  monto: number;
  borrar?: boolean;
};

export type AcuerdoDraft = {
  id: string | null;
  tipo: string;
  descripcion: string;
  saldo: number;
  cuota_diaria: number;
  cuota_domingo: number;
  monto_total: number;
  activo: boolean;
  frecuencia: FrecuenciaAcuerdo;
  fecha_especifica: string | null;
  borrar?: boolean;
};

export type GuardarLedgerInput = {
  contratoId: string;
  letraDiaria: number;
  numCuotasTotal: number | null;
  cuotasPagadas: number | null;
  cargos: CargoDraft[];
  acuerdos: AcuerdoDraft[];
  prioridadAbono?: string | null;
  nota?: string;
};

const TIPOS_CARGO_OK = new Set([
  "otras",
  "multa",
  "panapass",
  "afiliacion",
  "siniestro",
  "ajuste",
  "acuerdo",
  "exceso_km",
]);

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Cargos editables (no renta diaria) + acuerdos del contrato. */
async function prioridadAbonoDe(
  sb: ReturnType<typeof createServerSupabase>,
  contratoId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from("contratos")
    .select("prioridad_abono")
    .eq("id", contratoId)
    .maybeSingle();
  if (error) return null;
  const v = (data as { prioridad_abono?: string | null } | null)?.prioridad_abono;
  return v && v !== "menor" ? v : null;
}

/** Cargos editables (no renta diaria) + acuerdos del contrato. */
export async function cargarLedgerEditable(contratoId: string): Promise<
  { ok: true; data: LedgerEditable } | { ok: false; error: string }
> {
  if (!contratoId) return { ok: false, error: "Contrato inválido." };
  const sb = createServerSupabase();

  const { data: con, error: conErr } = await sb
    .from("contratos")
    .select("id, letra_diaria, num_cuotas_total, cuotas_pagadas")
    .eq("id", contratoId)
    .maybeSingle();

  let row = con as {
    id: string;
    letra_diaria: number;
    num_cuotas_total: number | null;
    cuotas_pagadas?: number | null;
  } | null;

  if (conErr && /cuotas_pagadas/i.test(conErr.message)) {
    const retry = await sb
      .from("contratos")
      .select("id, letra_diaria, num_cuotas_total")
      .eq("id", contratoId)
      .maybeSingle();
    row = retry.data
      ? { ...(retry.data as { id: string; letra_diaria: number; num_cuotas_total: number | null }), cuotas_pagadas: null }
      : null;
  } else if (conErr) {
    return { ok: false, error: conErr.message };
  }
  if (!row) return { ok: false, error: "Contrato no encontrado." };

  const { data: cargosData, error: carErr } = await sb
    .from("cargos")
    .select("id, fecha, tipo, concepto, concepto_codigo, monto")
    .eq("contrato_id", contratoId)
    .not("tipo", "in", "(renta,cuenta_diaria)")
    .order("fecha", { ascending: false })
    .limit(80);

  if (carErr) return { ok: false, error: carErr.message };

  const acuSel =
    "id, tipo, descripcion, saldo, cuota_diaria, cuota_domingo, monto_total, activo, frecuencia, fecha_especifica";
  let acuData: unknown[] | null = null;
  let acuErr: { message: string } | null = null;
  {
    const res = await sb
      .from("acuerdos")
      .select(acuSel)
      .eq("contrato_id", contratoId)
      .order("created_at", { ascending: false });
    acuData = res.data as unknown[] | null;
    acuErr = res.error;
  }

  if (acuErr && /frecuencia|fecha_especifica/i.test(acuErr.message)) {
    const retry = await sb
      .from("acuerdos")
      .select("id, tipo, descripcion, saldo, cuota_diaria, cuota_domingo, monto_total, activo")
      .eq("contrato_id", contratoId)
      .order("created_at", { ascending: false });
    acuData = retry.data as unknown[] | null;
    acuErr = retry.error;
  }

  if (acuErr) return { ok: false, error: acuErr.message };

  return {
    ok: true,
    data: {
      contratoId: row.id,
      letraDiaria: Number(row.letra_diaria) || 0,
      numCuotasTotal: row.num_cuotas_total != null ? Number(row.num_cuotas_total) : null,
      cuotasPagadas: row.cuotas_pagadas != null ? Number(row.cuotas_pagadas) : null,
      cargos: ((cargosData ?? []) as CargoEditable[]).map((c) => ({
        id: c.id,
        fecha: String(c.fecha).slice(0, 10),
        tipo: c.tipo,
        concepto: c.concepto ?? "",
        concepto_codigo: c.concepto_codigo ?? null,
        monto: Number(c.monto) || 0,
      })),
      acuerdos: ((acuData ?? []) as AcuerdoEditable[]).map((a) => ({
        id: a.id,
        tipo: a.tipo,
        descripcion: a.descripcion ?? "",
        saldo: Number(a.saldo) || 0,
        cuota_diaria: Number(a.cuota_diaria) || 0,
        cuota_domingo: Number(a.cuota_domingo) || 0,
        monto_total: Number(a.monto_total) || 0,
        activo: Boolean(a.activo),
        frecuencia: normalizarFrecuencia(
          (a as { frecuencia?: string }).frecuencia,
        ),
        fecha_especifica: fechaONull(
          (a as { fecha_especifica?: string | null }).fecha_especifica,
        ),
      })),
      prioridadAbono: await prioridadAbonoDe(sb, contratoId),
    },
  };
}

/** Persiste excepciones / negociaciones del popup de estado de cuenta. */
export async function guardarLedgerEditable(
  input: GuardarLedgerInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const contratoId = String(input.contratoId || "").trim();
  if (!contratoId) return { ok: false, error: "Contrato inválido." };

  const sb = createServerSupabase();
  const hoy = hoyPanama();

  const patchContrato: Record<string, number | null> = {
    letra_diaria: Math.max(n(input.letraDiaria), 0),
  };
  if (input.numCuotasTotal != null && Number.isFinite(input.numCuotasTotal)) {
    patchContrato.num_cuotas_total = Math.max(Math.round(input.numCuotasTotal), 0);
  }
  if (input.cuotasPagadas != null && Number.isFinite(input.cuotasPagadas)) {
    patchContrato.cuotas_pagadas = Math.max(n(input.cuotasPagadas), 0);
  }

  {
    const { error } = await sb.from("contratos").update(patchContrato).eq("id", contratoId);
    if (error && /cuotas_pagadas/i.test(error.message)) {
      const { cuotas_pagadas: _c, ...sin } = patchContrato;
      const retry = await sb.from("contratos").update(sin).eq("id", contratoId);
      if (retry.error) return { ok: false, error: retry.error.message };
    } else if (error) {
      return { ok: false, error: error.message };
    }
  }
  if (input.prioridadAbono !== undefined) {
    const valor =
      input.prioridadAbono && input.prioridadAbono !== "menor" ? input.prioridadAbono : null;
    const { error } = await sb.from("contratos").update({ prioridad_abono: valor }).eq("id", contratoId);
    if (error && !/prioridad_abono/i.test(error.message)) return { ok: false, error: error.message };
  }

  for (const c of input.cargos ?? []) {
    if (c.borrar && c.id) {
      const { error } = await sb.from("cargos").delete().eq("id", c.id).eq("contrato_id", contratoId);
      if (error) return { ok: false, error: `Borrar cargo: ${error.message}` };
      continue;
    }
    if (c.borrar) continue;

    const tipo = TIPOS_CARGO_OK.has(c.tipo) ? c.tipo : "otras";
    const monto = n(c.monto);
    const concepto = String(c.concepto || "").trim() || tipo;
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : hoy;
    const codigo = c.concepto_codigo ? String(c.concepto_codigo).trim() || null : null;

    if (c.id) {
      const body: Record<string, unknown> = {
        fecha,
        tipo,
        concepto,
        monto,
      };
      if (codigo) body.concepto_codigo = codigo;
      const { error } = await sb.from("cargos").update(body).eq("id", c.id).eq("contrato_id", contratoId);
      if (error && /concepto_codigo/i.test(error.message)) {
        const { concepto_codigo: _x, ...sin } = body;
        const retry = await sb.from("cargos").update(sin).eq("id", c.id).eq("contrato_id", contratoId);
        if (retry.error) return { ok: false, error: `Actualizar cargo: ${retry.error.message}` };
      } else if (error) {
        return { ok: false, error: `Actualizar cargo: ${error.message}` };
      }
    } else {
      if (Math.abs(monto) <= 0.009) continue;
      const body: Record<string, unknown> = {
        contrato_id: contratoId,
        fecha,
        tipo,
        concepto,
        monto,
      };
      if (codigo) body.concepto_codigo = codigo;
      const { error } = await sb.from("cargos").insert(body);
      if (error && /concepto_codigo/i.test(error.message)) {
        const { concepto_codigo: _x, ...sin } = body;
        const retry = await sb.from("cargos").insert(sin);
        if (retry.error) return { ok: false, error: `Crear cargo: ${retry.error.message}` };
      } else if (error) {
        return { ok: false, error: `Crear cargo: ${error.message}` };
      }
    }
  }

  for (const a of input.acuerdos ?? []) {
    if (a.borrar && a.id) {
      const { error } = await sb
        .from("acuerdos")
        .update({ activo: false })
        .eq("id", a.id)
        .eq("contrato_id", contratoId);
      if (error) return { ok: false, error: `Desactivar acuerdo: ${error.message}` };
      continue;
    }
    if (a.borrar) continue;

    const tipo = ["dano", "financiamiento", "otro"].includes(a.tipo) ? a.tipo : "otro";
    const frecuencia = normalizarFrecuencia(a.frecuencia);
    const fecha_especifica = fechaONull(a.fecha_especifica);
    const body: Record<string, unknown> = {
      tipo,
      descripcion: String(a.descripcion || "").trim() || null,
      saldo: Math.max(n(a.saldo), 0),
      cuota_diaria: Math.max(n(a.cuota_diaria), 0),
      cuota_domingo: Math.max(n(a.cuota_domingo), 0),
      monto_total: Math.max(n(a.monto_total) || n(a.saldo), 0),
      activo: a.activo !== false,
      frecuencia,
      fecha_especifica,
    };

    if (a.id) {
      const { error } = await sb.from("acuerdos").update(body).eq("id", a.id).eq("contrato_id", contratoId);
      if (error && /frecuencia|fecha_especifica|check/i.test(error.message)) {
        const fallback = { ...body };
        if (frecuencia === "domingo") {
          fallback.frecuencia = "semana";
          fallback.fecha_especifica = fecha_especifica ?? fechaConDiaSemana(hoyPanama(), 0);
        }
        const { frecuencia: _f, fecha_especifica: _fe, ...sin } = fallback;
        const retryFull = await sb.from("acuerdos").update(fallback).eq("id", a.id).eq("contrato_id", contratoId);
        if (retryFull.error) {
          const retry = await sb.from("acuerdos").update(sin).eq("id", a.id).eq("contrato_id", contratoId);
          if (retry.error) return { ok: false, error: `Actualizar acuerdo: ${retry.error.message}` };
        }
      } else if (error) {
        return { ok: false, error: `Actualizar acuerdo: ${error.message}` };
      }
    } else {
      if (Number(body.saldo) <= 0.009 && Number(body.cuota_diaria) <= 0.009) continue;
      const insertBody: Record<string, unknown> = {
        contrato_id: contratoId,
        ...body,
        monto_total:
          Number(body.monto_total) > 0.009 ? body.monto_total : body.saldo,
      };
      const { error } = await sb.from("acuerdos").insert(insertBody);
      if (error && /frecuencia|fecha_especifica|check/i.test(error.message)) {
        const fallback = { ...insertBody };
        if (frecuencia === "domingo") {
          fallback.frecuencia = "semana";
          fallback.fecha_especifica = fecha_especifica ?? fechaConDiaSemana(hoyPanama(), 0);
        }
        const { frecuencia: _f, fecha_especifica: _fe, ...sin } = fallback;
        const retryFull = await sb.from("acuerdos").insert(fallback);
        if (retryFull.error) {
          const retry = await sb.from("acuerdos").insert(sin);
          if (retry.error) return { ok: false, error: `Crear acuerdo: ${retry.error.message}` };
        }
      } else if (error) {
        return { ok: false, error: `Crear acuerdo: ${error.message}` };
      }
    }
  }

  revalidatePath("/cartera/estados-cuenta");
  revalidatePath("/cartera");
  invalidarLecturaEstados();
  return { ok: true };
}

export type { PagoHistorial };

/** Histórico de pagos del contrato (discriminado por asignaciones). */
export async function cargarHistorialPagos(
  contratoId: string,
): Promise<{ ok: boolean; pagos: PagoHistorial[]; error?: string }> {
  const id = String(contratoId ?? "").trim();
  if (!id) return { ok: false, pagos: [], error: "Falta el contrato." };
  try {
    const pagos = await historialPagosContrato(id);
    return { ok: true, pagos };
  } catch (e) {
    return {
      ok: false,
      pagos: [],
      error: e instanceof Error ? e.message : "No pude cargar el historial.",
    };
  }
}

export type ResultadoEditarPago = { ok: boolean; msg: string };

const ESTADOS_PAGO = new Set(["conciliado", "manual", "pendiente", "rechazado"]);
const METODOS_PAGO = new Set(["transferencia", "efectivo", "tarjeta"]);

/**
 * Edita un pago desde el historial del estado de cuenta.
 * Si el pago ya estaba aplicado, revierte el waterfall, guarda y vuelve a aplicar
 * cuando el nuevo estado cuenta (conciliado/manual).
 */
export async function editarPagoHistorial(
  _prev: ResultadoEditarPago | null,
  formData: FormData,
): Promise<ResultadoEditarPago> {
  const pagoId = String(formData.get("pago_id") ?? "").trim();
  const contratoId = String(formData.get("contrato_id") ?? "").trim();
  const montoRaw = String(formData.get("monto") ?? "").replace(",", ".").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  const hora = String(formData.get("hora") ?? "").trim() || "12:00";
  const metodo = String(formData.get("metodo") ?? "").trim().toLowerCase();
  const referencia = String(formData.get("referencia") ?? "").trim() || null;
  const estado = String(formData.get("estado") ?? "").trim().toLowerCase();
  const notasExtra = String(formData.get("notas") ?? "").trim();

  if (!pagoId) return { ok: false, msg: "Falta el pago." };
  if (!contratoId) return { ok: false, msg: "Falta el contrato." };
  const monto = Number(montoRaw);
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, msg: "Monto inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, msg: "Fecha inválida." };
  if (!/^\d{2}:\d{2}$/.test(hora)) return { ok: false, msg: "Hora inválida (HH:MM)." };
  if (!METODOS_PAGO.has(metodo)) return { ok: false, msg: "Método inválido." };
  if (!ESTADOS_PAGO.has(estado)) return { ok: false, msg: "Estado inválido." };

  const sb = createServerSupabase();
  const { data: actual, error: errGet } = await sb
    .from("pagos")
    .select("id, contrato_id, estado_conciliacion, notas, asignaciones, pagado_at")
    .eq("id", pagoId)
    .maybeSingle();
  if (errGet) return { ok: false, msg: errGet.message };
  if (!actual) return { ok: false, msg: "No encontré ese pago." };
  if ((actual as { contrato_id: string | null }).contrato_id !== contratoId) {
    return { ok: false, msg: "El pago no pertenece a este contrato." };
  }

  const prevEstado = String((actual as { estado_conciliacion: string }).estado_conciliacion);
  const contabaAntes = prevEstado === "conciliado" || prevEstado === "manual";
  const contaraDespues = estado === "conciliado" || estado === "manual";

  // Siempre deshacer waterfall previo antes de mutar montos/fecha/estado.
  if (contabaAntes || (actual as { asignaciones: unknown }).asignaciones) {
    try {
      await revertirPagoEnObligaciones(pagoId);
    } catch (e) {
      console.error("[editarPagoHistorial] revertir", e);
    }
  }

  const pagadoAt = pagadoAtDesdeForm(fecha, hora);
  const notasPrev = String((actual as { notas: string | null }).notas ?? "").trim();
  const notaEdit = `Editado en estado de cuenta (${hoyPanama()}).`;
  const notas = [notasPrev.replace(/\s*·\s*Editado en estado de cuenta[^·]*/g, "").trim(), notaEdit, notasExtra]
    .filter(Boolean)
    .join(" · ");

  const { error: errUp } = await sb
    .from("pagos")
    .update({
      monto,
      fecha,
      pagado_at: pagadoAt,
      metodo,
      referencia,
      estado_conciliacion: estado,
      notas,
      asignaciones: null,
    })
    .eq("id", pagoId);
  if (errUp) return { ok: false, msg: errUp.message };

  if (contaraDespues) {
    try {
      await aplicarPagoEnObligaciones(pagoId);
    } catch (e) {
      console.error("[editarPagoHistorial] aplicar", e);
      return {
        ok: false,
        msg: e instanceof Error ? e.message : "Guardé el pago pero no pude reaplicar el desglose.",
      };
    }
  }

  try {
    await recalcularRecargo(contratoId, fecha);
    const prevFecha = fechaContable((actual as { pagado_at: string }).pagado_at);
    if (prevFecha !== fecha) await recalcularRecargo(contratoId, prevFecha);
  } catch (e) {
    console.error("[editarPagoHistorial] recargo", e);
  }

  revalidatePath("/cartera/estados-cuenta");
  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  invalidarLecturaEstados();
  return { ok: true, msg: contaraDespues ? "Pago guardado y desglose reaplicado." : "Pago guardado." };
}

/** Solo vuelve a correr el waterfall (útil si quedó sin discriminado). */
export async function reaplicarPagoHistorial(pagoId: string, contratoId: string): Promise<ResultadoEditarPago> {
  const id = String(pagoId ?? "").trim();
  const cid = String(contratoId ?? "").trim();
  if (!id || !cid) return { ok: false, msg: "Faltan datos." };

  const sb = createServerSupabase();
  const { data: p, error } = await sb
    .from("pagos")
    .select("id, contrato_id, estado_conciliacion, pagado_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, msg: error.message };
  if (!p || (p as { contrato_id: string | null }).contrato_id !== cid) {
    return { ok: false, msg: "El pago no pertenece a este contrato." };
  }
  const est = String((p as { estado_conciliacion: string }).estado_conciliacion);
  if (est !== "conciliado" && est !== "manual") {
    return { ok: false, msg: "Solo se reaplica si el pago está conciliado o manual." };
  }

  try {
    await revertirPagoEnObligaciones(id);
    await aplicarPagoEnObligaciones(id);
    await recalcularRecargo(cid, fechaContable((p as { pagado_at: string }).pagado_at));
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : "No pude reaplicar." };
  }

  revalidatePath("/cartera/estados-cuenta");
  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  invalidarLecturaEstados();
  return { ok: true, msg: "Desglose reaplicado." };
}

const TIPOS_ASIG = new Set([
  "acuerdo",
  "saldo_anterior",
  "recargo",
  "cuenta_diaria",
  "salida_interior",
]);

const ETIQUETA_ASIG: Record<string, string> = {
  acuerdo: "arreglo",
  saldo_anterior: "saldo anterior",
  recargo: "recargo",
  cuenta_diaria: "cuota / letra",
  salida_interior: "salida al interior",
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Guarda a mano cómo se partió el pago (reasignar conceptos).
 * Revierte el waterfall previo, escribe las líneas y ajusta saldos de acuerdo.
 */
export async function guardarAsignacionesHistorial(opts: {
  pagoId: string;
  contratoId: string;
  lineas: { tipo: string; aplicado: number; etiqueta?: string }[];
  sobrante?: number;
}): Promise<ResultadoEditarPago> {
  const pagoId = String(opts.pagoId ?? "").trim();
  const contratoId = String(opts.contratoId ?? "").trim();
  if (!pagoId || !contratoId) return { ok: false, msg: "Faltan datos." };

  const sb = createServerSupabase();
  const { data: p, error } = await sb
    .from("pagos")
    .select("id, contrato_id, monto, estado_conciliacion, pagado_at, notas")
    .eq("id", pagoId)
    .maybeSingle();
  if (error) return { ok: false, msg: error.message };
  if (!p || (p as { contrato_id: string | null }).contrato_id !== contratoId) {
    return { ok: false, msg: "El pago no pertenece a este contrato." };
  }
  const est = String((p as { estado_conciliacion: string }).estado_conciliacion);
  if (est !== "conciliado" && est !== "manual") {
    return { ok: false, msg: "Solo se reasigna si el pago ya cuenta (manual/conciliado)." };
  }

  const monto = Number((p as { monto: number }).monto) || 0;
  const lineas = (opts.lineas ?? [])
    .map((l) => ({
      tipo: String(l.tipo ?? "").trim(),
      aplicado: r2(Number(l.aplicado) || 0),
      etiqueta: (l.etiqueta ?? "").trim() || undefined,
    }))
    .filter((l) => l.aplicado > 0.009 && TIPOS_ASIG.has(l.tipo));

  const suma = r2(lineas.reduce((s, l) => s + l.aplicado, 0));
  let sobrante = opts.sobrante != null ? r2(Number(opts.sobrante) || 0) : r2(monto - suma);
  if (sobrante < -0.009) return { ok: false, msg: "La suma de conceptos supera el monto del pago." };
  if (sobrante < 0) sobrante = 0;
  if (Math.abs(suma + sobrante - monto) > 0.05) {
    return {
      ok: false,
      msg: `La suma ($${suma}) + sobrante ($${sobrante}) debe igualar el pago ($${monto}).`,
    };
  }

  try {
    await revertirPagoEnObligaciones(pagoId);
  } catch (e) {
    console.error("[guardarAsignaciones] revertir", e);
  }

  const asignaciones = lineas.map((l) => ({
    tipo: l.tipo,
    aplicado: l.aplicado,
    etiqueta: l.etiqueta || ETIQUETA_ASIG[l.tipo] || l.tipo,
  }));
  const payload = {
    asignaciones,
    sobrante,
    totalAplicado: suma,
  };

  const notasPrev = String((p as { notas: string | null }).notas ?? "").trim();
  const nota = `Asignación manual en estado de cuenta (${hoyPanama()}).`;
  const notas = [notasPrev.replace(/\s*·\s*Asignación manual en estado de cuenta[^·]*/g, "").trim(), nota]
    .filter(Boolean)
    .join(" · ");

  const { error: errUp } = await sb
    .from("pagos")
    .update({ asignaciones: payload, notas })
    .eq("id", pagoId);
  if (errUp) return { ok: false, msg: errUp.message };

  // Baja saldos de acuerdos activos (reparte el monto “acuerdo” entre ellos).
  let restoAcuerdo = r2(
    asignaciones.filter((a) => a.tipo === "acuerdo").reduce((s, a) => s + a.aplicado, 0),
  );
  if (restoAcuerdo > 0.009) {
    const { data: acuerdos } = await sb
      .from("acuerdos")
      .select("id, saldo")
      .eq("contrato_id", contratoId)
      .eq("activo", true)
      .order("created_at", { ascending: true });
    for (const a of (acuerdos ?? []) as { id: string; saldo: number }[]) {
      if (restoAcuerdo <= 0.009) break;
      const saldo = Math.max(Number(a.saldo) || 0, 0);
      if (saldo <= 0.009) continue;
      const take = r2(Math.min(saldo, restoAcuerdo));
      const nuevo = r2(saldo - take);
      await sb.from("acuerdos").update({ saldo: nuevo, activo: nuevo > 0.009 }).eq("id", a.id);
      restoAcuerdo = r2(restoAcuerdo - take);
    }
  }

  const { asegurarCargosAcuerdoDelPago } = await import("@/lib/cartera/aplicar-pago");
  await asegurarCargosAcuerdoDelPago({
    contratoId,
    pagoId,
    fecha: fechaContable((p as { pagado_at: string }).pagado_at),
    asignaciones: asignaciones.map((a) => ({
      tipo: a.tipo as "acuerdo" | "saldo_anterior" | "recargo" | "cuenta_diaria" | "salida_interior",
      aplicado: a.aplicado,
      etiqueta: a.etiqueta,
      ref: undefined,
    })),
  });

  try {
    await recalcularRecargo(contratoId, fechaContable((p as { pagado_at: string }).pagado_at));
  } catch (e) {
    console.error("[guardarAsignaciones] recargo", e);
  }

  revalidatePath("/cartera/estados-cuenta");
  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  invalidarLecturaEstados();
  return { ok: true, msg: "Conceptos reasignados." };
}

/** Registra un pago anterior (u hoy) desde el historial. */
export async function agregarPagoHistorial(
  _prev: ResultadoEditarPago | null,
  formData: FormData,
): Promise<ResultadoEditarPago> {
  const contratoId = String(formData.get("contrato_id") ?? "").trim();
  const montoRaw = String(formData.get("monto") ?? "").replace(",", ".").trim();
  const fecha = String(formData.get("fecha") ?? "").trim() || hoyPanama();
  const hora = String(formData.get("hora") ?? "").trim() || "12:00";
  const metodo = String(formData.get("metodo") ?? "transferencia").trim().toLowerCase();
  const referencia = String(formData.get("referencia") ?? "").trim() || null;
  const notasExtra = String(formData.get("notas") ?? "").trim();

  if (!contratoId) return { ok: false, msg: "Falta el contrato." };
  const monto = Number(montoRaw);
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, msg: "Monto inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, msg: "Fecha inválida." };
  if (!METODOS_PAGO.has(metodo)) return { ok: false, msg: "Método inválido." };

  const sb = createServerSupabase();
  const { data: c, error: errC } = await sb
    .from("contratos")
    .select("id, cliente_id, vehiculo:vehiculos(numero)")
    .eq("id", contratoId)
    .maybeSingle();
  if (errC) return { ok: false, msg: errC.message };
  if (!c) return { ok: false, msg: "No encontré el contrato." };

  const numero =
    (c as { vehiculo?: { numero?: string } | null }).vehiculo?.numero ?? null;
  const pagadoAt = pagadoAtDesdeForm(fecha, hora);
  const notas = [
    `Pago agregado en estado de cuenta (${hoyPanama()}).`,
    notasExtra,
  ]
    .filter(Boolean)
    .join(" · ");

  const { data: inserted, error: errIns } = await sb
    .from("pagos")
    .insert({
      contrato_id: contratoId,
      cliente_id: (c as { cliente_id: string | null }).cliente_id,
      fecha,
      pagado_at: pagadoAt,
      monto,
      metodo,
      numero_carro: numero,
      origen: "manual",
      estado_conciliacion: "manual",
      referencia,
      notas,
    })
    .select("id")
    .single();
  if (errIns) return { ok: false, msg: errIns.message };

  const pagoId = (inserted as { id: string }).id;
  try {
    await aplicarPagoEnObligaciones(pagoId);
    await recalcularRecargo(contratoId, fecha);
  } catch (e) {
    console.error("[agregarPagoHistorial] aplicar", e);
    return {
      ok: false,
      msg: e instanceof Error ? e.message : "Creé el pago pero no pude aplicar el desglose.",
    };
  }

  revalidatePath("/cartera/estados-cuenta");
  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  invalidarLecturaEstados();
  return { ok: true, msg: "Pago agregado y aplicado." };
}

/** Elimina un pago del historial (revierte acuerdos y borra la fila). */
export async function eliminarPagoHistorial(
  pagoId: string,
  contratoId: string,
): Promise<ResultadoEditarPago> {
  const id = String(pagoId ?? "").trim();
  const cid = String(contratoId ?? "").trim();
  if (!id || !cid) return { ok: false, msg: "Faltan datos." };

  const sb = createServerSupabase();
  const { data: p, error } = await sb
    .from("pagos")
    .select("id, contrato_id, pagado_at, estado_conciliacion")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, msg: error.message };
  if (!p || (p as { contrato_id: string | null }).contrato_id !== cid) {
    return { ok: false, msg: "El pago no pertenece a este contrato." };
  }

  try {
    await revertirPagoEnObligaciones(id);
  } catch (e) {
    console.error("[eliminarPagoHistorial] revertir", e);
  }

  // Desvincular mensajes que apunten al pago
  await sb.from("mensajes").update({ pago_id: null }).eq("pago_id", id);

  const { error: errDel } = await sb.from("pagos").delete().eq("id", id);
  if (errDel) {
    // Fallback: marcar rechazado si hay FKs
    const { error: errUp } = await sb
      .from("pagos")
      .update({
        estado_conciliacion: "rechazado",
        asignaciones: null,
        notas: `Eliminado en estado de cuenta (${hoyPanama()}).`,
      })
      .eq("id", id);
    if (errUp) return { ok: false, msg: errDel.message };
  }

  try {
    await recalcularRecargo(cid, fechaContable((p as { pagado_at: string }).pagado_at));
  } catch (e) {
    console.error("[eliminarPagoHistorial] recargo", e);
  }

  revalidatePath("/cartera/estados-cuenta");
  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  invalidarLecturaEstados();
  return { ok: true, msg: "Pago eliminado." };
}

export type PreviewMensajeResultado = {
  ok: boolean;
  texto?: string;
  totalCobrarHoy?: number;
  seEnvia?: boolean;
  carro?: string;
  cliente?: string;
  alDia?: boolean;
  error?: string;
};

/**
 * Vista previa en vivo de la letra diaria (misma lógica del cron).
 * Recalcula el estado del contrato desde DB — refleja pagos y ajustes recién hechos.
 */
export async function previewMensajeLetraDiaria(
  contratoId: string,
): Promise<PreviewMensajeResultado> {
  const id = String(contratoId ?? "").trim();
  if (!id) return { ok: false, error: "Falta el contrato." };

  try {
    const { estadoCuentaContrato } = await import("@/lib/cartera/estado-cuenta");
    const { enrichExtracto } = await import("@/lib/cartera/envios");
    const {
      previewEstadoCuenta,
      estaAlDia,
      totalCobrarHoyExtracto,
    } = await import("@/lib/cartera/extracto-preview");
    const { etiquetaCarroUi } = await import("@/lib/cartera/empresa");

    const e = await estadoCuentaContrato(id);
    if (!e) return { ok: false, error: "No encontré el contrato." };

    const ctx = await enrichExtracto(e);
    const total = totalCobrarHoyExtracto(e, ctx);
    return {
      ok: true,
      texto: previewEstadoCuenta(e, ctx),
      totalCobrarHoy: total,
      seEnvia: total > 0.009,
      carro: etiquetaCarroUi(e.empresa, e.vehiculoNumero),
      cliente: e.clienteNombre,
      alDia: estaAlDia(e),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No pude armar el mensaje.",
    };
  }
}
