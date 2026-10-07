// Lectura del panel de cartera. Vive aparte de estado-cuenta.ts porque ese
// archivo lo importa la tabla del navegador, y next/cache no puede ir ahí.
// El cron de cobro (estadosCuentaHoy) no pasa por aquí: manda en vivo.
//
// La flota cabe en UNA entrada. Un abono no la rearma: anota ese contrato y
// el panel sustituye solo esa fila.

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
import { createServerSupabase } from "@/lib/supabase/server";

const TAG_DIA = "extracto-dia";
const TAG_SUCIOS = "extracto-sucios";
const HORAS = 60 * 60 * 18;
const TOPE_SUCIOS = 40;
const BUCKET = "comprobantes";
const PATH_SUCIOS = "sistema/extracto-sucios.json";

function tagContrato(id: string): string {
  return `extracto-${id}`;
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

function ordenar(filas: EstadoCuentaFila[]): EstadoCuentaFila[] {
  return [...filas].sort((a, b) => gravedadSituacion(b) - gravedadSituacion(a));
}

function mezclar(
  base: EstadoCuentaFila[],
  sucios: string[],
  parches: (EstadoCuentaFila | null)[],
): EstadoCuentaFila[] {
  const map = new Map(base.map((f) => [f.contratoId, f]));
  sucios.forEach((id, i) => {
    const p = parches[i];
    if (p) map.set(id, p);
  });
  return [...map.values()];
}

const flotaDelDia = unstable_cache(
  async (hoy: string) => ordenar(await enriquecer(await armarEstadosAlcance())),
  ["extracto-flota-v2"],
  { revalidate: HORAS, tags: [TAG_DIA] },
);

function cacheDeFila(hoy: string, id: string) {
  return unstable_cache(async () => filaViva(id), ["extracto-fila-v2", hoy, id], {
    revalidate: HORAS,
    tags: [tagContrato(id)],
  });
}

async function leerSucios(): Promise<string[]> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb.storage.from(BUCKET).download(PATH_SUCIOS);
    if (error || !data) return [];
    const json = JSON.parse(await data.text()) as { ids?: unknown };
    if (!Array.isArray(json.ids)) return [];
    return [...new Set(json.ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

async function guardarSucios(ids: string[]): Promise<boolean> {
  try {
    const sb = createServerSupabase();
    const body = JSON.stringify({ ids: [...new Set(ids)] });
    const { error } = await sb.storage.from(BUCKET).upload(PATH_SUCIOS, body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });
    return !error;
  } catch {
    return false;
  }
}

const suciosCache = unstable_cache(async () => leerSucios(), ["extracto-sucios-v2"], {
  revalidate: HORAS,
  tags: [TAG_SUCIOS],
});

function vistaPanel(hoy: string, firma: string) {
  return unstable_cache(
    async () => {
      const base = await flotaDelDia(hoy);
      if (!firma) return base;
      const ids = firma.split(",").filter(Boolean);
      const parches = await Promise.all(ids.map((id) => cacheDeFila(hoy, id)()));
      return ordenar(mezclar(base, ids, parches));
    },
    ["extracto-vista-v2", hoy, firma],
    { revalidate: HORAS, tags: [TAG_DIA, TAG_SUCIOS] },
  );
}

/** Extracto del día. Una sola lectura; los carros tocados se superponen. */
export async function estadosCuentaPanel(): Promise<EstadoCuentaFila[]> {
  const hoy = hoyPanama();
  const sucios = await suciosCache();
  const firma = [...new Set(sucios)].sort().join(",");
  return vistaPanel(hoy, firma)();
}

async function anotarSucio(id: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const prev = await leerSucios();
    if (prev.includes(id)) return;
    const next = [...prev, id];
    if (next.length > TOPE_SUCIOS) {
      await guardarSucios([]);
      revalidateTag(TAG_SUCIOS);
      revalidateTag(TAG_DIA);
      return;
    }
    if (!(await guardarSucios(next))) break;
    const ahora = await leerSucios();
    if (ahora.includes(id)) return;
  }
  revalidateTag(TAG_DIA);
}

/**
 * Sin contrato: se rearma la flota (alta, archivo, alcance, devengo).
 * Con contrato: solo ese carro (pago o cargo).
 */
export async function invalidarLecturaEstados(contratoId?: string | null) {
  const id = String(contratoId ?? "").trim();
  if (!id) {
    await guardarSucios([]);
    revalidateTag(TAG_SUCIOS);
    revalidateTag(TAG_DIA);
    return;
  }
  revalidateTag(tagContrato(id));
  await anotarSucio(id);
  revalidateTag(TAG_SUCIOS);
}
