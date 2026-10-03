// Historial de pagos de un contrato: monto, fecha y cómo se repartió
// (pagos.asignaciones — waterfall arreglo → saldo → recargo → cuota).

import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "./estado-cuenta";
import { fechaContable } from "./fecha";
import { textoComoSeAplico } from "./aplicar-pago";
import { abrirSaldoConRecargo, atribuirRecargos, lineasAsignadas } from "./recargo-cubierto";
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
  /** null = aún no se partió (pendiente / sin waterfall). Tal como quedó guardado. */
  asignaciones: LineaAplicacion[] | null;
  /** Lo que ve el equipo: el saldo anterior abre el recargo que iba adentro. */
  lineasVista: LineaAplicacion[] | null;
  sobrante: number;
  totalAplicado: number;
  /** Frase lista para UI. El saldo anterior ya abre el recargo que iba adentro. */
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

  const full = await sb
    .from("pagos")
    .select(
      "id, fecha, pagado_at, monto, metodo, banco, referencia, estado_conciliacion, origen, rubro, asignaciones",
    )
    .eq("contrato_id", contratoId)
    .order("pagado_at", { ascending: false })
    .limit(limite);

  let rows: {
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
  }[] = [];

  if (full.error && /asignaciones|rubro|origen/i.test(full.error.message)) {
    const basic = await sb
      .from("pagos")
      .select("id, fecha, pagado_at, monto, metodo, banco, referencia, estado_conciliacion")
      .eq("contrato_id", contratoId)
      .order("pagado_at", { ascending: false })
      .limit(limite);
    if (basic.error) {
      console.error("[historial-pagos]", basic.error.message);
      return [];
    }
    rows = (basic.data ?? []) as typeof rows;
  } else if (full.error) {
    console.error("[historial-pagos]", full.error.message);
    return [];
  } else {
    rows = (full.data ?? []) as typeof rows;
  }

  const partesPorPago = await partesRecargoDelContrato(contratoId);

  return rows.map((p) => {
    const parsed = parseResultado(p.asignaciones);
    const asignaciones = parsed ? lineasDe(parsed) : null;
    const partes = partesPorPago.get(p.id) ?? [];
    const lineasVista = asignaciones ? abrirSaldoConRecargo(asignaciones, partes) : null;
    const sobrante = parsed ? r2(parsed.sobrante) : 0;
    const totalAplicado = parsed ? r2(parsed.totalAplicado) : 0;
    const vista = lineasVista
      ? {
          asignaciones: lineasVista.map((a) => ({
            tipo: a.tipo as ResultadoPago["asignaciones"][number]["tipo"],
            aplicado: a.aplicado,
            etiqueta: a.etiqueta,
          })),
          sobrante,
          totalAplicado,
        }
      : null;
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
      lineasVista,
      sobrante,
      totalAplicado,
      resumenAplicacion: vista ? textoComoSeAplico(vista, money) : null,
    };
  });
}

/** Recargo que cada pago tapó dentro del saldo anterior. Usa todo el historial, no solo la página. */
async function partesRecargoDelContrato(contratoId: string) {
  const sb = createServerSupabase();
  const [{ data: cargos }, { data: pagos }] = await Promise.all([
    sb
      .from("cargos")
      .select("id, fecha, monto, tipo, concepto, concepto_codigo, pago_id")
      .eq("contrato_id", contratoId)
      .eq("tipo", "multa"),
    sb
      .from("pagos")
      .select("id, fecha, asignaciones")
      .eq("contrato_id", contratoId)
      .in("estado_conciliacion", ["conciliado", "manual"]),
  ]);
  const { partesPorPago } = atribuirRecargos(
    ((cargos ?? []) as {
      id: string;
      fecha: string | null;
      monto: number;
      tipo: string;
      concepto: string | null;
      concepto_codigo: string | null;
      pago_id: string | null;
    }[]).map((c) => ({
      id: c.id,
      fecha: c.fecha ?? "",
      monto: Number(c.monto) || 0,
      tipo: c.tipo,
      concepto: c.concepto,
      conceptoCodigo: c.concepto_codigo,
      pagoId: c.pago_id,
    })),
    ((pagos ?? []) as { id: string; fecha: string | null; asignaciones: unknown }[]).map((p) => ({
      id: p.id,
      fecha: p.fecha ?? "",
      lineas: lineasAsignadas(p.asignaciones),
    })),
  );
  return partesPorPago;
}
