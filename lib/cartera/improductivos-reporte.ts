// Carros que no producen y el extracto del día no trae: improductivo
// y por entregar (un carro por entregar sigue siendo improductivo).
// El reporte los agrega al final, con el mismo desglose.

import type { EstadoCuentaFila } from "@/app/cartera/estados-cuenta/types";
import { cobroHoyDe, ctxCobroHoy } from "./cobro-hoy";
import { estadoCuentaContrato } from "./estado-cuenta";
import { createServerSupabase } from "@/lib/supabase/server";

type ContratoMini = { id: string; estado: string; fecha_inicio: string | null };

function elegirContrato(contratos: ContratoMini[]): string | null {
  const activo = contratos.find((c) => c.estado === "activo");
  if (activo) return activo.id;
  const ordenados = [...contratos].sort((a, b) =>
    (b.fecha_inicio ?? "").localeCompare(a.fecha_inicio ?? ""),
  );
  return ordenados[0]?.id ?? null;
}

const ESTADOS_SIN_PRODUCIR = ["improductivo", "por_entregar"] as const;

/** Ids de contrato de cada carro improductivo o por entregar, y las filas que el panel no tiene. */
export async function reporteImproductivos(yaEnPanel: string[]): Promise<{
  ids: string[];
  porEntregarIds: string[];
  extra: EstadoCuentaFila[];
}> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("id, estado, contratos(id, estado, fecha_inicio)")
    .in("estado", [...ESTADOS_SIN_PRODUCIR]);
  if (error) throw new Error(error.message);

  const ids: string[] = [];
  const porEntregarIds: string[] = [];
  for (const v of (data ?? []) as { estado: string; contratos: ContratoMini[] | null }[]) {
    const id = elegirContrato(v.contratos ?? []);
    if (!id) continue;
    ids.push(id);
    if (v.estado === "por_entregar") porEntregarIds.push(id);
  }

  const ya = new Set(yaEnPanel);
  const faltan = ids.filter((id) => !ya.has(id));
  const extra = (
    await Promise.all(
      faltan.map(async (id) => {
        const estado = await estadoCuentaContrato(id);
        if (!estado) return null;
        const ctx = await ctxCobroHoy(id);
        const cobro = cobroHoyDe(estado, ctx);
        const fila: EstadoCuentaFila = {
          ...estado,
          acuerdoSaldo: ctx.acuerdoSaldo,
          planesAcuerdo: ctx.planes ?? [],
          extras: ctx.extras,
          totalCobrarHoy: cobro.totalCobrarHoy,
          lineasCobro: cobro.lineas,
          desgloseCobro: cobro.desglose,
        };
        return fila;
      }),
    )
  ).filter((f): f is EstadoCuentaFila => f != null);
  return { ids, porEntregarIds, extra };
}
