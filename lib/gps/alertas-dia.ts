// Alertas de uso del día: más de 350 km (operativo).
// “Sin recorrido” se marca en gps_dias para el histórico, pero NO entra a la campana:
// la flota suele pasar noches quieta y Diacor a menudo reporta 0 km sin ser real.

export const KM_ALERTA_DIA = 350;
export const KM_PARADO = 1;

export type TipoAlertaGps = "exceso_km_dia" | "sin_recorrido";
export type ClaseKmDia = TipoAlertaGps | "ok" | "sin_dato";

export function clasificarKmDia(km: number | null, domingo: boolean, enTaller = false): ClaseKmDia {
  if (km == null || !Number.isFinite(km)) return "sin_dato";
  if (km > KM_ALERTA_DIA) return "exceso_km_dia";
  if (km < KM_PARADO && !domingo && !enTaller) return "sin_recorrido";
  return "ok";
}

export function textoAlertaGps(tipo: TipoAlertaGps, km: number | null): string {
  if (tipo === "exceso_km_dia") {
    const n = km != null ? `${Math.round(km)} km` : "más de 350 km";
    return `Recorrió ${n} hoy (tope operativo 350 km).`;
  }
  return "Hoy no tuvo recorrido.";
}
