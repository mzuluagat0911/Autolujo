// Historial de pagos de un contrato: monto, fecha y cómo se repartió
// (pagos.asignaciones — waterfall arreglo → saldo → recargo → cuota).

import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "./estado-cuenta";
import { fechaContable } from "./fecha";
import { textoComoSeAplico } from "./aplicar-pago";
import type { AsignacionPago, ResultadoPago } from "./types";

export type LineaAplicacion = {
  tipo: string;
  etiqueta: string;
  aplicado: number;
};

export type PagoHistorial = {
  id: string;
  fecha: string;
  pagadoAt: string;
  monto: number;
  metodo: string;
  banco: string | null;
  referencia: string | null;
  estado: string;
  origen: string | null;
  rubro: string | null;
  /** null = aún no se partió (pendiente / sin waterfall). */
  asignaciones: LineaAplicacion[] | null;
  sobrante: number;
  totalAplicado: number;
  /** Frase lista para UI. */
  resumenAplicacion: string | null;
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseResultado(raw: unknown): ResultadoPago | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as ResultadoPago;
  if (Array.isArray(o.asignaciones)) {
    return {
      asignaciones: o.asignaciones,
      sobrante: Number(o.sobrante) || 0,
      totalAplicado:
        Number(o.totalAplicado) ||
        r2(o.asignaciones.reduce((s, a) => s + (Number(a.aplicado) || 0), 0)),
    };
  }
  if (Array.isArray(raw)) {
    const asignaciones = raw as AsignacionPago[];
    const totalAplicado = r2(asignaciones.reduce((s, a) => s + (Number(a.aplicado) || 0), 0));
    return { asignaciones, sobrante: 0, totalAplicado };
  }
  return null;
}

const ETIQUETA_TIPO: Record<string, string> = {
  salida_interior: "salida al interior",
  acuerdo: "arreglo",
  saldo_anterior: "saldo anterior",
  recargo: "recargo",
  cuenta_diaria: "cuota de hoy",
};

function lineasDe(res: ResultadoPago): LineaAplicacion[] {
  return res.asignaciones
    .filter((a) => (Number(a.aplicado) || 0) > 0.009)
    .map((a) => ({
      tipo: a.tipo,
      etiqueta: (a.etiqueta?.trim() || ETIQUETA_TIPO[a.tipo] || a.tipo).trim(),
      aplicado: r2(Number(a.aplicado) || 0),
    }));
}

export function etiquetaMetodo(metodo: string | null | undefined): string {
  const m = (metodo ?? "").toLowerCase();
  if (m === "transferencia") return "Transferencia";
  if (m === "efectivo") return "Efectivo";
  if (m === "yappy") return "Yappy";
  if (m === "ach") return "ACH";
  if (m === "otro") return "Otro";
  return metodo?.trim() || "Pago";
}

export function etiquetaEstadoPago(estado: string | null | undefined): string {
  const e = (estado ?? "").toLowerCase();
  if (e === "conciliado") return "Conciliado";
  if (e === "manual") return "Manual";
  if (e === "pendiente") return "Pendiente";
  if (e === "rechazado") return "Rechazado";
  return estado?.trim() || "—";
}

/**
 * Últimos pagos del contrato (más recientes primero).
 * Incluye pendientes/rechazados para auditoría; el discriminado solo
 * aparece cuando ya hay `asignaciones` (conciliado/manual aplicados).
 */
export async function historialPagosContrato(
  contratoId: string,
  opts?: { limite?: number },
): Promise<PagoHistorial[]> {
  if (!contratoId) return [];
  const limite = Math.min(Math.max(opts?.limite ?? 80, 1), 200);
  const sb = createServerSupabase();

  let q = await sb
    .from("pagos")
    .select(
      "id, fecha, pagado_at, monto, metodo, banco, referencia, estado_conciliacion, origen, rubro, asignaciones",
    )
    .eq("contrato_id", contratoId)
    .order("pagado_at", { ascending: false })
    .limit(limite);

  if (q.error && /asignaciones|rubro|origen/i.test(q.error.message)) {
    q = await sb
      .from("pagos")
      .select("id, fecha, pagado_at, monto, metodo, banco, referencia, estado_conciliacion")
      .eq("contrato_id", contratoId)
      .order("pagado_at", { ascending: false })
      .limit(limite);
  }
  if (q.error) {
    console.error("[historial-pagos]", q.error.message);
    return [];
  }

  const rows = (q.data ?? []) as {
    id: string;
    fecha: string;
    pagado_at: string;
    monto: number;
    metodo: string;
    banco: string | null;
    referencia: string | null;
    estado_conciliacion: string;
    origen?: string | null;
    rubro?: string | null;
    asignaciones?: unknown;
  }[];

  return rows.map((p) => {
    const parsed = parseResultado(p.asignaciones);
    const asignaciones = parsed ? lineasDe(parsed) : null;
    const sobrante = parsed ? r2(parsed.sobrante) : 0;
    const totalAplicado = parsed ? r2(parsed.totalAplicado) : 0;
    return {
      id: p.id,
      fecha: p.fecha || fechaContable(p.pagado_at),
      pagadoAt: p.pagado_at,
      monto: Number(p.monto) || 0,
      metodo: p.metodo,
      banco: p.banco,
      referencia: p.referencia,
      estado: p.estado_conciliacion,
      origen: p.origen ?? null,
      rubro: p.rubro ?? null,
      asignaciones,
      sobrante,
      totalAplicado,
      resumenAplicacion: parsed ? textoComoSeAplico(parsed, money) : null,
    };
  });
}
