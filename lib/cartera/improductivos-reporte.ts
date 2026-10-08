// Carros en estado improductivo que el extracto del día no trae
// (contrato suspendido u otro estado distinto de activo). El reporte
// los agrega al final, con el mismo desglose.

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

/** Ids de contrato de cada carro improductivo, y las filas que el panel no tiene. */
export async function reporteImproductivos(yaEnPanel: string[]): Promise<{
  ids: string[];
  extra: EstadoCuentaFila[];
}> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("id, contratos(id, estado, fecha_inicio)")
    .eq("estado", "improductivo");
  if (error) throw new Error(error.message);

  const ids: string[] = [];
  for (const v of (data ?? []) as { contratos: ContratoMini[] | null }[]) {
    const id = elegirContrato(v.contratos ?? []);
    if (id) ids.push(id);
  }

  const ya = new Set(yaEnPanel);
  const faltan = ids.filter((id) => !ya.has(id));
  const extra: EstadoCuentaFila[] = [];
  for (const id of faltan) {
    const estado = await estadoCuentaContrato(id);
    if (!estado) continue;
    const ctx = await ctxCobroHoy(id);
    const cobro = cobroHoyDe(estado, ctx);
    extra.push({
      ...estado,
      acuerdoSaldo: ctx.acuerdoSaldo,
      planesAcuerdo: ctx.planes ?? [],
      extras: ctx.extras,
      totalCobrarHoy: cobro.totalCobrarHoy,
      lineasCobro: cobro.lineas,
      desgloseCobro: cobro.desglose,
    });
  }
  return { ids, extra };
}
