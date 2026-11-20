// Los pagos que sí cuentan (conciliado o manual) se leen una vez por armado
// del día. El recargo, el domingo, el adelanto de letra y los extras
// comparten esa lectura. La página guarda el resultado en la caché del día.

import { AsyncLocalStorage } from "node:async_hooks";
import { createServerSupabase } from "@/lib/supabase/server";

export type PagoConciliado = {
  id: string;
  contrato_id: string;
  fecha: string;
  monto: number;
  rubro: string | null;
  asignaciones: unknown;
};

type Caja = {
  ids: Set<string> | null;
  pagos: Promise<PagoConciliado[]> | null;
};

const lectura = new AsyncLocalStorage<Caja>();

export function conLectura<T>(fn: () => Promise<T>): Promise<T> {
  if (lectura.getStore()) return fn();
  return lectura.run({ ids: null, pagos: null }, fn);
}

async function leerPagos(ids: string[]): Promise<PagoConciliado[]> {
  if (ids.length === 0) return [];
  const sb = createServerSupabase();
  const rows: PagoConciliado[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb
      .from("pagos")
      .select("id, contrato_id, fecha, monto, rubro, asignaciones")
      .in("contrato_id", ids)
      .in("estado_conciliacion", ["conciliado", "manual"])
      .order("id", { ascending: true })
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as PagoConciliado[];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

/** Arranca la lectura de la flota. Las consultas de después reutilizan esta. */
export function prepararPagos(ids: string[]): Promise<PagoConciliado[]> {
  const limpios = [...new Set(ids.filter(Boolean))];
  const caja = lectura.getStore();
  if (!caja) return leerPagos(limpios);
  if (caja.pagos && caja.ids && limpios.every((id) => caja.ids?.has(id))) {
    return pagosDeLaLectura(limpios);
  }
  caja.ids = new Set(limpios);
  caja.pagos = leerPagos(limpios);
  return caja.pagos;
}

/** Los pagos ya leídos. Si piden un subconjunto, no se vuelve a ir a la base. */
export function pagosDeLaLectura(ids: string[]): Promise<PagoConciliado[]> {
  const limpios = [...new Set(ids.filter(Boolean))];
  const caja = lectura.getStore();
  if (!caja?.pagos || !caja.ids || !limpios.every((id) => caja.ids?.has(id))) {
    return leerPagos(limpios);
  }
  if (limpios.length === caja.ids.size) return caja.pagos;
  const quiero = new Set(limpios);
  return caja.pagos.then((rows) => rows.filter((r) => quiero.has(r.contrato_id)));
}
