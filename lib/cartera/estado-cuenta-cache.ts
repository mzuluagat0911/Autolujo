// Lectura del panel de cartera. Vive aparte de estado-cuenta.ts porque ese
// archivo lo importa la tabla del navegador, y next/cache no puede ir ahí.
// El cron de cobro (estadosCuentaHoy) no pasa por aquí: manda en vivo.

import { revalidateTag, unstable_cache } from "next/cache";
import type { EstadoCuentaFila } from "@/app/cartera/estados-cuenta/types";
import { cobroHoyDe } from "./cobro-hoy";
import {
  armarEstadosAlcance,
  estadoCuentaContrato,
  gravedadSituacion,
  type EstadoCuenta,
} from "./estado-cuenta";
import { cargosExtraPorContrato, vistaAcuerdosPorContrato } from "./extracto-desglose";
import { hoyPanama } from "./fecha";

const TAG_DIA = "extracto-dia";
const HORAS = 60 * 60 * 18;

function tagContrato(id: string): string {
  return `extracto-${id}`;
}

/** Filas recién armadas en este proceso, para guardarlas en la caché sin recalcular. */
const semilla = new Map<string, EstadoCuentaFila>();

function clave(hoy: string, id: string): string {
  return `${hoy}:${id}`;
}

async function enriquecer(base: EstadoCuenta[]): Promise<EstadoCuentaFila[]> {
  const ids = base.map((e) => e.contratoId);
  const [vistaMap, extrasMap] = await Promise.all([
    vistaAcuerdosPorContrato(ids),
    cargosExtraPorContrato(ids),
  ]);
  return base.map((e) => {
    const vista = vistaMap.get(e.contratoId);
    const extras = extrasMap.get(e.contratoId) ?? [];
    const cobro = cobroHoyDe(e, {
      acuerdoSaldo: vista?.saldo ?? 0,
      extras,
      enEspera: vista?.espera ?? [],
      planes: vista?.planes ?? [],
    });
    return {
      ...e,
      acuerdoSaldo: vista?.saldo ?? 0,
      planesAcuerdo: vista?.planes ?? [],
      extras,
      totalCobrarHoy: cobro.totalCobrarHoy,
      lineasCobro: cobro.lineas,
      desgloseCobro: cobro.desglose,
    };
  });
}

async function filaViva(id: string): Promise<EstadoCuentaFila | null> {
  const estado = await estadoCuentaContrato(id);
  if (!estado) return null;
  const [fila] = await enriquecer([estado]);
  return fila ?? null;
}

function cacheDeFila(hoy: string, id: string) {
  return unstable_cache(
    async () => {
      const lista = semilla.get(clave(hoy, id));
      if (lista) return lista;
      return filaViva(id);
    },
    ["extracto-fila-v1", hoy, id],
    { revalidate: HORAS, tags: [TAG_DIA, tagContrato(id)] },
  );
}

const indiceDelDia = unstable_cache(
  async (hoy: string) => {
    const filas = await enriquecer(await armarEstadosAlcance());
    for (const f of filas) semilla.set(clave(hoy, f.contratoId), f);
    return filas.map((f) => f.contratoId);
  },
  ["extracto-indice-v1"],
  { revalidate: HORAS, tags: [TAG_DIA] },
);

/** Extracto del día. La flota sale de caché; un carro invalidado se rearma solo. */
export async function estadosCuentaPanel(): Promise<EstadoCuentaFila[]> {
  const hoy = hoyPanama();
  const ids = await indiceDelDia(hoy);
  const filas = await Promise.all(ids.map((id) => cacheDeFila(hoy, id)()));
  for (const id of ids) semilla.delete(clave(hoy, id));
  return filas
    .filter((f): f is EstadoCuentaFila => f != null)
    .sort((a, b) => gravedadSituacion(b) - gravedadSituacion(a));
}

/**
 * Sin contrato: se rearma la flota (alta, archivo, alcance, devengo).
 * Con contrato: solo ese carro (pago o cargo).
 */
export function invalidarLecturaEstados(contratoId?: string | null) {
  const id = String(contratoId ?? "").trim();
  if (id) {
    revalidateTag(tagContrato(id));
    return;
  }
  revalidateTag(TAG_DIA);
}
