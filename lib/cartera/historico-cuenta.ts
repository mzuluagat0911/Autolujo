// Histórico día a día de un contrato, desde que entra.
// El estado de cuenta de hoy no lista un recargo ya pagado. Acá sí: el día
// que se cargó y el día que se cubrió.

import { createServerSupabase } from "@/lib/supabase/server";
import { diasEntre, fechaConDia, hoyPanama, sumarDias } from "./fecha";
import {
  abrirSaldoConRecargo,
  atribuirRecargos,
  esCargoRecargoTarde,
  lineasAsignadas,
  type CargoRecargo,
} from "./recargo-cubierto";

export type EdicionHistorico = {
  nombre: string;
  cuando: string;
  correcciones: number;
};

export type FilaHistorico = {
  fecha: string;
  dia: string;
  cargos: string;
  pago: number;
  aplicado: string;
  recargos: string;
  debe: number;
  edicion: EdicionHistorico | null;
};

type CargoFila = {
  id: string;
  fecha: string;
  tipo: string;
  concepto: string | null;
  conceptoCodigo: string | null;
  monto: number;
  pagoId: string | null;
};

type PagoFila = {
  id: string;
  fecha: string;
  monto: number;
  estado: string;
  asignaciones: unknown;
};

function textoCuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function nombreDeMarca(concepto: string | null): string {
  const limpio = (concepto ?? "").replace(MARCA_QC, "").trim();
  const m = /^Editado por ([^·]+)/.exec(limpio);
  return m?.[1]?.trim() || "Equipo";
}

export const MARCA_QC = "[[qc]]";

