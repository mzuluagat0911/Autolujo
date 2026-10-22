// Lo que se edita en Ajustar cuenta: cargos que todavía no cubrió un pago.
// El histórico sigue mostrando el cargo aunque acá ya no aparezca.

import { etiquetaCargo } from "./extracto-desglose";
import { atribuirRecargos, lineasAsignadas } from "./recargo-cubierto";
import { cubetaDeConcepto } from "./rubros-pago";

export type CargoAjustable = {
  id: string;
  fecha: string;
  tipo: string;
  concepto: string | null;
  concepto_codigo: string | null;
  monto: number;
  pago_id?: string | null;
};

function cubetaDeAsignacion(a: { tipo?: string; etiqueta?: string }): string | null {
  const cubeta = cubetaDeConcepto(a.tipo ?? "", a.etiqueta);
  if (cubeta === "por no pagar") return "recargo";
  if (cubeta) return cubeta;
  const tipo = (a.tipo ?? "").toLowerCase();
  const et = (a.etiqueta ?? "").trim().toLowerCase();
  if (tipo === "acuerdo") return null;
  if (!et || et === "saldo anterior" || et.startsWith("cuota") || et.startsWith("letra")) return null;
  return et;
}

/** El cierre dice "Recargo…" pero no es el recargo de las 7. Va en su propio balde. */
export function cubetaDeCargoAjuste(c: {
  tipo: string;
  concepto: string | null;
  concepto_codigo: string | null;
}): string | null {
  if (c.tipo === "acuerdo") return null;
  const codigo = (c.concepto_codigo ?? "").toUpperCase();
  const concepto = c.concepto ?? "";
  if (codigo === "CIERRE_SEMANA" || /cierre(\s+de)?\s+semana/i.test(concepto)) return "cierre de semana";
  if (codigo === "PAGO_TARDE") return "recargo";
  if (c.tipo === "multa" && /recargo|por no pagar|pago despu[eé]s/i.test(concepto)) return "recargo";
  if (codigo === "AFILIACION" || c.tipo === "afiliacion") return "abono inicial";
  const et = etiquetaCargo(c.concepto, c.concepto_codigo, c.tipo);
  return cubetaDeConcepto("", et) ?? et.toLowerCase();
}

/** Cargos ya cubiertos por un pago no se editan acá: siguen en el libro, no en la lista. */
export function cargosPendientesActivos<T extends CargoAjustable>(
  cargos: T[],
  pagos: { id?: string; fecha?: string | null; asignaciones: unknown }[],
): T[] {
  const cover = new Map<string, number>();
  for (const p of pagos) {
    const raw = p.asignaciones as
      | { asignaciones?: { tipo?: string; etiqueta?: string; aplicado?: number }[] }
      | { tipo?: string; etiqueta?: string; aplicado?: number }[]
      | null;
    const lineas = Array.isArray(raw) ? raw : (raw?.asignaciones ?? []);
    for (const a of lineas) {
      const key = cubetaDeAsignacion(a);
      if (!key) continue;
      cover.set(key, (cover.get(key) ?? 0) + Math.max(Number(a.aplicado) || 0, 0));
    }
  }
  const cruzado = atribuirRecargos(
    cargos.map((c) => ({
      id: c.id,
      fecha: c.fecha ?? "",
      monto: Number(c.monto) || 0,
      tipo: c.tipo,
      concepto: c.concepto,
      conceptoCodigo: c.concepto_codigo,
      pagoId: c.pago_id ?? null,
    })),
    pagos.map((p, i) => ({
      id: p.id || `pago-${i}`,
      fecha: p.fecha ?? "",
      lineas: lineasAsignadas(p.asignaciones),
    })),
  );
  const hidden = new Set<string>(cruzado.cubiertos);
  const ordered = [...cargos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  for (const c of ordered) {
    if (c.pago_id) {
      hidden.add(c.id);
      continue;
    }
    if (c.tipo === "acuerdo") {
      hidden.add(c.id);
      continue;
    }
    const key = cubetaDeCargoAjuste(c);
    if (!key) continue;
    const monto = Number(c.monto) || 0;
    const disponible = cover.get(key) ?? 0;
    if (monto > 0.009 && disponible + 0.009 >= monto) {
      cover.set(key, Math.round((disponible - monto) * 100) / 100);
      hidden.add(c.id);
    }
  }
  return cargos.filter((c) => !hidden.has(c.id));
}
