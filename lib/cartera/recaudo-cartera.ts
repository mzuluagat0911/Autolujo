// Recaudo de cartera: TODO ingreso conciliado/manual cuenta (letra, panapass,
// acuerdo, ex cliente, etc.). Sin filtrar por rubro ni exigir contrato.

import { createServerSupabase } from "@/lib/supabase/server";
import { PAGADO } from "./pagos-dia";
import { siglaEmpresa } from "./empresa";

export type PagoRecaudo = {
  fecha: string;
  monto: number;
  /** Código de empresa en base (AUTOLUJO / KOWUA / GOLD) o "—". */
  empresa: string;
  empresaId: string | null;
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Intenta empresa desde el # de carro (KW105, AL-12, G10…). */
function empresaDesdeCarro(numero: string | null | undefined): string {
  const t = (numero ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return "—";
  if (/^(KW|KOWUA)/.test(t)) return "KOWUA";
  if (/^(AL|AUTOLUJO)/.test(t)) return "AUTOLUJO";
  if (/^(GD|GOLD)/.test(t) || /^G\d/.test(t)) return "GOLD";
  return "—";
}

/**
 * Todos los pagos que cuentan para la meta / panel de cartera en el rango.
 * Pagina con order estable (PostgREST corta en 1.000).
 */
export async function pagosRecaudoEntre(desde: string, hasta: string): Promise<PagoRecaudo[]> {
  const sb = createServerSupabase();
  const out: PagoRecaudo[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from("pagos")
      .select(
        "fecha, monto, numero_carro, contrato:contratos(empresa_id, empresa:empresas(codigo))",
      )
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .in("estado_conciliacion", [...PAGADO])
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    const chunk = (data ?? []) as unknown as {
      fecha: string;
      monto: number | null;
      numero_carro: string | null;
      contrato:
        | {
            empresa_id: string | null;
            empresa: { codigo: string } | { codigo: string }[] | null;
          }
        | {
            empresa_id: string | null;
            empresa: { codigo: string } | { codigo: string }[] | null;
          }[]
        | null;
    }[];
    for (const p of chunk) {
      const c = uno(p.contrato);
      const emp = uno(c?.empresa);
      const codigo = (emp?.codigo ?? "").trim().toUpperCase();
      out.push({
        fecha: p.fecha,
        monto: Number(p.monto) || 0,
        empresa: codigo || empresaDesdeCarro(p.numero_carro),
        empresaId: c?.empresa_id ?? null,
      });
    }
    if (chunk.length < 1000) break;
  }
  return out;
}

/** Suma bruta de ingresos de cartera (meta del Resumen). */
export async function sumaRecaudoEntre(desde: string, hasta: string): Promise<number> {
  const filas = await pagosRecaudoEntre(desde, hasta);
  return r2(filas.reduce((a, p) => a + p.monto, 0));
}

export function filtroEmpresaRecaudo(
  filas: PagoRecaudo[],
  empresaIds: string[] | null,
): PagoRecaudo[] {
  if (!empresaIds?.length) return filas;
  const set = new Set(empresaIds);
  return filas.filter((p) => p.empresaId && set.has(p.empresaId));
}

export function siglaDeCodigoEmpresa(codigo: string): string {
  return siglaEmpresa(codigo) || codigo || "—";
}
