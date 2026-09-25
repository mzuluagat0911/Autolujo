// Caché solo de la lectura del panel. Vive aparte porque estado-cuenta.ts
// también lo importa la tabla del navegador, y next/cache no puede ir ahí.
// El cron de cobro no pasa por aquí.

import { revalidateTag, unstable_cache } from "next/cache";
import { hoyPanama } from "./fecha";
import { estadosCuentaPanel as panelEnVivo } from "./estado-cuenta";

const PANEL_TAG = "estados-cuenta-panel";

const panelDesdeCache = unstable_cache(
  async (hoy: string) => {
    if (!hoy) return [];
    return panelEnVivo();
  },
  ["estados-cuenta-panel-v3"],
  { revalidate: 20, tags: [PANEL_TAG] },
);

/** Lectura del panel, 20 segundos. */
export async function estadosCuentaPanel() {
  return panelDesdeCache(hoyPanama());
}

/** Limpia la lectura del panel cuando cambia un pago, un cargo o el alcance. */
export function invalidarLecturaEstados() {
  revalidateTag(PANEL_TAG);
}
