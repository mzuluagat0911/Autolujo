// Alertas de uso del día: más de 350 km, o sin recorrido.
// El contrato cobra exceso MENSUAL (8.000 km). Estas dos son operativas:
// alguien del equipo las ve; no se le cobra solo al cliente.

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
