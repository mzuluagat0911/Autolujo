// Lectura de Supabase para el asistente. Solo SELECT, tablas del módulo,
// y sin columnas de identidad, banco o secretos.

import { createServerSupabase } from "@/lib/supabase/server";
import type { ModuloId } from "@/lib/equipo/modulos";
import { puedeTabla, tablasDe } from "./catalogo";

const COL = /^[a-z_][a-z0-9_]*$/;
const SELECT_OK = /^[a-z0-9_*,.:()\s]+$/i;
const SENSIBLE =
  /cedula|telefono|whatsapp|wa_|_norm\b|tel_|direccion|referencia|numero_licencia|password|token|secret|api_key|comprobante_url|media_url|numero_cuenta|banco|cuenta_destino|iban|\bruc\b|representante/i;

// Teléfono de Panamá, cédula y números de cuenta dentro de un texto libre
// (un mensaje de WhatsApp, una nota). Se tapan antes de llegar al modelo.
const TEL = /(?:\+?507[\s-]?)?\b[2-9]\d{3}[\s-]?\d{4}\b/g;
const CEDULA = /\b(?:PE|E|N|\d{1,2})-\d{1,4}-\d{1,6}\b/gi;
const CUENTA = /\b\d{9,}\b/g;

function taparTexto(s: string): string {
  return s.replace(CEDULA, "[cédula]").replace(CUENTA, "[número]").replace(TEL, "[teléfono]");
}

export type Filtro = {
  columna: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "ilike" | "in" | "is";
  valor: string;
};

export type PedidoLectura = {
  tabla: string;
  columnas?: string;
  filtros?: Filtro[];
  orden?: { columna: string; asc?: boolean };
  limite?: number;
};

function tablaPedida(nombre: string, modulos: readonly ModuloId[]): string | { error: string } {
  const n = nombre.trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_]*$/.test(n)) return { error: "Esa tabla no existe." };
  if (!puedeTabla(modulos, n)) {
    const lista = tablasDe(modulos).map((t) => t.nombre).join(", ");
    return { error: `Esa tabla no está en la lista. Puedes leer: ${lista || "ninguna"}.` };
  }
  return n;
}

function columnasOk(columnas: string): string | { error: string } {
  const c = columnas.trim();
  if (!c || c.length > 400 || !SELECT_OK.test(c)) return { error: "Esas columnas no se pueden leer." };
  if (SENSIBLE.test(c)) return { error: "Esa columna no se consulta desde el asistente." };
  return c;
}

function filtrosOk(filtros: Filtro[] | undefined): Filtro[] | { error: string } {
  const lista = (filtros ?? []).slice(0, 8);
  for (const f of lista) {
    if (!COL.test(f.columna) || SENSIBLE.test(f.columna)) {
      return { error: "Ese filtro no se puede usar." };
    }
    if (typeof f.valor !== "string" || f.valor.length > 200) {
      return { error: "El valor del filtro es demasiado largo." };
    }
  }
  return lista;
}

function aplicarFiltros(q: any, filtros: Filtro[]): any {
  let out = q;
  for (const f of filtros) {
    if (f.op === "eq") out = out.eq(f.columna, f.valor);
    else if (f.op === "neq") out = out.neq(f.columna, f.valor);
    else if (f.op === "gt") out = out.gt(f.columna, f.valor);
    else if (f.op === "gte") out = out.gte(f.columna, f.valor);
    else if (f.op === "lt") out = out.lt(f.columna, f.valor);
    else if (f.op === "lte") out = out.lte(f.columna, f.valor);
    else if (f.op === "ilike") {
      const v = f.valor.includes("%") ? f.valor : `%${f.valor}%`;
      out = out.ilike(f.columna, v);
    } else if (f.op === "in") {
      const vals = f.valor.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
      out = out.in(f.columna, vals);
    } else if (f.op === "is") {
      out = out.is(f.columna, f.valor === "null" ? null : f.valor);
    }
  }
  return out;
}

function limpiar(value: unknown, clave = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => limpiar(v, clave));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSIBLE.test(k)) continue;
      out[k] = limpiar(v, k);
    }
    return out;
  }
  if (typeof value === "string" && clave !== "id" && !clave.endsWith("_id")) {
    if (clave === "panapass" || clave === "placa" || clave === "fecha_nacimiento") return value;
    return taparTexto(value);
  }
  return value;
}

