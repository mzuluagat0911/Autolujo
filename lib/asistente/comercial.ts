// Resultados comerciales para el asistente. Reusa el mismo armado del tablero.

import { resumenComercial } from "@/lib/comercial/resultados";

/** KPIs de Resultados: leads, citas, ganados, vencidos, temperatura, Lucía. */
export async function resumenComercialAsistente() {
  const r = await resumenComercial();
  if (r.error) return { error: r.error };
  return {
    embudo: {
      leads: r.leads,
      conCita: r.conCita,
      visitas: r.visitas,
      ganados: r.ganados,
      perdidos: r.perdidos,
    },
    abiertos: {
      vencidos: r.vencidos,
      calientes: r.calientes,
      tibios: r.tibios,
      frios: r.frios,
      nota: "vencidos = chat abierto con seguimiento_at ya pasado. No es seguimientos_comercial.",
    },
    lucia: {
      seguimientosEnviados: r.seguimientos.enviados,
      seguimientosPendientes: r.seguimientos.pendientes,
      cadencia: r.cadencia,
      nota: "El cron de Lucía toma hasta 120 seguimientos por hora.",
    },
    primeraRespuestaMin: r.primeraRespuestaMin,
    porAsesor: r.porAsesor.slice(0, 6),
    porCampana: r.porCampana.slice(0, 5),
  };
}
