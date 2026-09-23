"use server";

import { revalidatePath } from "next/cache";
import { invalidarLecturaEstados } from "@/lib/cartera/estado-cuenta";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
import { enviarEstadoCuentaPrueba } from "@/lib/cartera/envios";
import type { FrecuenciaAcuerdo } from "@/lib/cartera/acuerdo";

const FRECUENCIAS_OK = new Set<FrecuenciaAcuerdo>([
  "dia",
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
      if (error && /frecuencia|fecha_especifica/i.test(error.message)) {
        const { frecuencia: _f, fecha_especifica: _fe, ...sin } = body;
        const retry = await sb.from("acuerdos").update(sin).eq("id", a.id).eq("contrato_id", contratoId);
        if (retry.error) return { ok: false, error: `Actualizar acuerdo: ${retry.error.message}` };
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
      if (error && /frecuencia|fecha_especifica/i.test(error.message)) {
        const { frecuencia: _f, fecha_especifica: _fe, ...sin } = insertBody;
        const retry = await sb.from("acuerdos").insert(sin);
        if (retry.error) return { ok: false, error: `Crear acuerdo: ${retry.error.message}` };
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