/** Toda tabla anidada en el select (con alias, sin alias o con "..."), y la tiene que poder leer. */
function tablasEmbebidas(columnas: string, modulos: readonly ModuloId[]): string | null {
  const embebidas = [...columnas.matchAll(/([a-z_][a-z0-9_]*)\s*\(/gi)].map((m) => m[1].toLowerCase());
  for (const t of embebidas) {
    if (!puedeTabla(modulos, t)) return t;
  }
  return null;
}

export async function consultarTabla(modulos: readonly ModuloId[], pedido: PedidoLectura) {
  const tabla = tablaPedida(pedido.tabla, modulos);
  if (typeof tabla !== "string") return tabla;
  const select = columnasOk((pedido.columnas ?? "*").trim() || "*");
  if (typeof select !== "string") return select;
  const ajena = tablasEmbebidas(select, modulos);
  if (ajena) return { error: `La tabla ${ajena} no está en la lista.` };
  const filtros = filtrosOk(pedido.filtros);
  if (!Array.isArray(filtros)) return filtros;
  if (pedido.orden && (!COL.test(pedido.orden.columna) || SENSIBLE.test(pedido.orden.columna))) {
    return { error: "Esa columna no se puede ordenar." };
  }

  const limite = Math.min(Math.max(Math.round(pedido.limite ?? 20), 1), 40);
  const sb = createServerSupabase();
  let q = aplicarFiltros(sb.from(tabla).select(select), filtros);
  if (pedido.orden) q = q.order(pedido.orden.columna, { ascending: pedido.orden.asc !== false });
  const { data, error } = await q.limit(limite);
  if (error) return { error: `La consulta falló: ${taparTexto(error.message)}. Corrige y vuelve a intentar.` };
  const filas = ((data ?? []) as unknown[]).map((fila) => limpiar(fila));
  return { tabla, filas, n: filas.length, recortado: filas.length >= limite };
}

/** Columnas reales de una tabla (de una fila), sin las sensibles. */
export async function columnasDe(modulos: readonly ModuloId[], nombre: string) {
  const tabla = tablaPedida(nombre, modulos);
  if (typeof tabla !== "string") return tabla;
  const sb = createServerSupabase();
  const { data, error } = await sb.from(tabla).select("*").limit(1);
  if (error) return { error: `No pude leer las columnas: ${taparTexto(error.message)}` };
  const fila = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!fila) return { tabla, columnas: [], nota: "La tabla está vacía." };
  return { tabla, columnas: Object.keys(fila).filter((k) => !SENSIBLE.test(k)) };
}

export async function resumirTabla(
  modulos: readonly ModuloId[],
  pedido: { tabla: string; columna?: string; filtros?: Filtro[] },
) {
  const tabla = tablaPedida(pedido.tabla, modulos);
  if (typeof tabla !== "string") return tabla;
  const columna = (pedido.columna ?? "").trim();
  if (columna && (!COL.test(columna) || SENSIBLE.test(columna))) {
    return { error: "Esa columna no se puede resumir." };
  }
  const filtros = filtrosOk(pedido.filtros);
  if (!Array.isArray(filtros)) return filtros;

  const sb = createServerSupabase();
  if (!columna) {
    let q = sb.from(tabla).select("*", { count: "exact", head: true });
    q = aplicarFiltros(q, filtros);
    const { count, error } = await q;
    if (error) return { error: `El conteo falló: ${taparTexto(error.message)}. Corrige y vuelve a intentar.` };
    return { tabla, n: count ?? 0 };
  }

  const PAGE = 500;
  const TOPE = 2000;
  let desde = 0;
  let n = 0;
  let suma = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  while (desde < TOPE) {
    let q = sb.from(tabla).select(columna).range(desde, desde + PAGE - 1);
    q = aplicarFiltros(q, filtros);
    const { data, error } = await q;
    if (error) return { error: `La suma falló: ${taparTexto(error.message)}. Corrige y vuelve a intentar.` };
    const filas = (data ?? []) as unknown as Record<string, unknown>[];
    for (const fila of filas) {
      const v = Number(fila[columna]);
      if (!Number.isFinite(v)) continue;
      n += 1;
      suma += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (filas.length < PAGE) break;
    desde += PAGE;
  }
  return {
    tabla,
    columna,
    n,
    suma: Math.round(suma * 100) / 100,
    min: n ? min : null,
    max: n ? max : null,
    tope: desde + PAGE >= TOPE,
  };
}
