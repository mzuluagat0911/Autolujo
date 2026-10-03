// El recargo de las 7 p.m. vive dentro del saldo. Un pago que lo cubre con
// “saldo anterior” no lo nombra, y un recargo ya amarrado a su pago (pago_id)
// no debe tapar el siguiente. Acá se cruza cada multa con el pago que la cubrió.

export type CargoRecargo = {
  id: string;
  fecha: string;
  monto: number;
  tipo: string;
  concepto: string | null;
  conceptoCodigo: string | null;
  pagoId: string | null;
};

export type LineaAplicada = {
  tipo: string;
  etiqueta: string;
  aplicado: number;
};

export type PagoParaRecargo = {
  id: string;
  fecha: string;
  lineas: LineaAplicada[];
};

export type ParteRecargo = {
  etiqueta: string;
  aplicado: number;
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function esCargoRecargoTarde(c: {
  tipo?: string | null;
  concepto?: string | null;
  conceptoCodigo?: string | null;
  concepto_codigo?: string | null;
}): boolean {
  const codigo = (c.conceptoCodigo ?? c.concepto_codigo ?? "").toUpperCase();
  const concepto = c.concepto ?? "";
  if (codigo === "CIERRE_SEMANA" || /cierre(\s+de)?\s+semana/i.test(concepto)) return false;
  if (codigo === "PAGO_TARDE") return true;
  return (c.tipo ?? "") === "multa" && /recargo|por no pagar|pago despu[eé]s/i.test(concepto);
}

export function esLineaRecargoTarde(a: { tipo?: string | null; etiqueta?: string | null }): boolean {
  const tipo = (a.tipo ?? "").toLowerCase();
  const et = a.etiqueta ?? "";
  if (tipo === "cierre_semana" || /cierre(\s+de)?\s+semana/i.test(et)) return false;
  if (tipo === "recargo") return true;
  return /recargo|por no pagar/i.test(et);
}

export function esLineaSaldoAnterior(a: { tipo?: string | null; etiqueta?: string | null }): boolean {
  const tipo = (a.tipo ?? "").toLowerCase();
  if (tipo === "saldo_anterior") return true;
  return (a.etiqueta ?? "").trim().toLowerCase() === "saldo anterior";
}

export function lineasAsignadas(raw: unknown): LineaAplicada[] {
  if (!raw) return [];
  const lista = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { asignaciones?: unknown }).asignaciones)
      ? (raw as { asignaciones: unknown[] }).asignaciones
      : [];
  const out: LineaAplicada[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const a = item as { tipo?: string; etiqueta?: string; aplicado?: number };
    const aplicado = r2(Number(a.aplicado) || 0);
    if (aplicado <= 0.009) continue;
    out.push({
      tipo: (a.tipo ?? "").trim(),
      etiqueta: (a.etiqueta ?? "").trim(),
      aplicado,
    });
  }
  return out;
}

function etiquetaDeCargo(concepto: string | null): string {
  const c = (concepto ?? "").trim();
  if (!c || /^recargo$/i.test(c)) return "recargo";
  return `recargo (${c})`;
}

/**
 * Cruza las multas de recargo con los pagos, del más viejo al más nuevo.
 * Un cargo con pago_id ya quedó cerrado por ese pago: no se vuelve a restar.
 * Lo que un pago metió en “saldo anterior” y en realidad era recargo vuelve
 * en `partesPorPago`, para mostrarlo con su nombre.
 */
export function atribuirRecargos(
  cargos: CargoRecargo[],
  pagos: PagoParaRecargo[],
): {
  abierto: number;
  cubiertos: Set<string>;
  partesPorPago: Map<string, ParteRecargo[]>;
} {
  const amarrados = new Set<string>();
  const abiertos: { id: string; fecha: string; concepto: string | null; resta: number }[] = [];
  for (const c of cargos) {
    if (!esCargoRecargoTarde(c)) continue;
    const monto = r2(Math.max(Number(c.monto) || 0, 0));
    if (monto <= 0.009) continue;
    if (c.pagoId) {
      amarrados.add(c.pagoId);
      continue;
    }
    abiertos.push({ id: c.id, fecha: (c.fecha ?? "").slice(0, 10), concepto: c.concepto, resta: monto });
  }
  abiertos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));

  const partesPorPago = new Map<string, ParteRecargo[]>();
  const ordenados = [...pagos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));

  function tomar(
    monto: number,
    fechaPago: string,
    soloAnteriores: boolean,
    anotar: boolean,
    pagoId: string,
  ): void {
    let queda = r2(Math.max(monto, 0));
    if (queda <= 0.009) return;
    const partes: ParteRecargo[] = [];
    for (const c of abiertos) {
      if (queda <= 0.009) break;
      if (c.resta <= 0.009) continue;
      if (soloAnteriores ? c.fecha >= fechaPago : c.fecha > fechaPago) continue;
      const toma = r2(Math.min(c.resta, queda));
      if (toma <= 0.009) continue;
      c.resta = r2(c.resta - toma);
      queda = r2(queda - toma);
      if (anotar) partes.push({ etiqueta: etiquetaDeCargo(c.concepto), aplicado: toma });
    }
    if (anotar && partes.length > 0) partesPorPago.set(pagoId, partes);
  }

  for (const p of ordenados) {
    const fecha = (p.fecha ?? "").slice(0, 10);
    const explicito = r2(
      p.lineas.filter(esLineaRecargoTarde).reduce((s, a) => s + a.aplicado, 0),
    );
    if (!amarrados.has(p.id)) tomar(explicito, fecha, false, false, p.id);
    const saldo = r2(p.lineas.filter(esLineaSaldoAnterior).reduce((s, a) => s + a.aplicado, 0));
    tomar(saldo, fecha, true, true, p.id);
  }

  const cubiertos = new Set<string>();
  for (const c of cargos) {
    if (c.pagoId && esCargoRecargoTarde(c)) cubiertos.add(c.id);
  }
  let abierto = 0;
  for (const c of abiertos) {
    if (c.resta <= 0.009) cubiertos.add(c.id);
    else abierto = r2(abierto + c.resta);
  }
  return { abierto, cubiertos, partesPorPago };
}

/** Parte la línea de saldo anterior para que el recargo se lea con su nombre. */
export function abrirSaldoConRecargo(lineas: LineaAplicada[], partes: ParteRecargo[]): LineaAplicada[] {
  if (partes.length === 0) return lineas;
  const cola = partes.map((p) => ({ ...p }));
  const out: LineaAplicada[] = [];
  for (const l of lineas) {
    if (!esLineaSaldoAnterior(l) || cola.length === 0) {
      out.push(l);
      continue;
    }
    let resta = l.aplicado;
    while (cola.length > 0 && resta > 0.009) {
      const p = cola[0]!;
      const toma = r2(Math.min(resta, p.aplicado));
      if (toma <= 0.009) {
        cola.shift();
        continue;
      }
      out.push({ tipo: "recargo", etiqueta: p.etiqueta, aplicado: toma });
      resta = r2(resta - toma);
      p.aplicado = r2(p.aplicado - toma);
      if (p.aplicado <= 0.009) cola.shift();
    }
    if (resta > 0.009) out.push({ ...l, aplicado: resta });
  }
  return out;
}
