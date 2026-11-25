// Lectura del panel de cartera. Vive aparte de estado-cuenta.ts porque ese
// archivo lo importa la tabla del navegador, y next/cache no puede ir ahí.
// El cron de cobro (estadosCuentaHoy) no pasa por aquí: manda en vivo.
//
// Una sola entrada para toda la flota. No se anida otra caché adentro:
// eso deja la página colgada. Un abono vacía esta entrada y la siguiente
// visita la rearma una vez.

import { revalidateTag, unstable_cache } from "next/cache";
import type { EstadoCuentaFila } from "@/app/cartera/estados-cuenta/types";
import { cobroHoyDe } from "./cobro-hoy";
import {
  armarEstadosAlcance,
  gravedadSituacion,
  type EstadoCuenta,
} from "./estado-cuenta";
import { cargosExtraPorContrato, creditoLetraAdelantadaPorContrato, vistaAcuerdosPorContrato } from "./extracto-desglose";
import { hoyPanama } from "./fecha";
import { conLectura } from "./pagos-flota";

const TAG_DIA = "extracto-dia";
const HORAS = 60 * 60 * 18;

async function enriquecer(base: EstadoCuenta[]): Promise<EstadoCuentaFila[]> {
  const ids = base.map((e) => e.contratoId);
  const [vistaMap, extrasMap, creditoMap] = await Promise.all([
    vistaAcuerdosPorContrato(ids),
    cargosExtraPorContrato(ids),
    creditoLetraAdelantadaPorContrato(ids),
  ]);
  return base.map((e) => {
    const vista = vistaMap.get(e.contratoId);
    const extras = extrasMap.get(e.contratoId) ?? [];
    const cobro = cobroHoyDe(e, {
      acuerdoSaldo: vista?.saldo ?? 0,
      extras,
      enEspera: vista?.espera ?? [],
      planes: vista?.planes ?? [],
      creditoLetra: creditoMap.get(e.contratoId) ?? 0,
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

function ordenar(filas: EstadoCuentaFila[]): EstadoCuentaFila[] {
  return [...filas].sort((a, b) => gravedadSituacion(b) - gravedadSituacion(a));
}

const flotaDelDia = unstable_cache(
  async (hoy: string) => conLectura(async () => ordenar(await enriquecer(await armarEstadosAlcance()))),
  ["extracto-flota-v14"],
  { revalidate: HORAS, tags: [TAG_DIA] },
);

/** Extracto del día sin caché (informes / scripts). */
export async function estadosCuentaPanelVivo(): Promise<EstadoCuentaFila[]> {
  return conLectura(async () => ordenar(await enriquecer(await armarEstadosAlcance())));
}

/** Extracto del día. Una lectura; si se vació, se arma una vez. */
export async function estadosCuentaPanel(): Promise<EstadoCuentaFila[]> {
  try {
    return await flotaDelDia(hoyPanama());
  } catch {
    // Fuera de Next (scripts) o sin incrementalCache: misma flota en vivo.
    return estadosCuentaPanelVivo();
  }
}

/** Alta, pago, cargo, alcance o devengo: la siguiente visita rearma la flota. */
export async function invalidarLecturaEstados(_contratoId?: string | null) {
  revalidateTag(TAG_DIA);
}