export function esMarcaQc(c: { concepto?: string | null }): boolean {
  return (c.concepto ?? "").includes(MARCA_QC);
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  const v = r2(n);
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

function esCierre(c: { tipo?: string; concepto?: string | null; conceptoCodigo?: string | null }): boolean {
  const codigo = (c.conceptoCodigo ?? "").toUpperCase();
  return codigo === "CIERRE_SEMANA" || /cierre(\s+de)?\s+semana/i.test(c.concepto ?? "");
}

function esRecargo(c: CargoFila): boolean {
  return esCargoRecargoTarde(c) || esCierre(c);
}

function nombreCargo(c: CargoFila): string {
  const codigo = (c.conceptoCodigo ?? "").toUpperCase();
  const concepto = (c.concepto ?? "").replace(/\s*\[\[.*?\]\]\s*/g, " ").trim();
  if (c.tipo === "renta") return `Letra ${money(c.monto)}`;
  if (codigo === "DOMINGOS" || /^domingo/i.test(concepto)) return `Domingo ${money(c.monto)}`;
  if (codigo === "PANAPASS" || c.tipo === "panapass") return `Panapass ${money(c.monto)}`;
  if (codigo === "AFILIACION" || c.tipo === "afiliacion") return `Abono ${money(c.monto)}`;
  if (codigo === "PRESENCIAL" || /presencial/i.test(concepto)) return `Cobro presencial ${money(c.monto)}`;
  if (c.tipo === "exceso_km" || /kilometraje|exceso/i.test(concepto)) return `Exceso km ${money(c.monto)}`;
  if (/manten/i.test(concepto)) return `Mantenimiento ${money(c.monto)}`;
  const nombre = concepto || c.tipo || "Cargo";
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${money(c.monto)}`;
}

function textoRecargo(c: CargoFila, cubiertos: Set<string>): string {
  const nombre = esCierre(c) ? "Cierre" : "Recargo";
  const estado = c.pagoId || cubiertos.has(c.id) ? "pagado" : "pendiente";
  return `${nombre} ${money(c.monto)} · ${estado}`;
}

function textoAplicado(pago: PagoFila, partes: { etiqueta: string; aplicado: number }[]): string {
  if (pago.estado === "pendiente") return `${money(pago.monto)} en validación`;
  if (pago.estado === "rechazado") return "Rechazado";
  const lineas = abrirSaldoConRecargo(lineasAsignadas(pago.asignaciones), partes);
  if (lineas.length === 0) return money(pago.monto);
  return lineas.map((a) => `${money(a.aplicado)} ${a.etiqueta}`).join(" · ");
}

function cuentaEnSaldo(pago: PagoFila): boolean {
  return pago.estado === "conciliado" || pago.estado === "manual";
}

/** Una fila por día con cargo o pago, de la entrada del contrato hasta hoy. */
export function filasHistorico(opts: {
  cargos: CargoFila[];
  pagos: PagoFila[];
  cubiertos: Set<string>;
  partesPorPago: Map<string, { etiqueta: string; aplicado: number }[]>;
  desde?: string | null;
  saldoInicial?: number;
  ediciones?: Map<string, EdicionHistorico>;
}): FilaHistorico[] {
  const dias = new Map<string, { cargos: CargoFila[]; pagos: PagoFila[] }>();
  const asegurar = (fecha: string) => {
    const f = fecha.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
    const cur = dias.get(f) ?? { cargos: [], pagos: [] };
    dias.set(f, cur);
    return cur;
  };
  for (const c of opts.cargos) {
    if (c.monto <= 0.009) continue;
    asegurar(c.fecha)?.cargos.push(c);
  }
  for (const p of opts.pagos) {
    if (p.monto <= 0.009) continue;
    if (p.estado === "rechazado") continue;
    asegurar(p.fecha)?.pagos.push(p);
  }

  let debe = 0;
  const filas: FilaHistorico[] = [];
  const marca = (opts.desde ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(marca)) asegurar(marca);
  const claves = [...dias.keys()].sort();
  if (claves.length === 0) return filas;
  const desde = claves[0]!;
  const ultimo = claves[claves.length - 1]!;
  const hoy = hoyPanama();
  const hasta = ultimo > hoy ? ultimo : hoy;
  const total = diasEntre(desde, hasta);
  for (let i = 0; i <= total; i++) {
    const fecha = sumarDias(desde, i);
    const dia = dias.get(fecha) ?? { cargos: [], pagos: [] };
    const cargosDia = dia.cargos.filter((c) => !esRecargo(c));
    const recargosDia = dia.cargos.filter(esRecargo);
    const pagosDia = dia.pagos;
    const cargoMonto = r2(dia.cargos.reduce((s, c) => s + c.monto, 0));
    const saldoInicial = i === 0 ? r2(Math.max(Number(opts.saldoInicial) || 0, 0)) : 0;
    const pagoMonto = r2(
      pagosDia.filter(cuentaEnSaldo).reduce((s, p) => s + p.monto, 0),
    );
    debe = r2(debe + saldoInicial + cargoMonto - pagoMonto);
    const cargosTxt = [
      saldoInicial > 0.009 ? `Saldo inicial ${money(saldoInicial)}` : "",
      cargosDia.map(nombreCargo).join(" + "),
    ]
      .filter(Boolean)
      .join(" + ");
    filas.push({
      fecha,
      dia: fechaConDia(fecha),
      cargos: cargosTxt || "—",
      pago: r2(pagosDia.reduce((s, p) => s + p.monto, 0)),
      aplicado: pagosDia.length
        ? pagosDia.map((p) => textoAplicado(p, opts.partesPorPago.get(p.id) ?? [])).join(" · ")
        : "—",
      recargos: recargosDia.length ? recargosDia.map((c) => textoRecargo(c, opts.cubiertos)).join(" · ") : "—",
      debe,
      edicion: opts.ediciones?.get(fecha) ?? null,
    });
  }
  return filas;
}

export async function historicoDeContrato(
  contratoId: string,
): Promise<{ ok: true; filas: FilaHistorico[] } | { ok: false; error: string }> {
  const id = contratoId.trim();
  if (!id) return { ok: false, error: "Contrato inválido." };
  const sb = createServerSupabase();
  const [{ data: contrato, error: econ }, { data: cargos, error: ec }, { data: pagos, error: ep }] =
    await Promise.all([
    sb.from("contratos").select("fecha_inicio, saldo_inicial").eq("id", id).maybeSingle(),
    sb
      .from("cargos")
      .select("id, fecha, tipo, concepto, concepto_codigo, monto, pago_id, created_at")
      .eq("contrato_id", id)
      .order("created_at", { ascending: false }),
    sb
      .from("pagos")
      .select("id, fecha, monto, estado_conciliacion, asignaciones")
      .eq("contrato_id", id)
      .order("fecha"),
  ]);
  if (econ) return { ok: false, error: econ.message };
  if (ec) return { ok: false, error: ec.message };
  if (ep) return { ok: false, error: ep.message };

  const cargosCrudos = (cargos ?? []) as {
    id: string;
    fecha: string | null;
    tipo: string;
    concepto: string | null;
    concepto_codigo: string | null;
    monto: number;
    pago_id: string | null;
    created_at: string | null;
  }[];

  const ediciones = new Map<string, EdicionHistorico>();
  for (const m of cargosCrudos) {
    if (!esMarcaQc(m)) continue;
    const fecha = (m.fecha ?? "").slice(0, 10);
    if (!fecha) continue;
    const prev = ediciones.get(fecha);
    if (!prev) {
      ediciones.set(fecha, {
        nombre: nombreDeMarca(m.concepto),
        cuando: m.created_at ? textoCuando(m.created_at) : "",
        correcciones: 1,
      });
    } else {
      prev.correcciones += 1;
    }
  }

  const cargosFila: CargoFila[] = cargosCrudos.map((c) => ({
    id: c.id,
    fecha: c.fecha ?? "",
    tipo: c.tipo,
    concepto: c.concepto,
    conceptoCodigo: c.concepto_codigo,
    monto: Number(c.monto) || 0,
    pagoId: c.pago_id,
  })).filter((c) => !esMarcaQc(c));

  const pagosFila: PagoFila[] = ((pagos ?? []) as {
    id: string;
    fecha: string | null;
    monto: number;
    estado_conciliacion: string;
    asignaciones: unknown;
  }[]).map((p) => ({
    id: p.id,
    fecha: p.fecha ?? "",
    monto: Number(p.monto) || 0,
    estado: p.estado_conciliacion,
    asignaciones: p.asignaciones,
  }));

  const recargos: CargoRecargo[] = cargosFila.filter(esCargoRecargoTarde).map((c) => ({
    id: c.id,
    fecha: c.fecha,
    monto: c.monto,
    tipo: c.tipo,
    concepto: c.concepto,
    conceptoCodigo: c.conceptoCodigo,
    pagoId: c.pagoId,
  }));
  const { cubiertos, partesPorPago } = atribuirRecargos(
    recargos,
    pagosFila
      .filter(cuentaEnSaldo)
      .map((p) => ({ id: p.id, fecha: p.fecha, lineas: lineasAsignadas(p.asignaciones) })),
  );
  for (const c of cargosFila) {
    if (c.pagoId && esRecargo(c)) cubiertos.add(c.id);
  }

  return {
    ok: true,
    filas: filasHistorico({
      cargos: cargosFila,
      pagos: pagosFila,
      cubiertos,
      partesPorPago,
      desde: (contrato as { fecha_inicio?: string | null; saldo_inicial?: number | null } | null)?.fecha_inicio ?? null,
      saldoInicial: Number((contrato as { saldo_inicial?: number | null } | null)?.saldo_inicial) || 0,
      ediciones,
    }),
  };
}

export type CargoDelDia = {
  id: string;
  tipo: string;
  concepto: string;
  codigo: string | null;
  monto: number;
};

export type LineaDelDia = {
  tipo: string;
  aplicado: number;
};

export type PagoDelDia = {
  id: string;
  monto: number;
  estado: string;
  referencia: string | null;
  lineas: LineaDelDia[];
};

export async function movimientosDelDia(
  contratoId: string,
  fecha: string,
): Promise<{ ok: true; cargos: CargoDelDia[]; pagos: PagoDelDia[] } | { ok: false; error: string }> {
  const id = contratoId.trim();
  const dia = fecha.slice(0, 10);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { ok: false, error: "Día inválido." };
  const sb = createServerSupabase();
  const [{ data: cargos, error: ec }, { data: pagos, error: ep }] = await Promise.all([
    sb
      .from("cargos")
      .select("id, tipo, concepto, concepto_codigo, monto")
      .eq("contrato_id", id)
      .eq("fecha", dia)
      .order("created_at"),
    sb
      .from("pagos")
      .select("id, monto, estado_conciliacion, referencia, asignaciones")
      .eq("contrato_id", id)
      .eq("fecha", dia)
      .order("pagado_at"),
  ]);
  if (ec) return { ok: false, error: ec.message };
  if (ep) return { ok: false, error: ep.message };
  return {
    ok: true,
    cargos: ((cargos ?? []) as {
      id: string;
      tipo: string;
      concepto: string | null;
      concepto_codigo: string | null;
      monto: number;
    }[])
      .filter((c) => !esMarcaQc({ concepto_codigo: c.concepto_codigo }))
      .map((c) => ({
        id: c.id,
        tipo: c.tipo,
        concepto: (c.concepto ?? c.tipo).replace(/\s*\[\[.*?\]\]\s*/g, " ").trim(),
        codigo: c.concepto_codigo,
        monto: Number(c.monto) || 0,
      })),
    pagos: ((pagos ?? []) as {
      id: string;
      monto: number;
      estado_conciliacion: string;
      referencia: string | null;
      asignaciones: unknown;
    }[])
      .filter((p) => p.estado_conciliacion !== "rechazado")
      .map((p) => ({
        id: p.id,
        monto: Number(p.monto) || 0,
        estado: p.estado_conciliacion,
        referencia: p.referencia,
        lineas: lineasAsignadas(p.asignaciones).map((a) => ({
          tipo: a.tipo || "saldo_anterior",
          aplicado: a.aplicado,
        })),
      })),
  };
}
