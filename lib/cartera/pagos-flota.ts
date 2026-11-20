// Los pagos que sí cuentan se leen una vez por armado del día.
// Solo lo importa el servidor (la caché y el envío). El navegador no llega acá.

import { AsyncLocalStorage } from "node:async_hooks";
import { leerPagosDirecto } from "./pagos-leer";
import { usarLecturaDePagos, type PagoConciliado } from "./pagos-puente";

type Caja = {
  ids: Set<string> | null;
  pagos: Promise<PagoConciliado[]> | null;
};

const lectura = new AsyncLocalStorage<Caja>();

export function conLectura<T>(fn: () => Promise<T>): Promise<T> {
  if (lectura.getStore()) return fn();
  return lectura.run({ ids: null, pagos: null }, fn);
}

function pagosDeLaLectura(ids: string[]): Promise<PagoConciliado[]> {
  const limpios = [...new Set(ids.filter(Boolean))];
  const caja = lectura.getStore();
  if (!caja?.pagos || !caja.ids || !limpios.every((id) => caja.ids?.has(id))) {
    return leerPagosDirecto(limpios);
  }
  if (limpios.length === caja.ids.size) return caja.pagos;
  const quiero = new Set(limpios);
  return caja.pagos.then((rows) => rows.filter((r) => quiero.has(r.contrato_id)));
}

function prepararPagos(ids: string[]): Promise<PagoConciliado[]> {
  const limpios = [...new Set(ids.filter(Boolean))];
  const caja = lectura.getStore();
  if (!caja) return leerPagosDirecto(limpios);
  if (caja.pagos && caja.ids && limpios.every((id) => caja.ids?.has(id))) {
    return pagosDeLaLectura(limpios);
  }
  caja.ids = new Set(limpios);
  caja.pagos = leerPagosDirecto(limpios);
  return caja.pagos;
}

usarLecturaDePagos(pagosDeLaLectura, prepararPagos);
