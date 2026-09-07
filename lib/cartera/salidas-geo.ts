// Dónde queda cada destino de la tabla, para cruzar el GPS del día.
// Radios holgados: el pin del GPS no es la plaza del pueblo.

export type PuntoDestino = {
  id: string;
  lat: number;
  lng: number;
  radioKm: number;
};

export const GEO_DESTINOS: PuntoDestino[] = [
  { id: "penonome", lat: 8.518, lng: -80.357, radioKm: 35 },
  { id: "aguadulce", lat: 8.242, lng: -80.546, radioKm: 30 },
  { id: "santiago", lat: 8.102, lng: -80.971, radioKm: 40 },
  { id: "chitre", lat: 7.966, lng: -80.429, radioKm: 35 },
  { id: "las_tablas", lat: 7.766, lng: -80.275, radioKm: 35 },
  { id: "david", lat: 8.427, lng: -82.430, radioKm: 45 },
  { id: "chiriqui", lat: 8.400, lng: -82.350, radioKm: 70 },
];

/** Caja aproximada de ciudad + oeste cercano (Arraiján / Chorrera). No es interior. */
const METRO = { latMin: 8.78, latMax: 9.22, lngMin: -79.92, lngMax: -79.28 };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}

export function enMetroPanama(lat: number, lng: number): boolean {
  return lat >= METRO.latMin && lat <= METRO.latMax && lng >= METRO.lngMin && lng <= METRO.lngMax;
}

export function enInterior(lat: number, lng: number): boolean {
  return !enMetroPanama(lat, lng);
}

export function geoDestino(id: string): PuntoDestino | null {
  return GEO_DESTINOS.find((d) => d.id === id) ?? null;
}

export type CruceGpsSalida =
  | { tipo: "ok"; km: number; nota: string }
  | { tipo: "desvio"; km: number; nota: string }
  | { tipo: "en_camino"; km: number | null; nota: string }
  | { tipo: "otro_interior"; nota: string }
  | { tipo: "otro_ciudad"; nota: string }
  | { tipo: "sin_dato"; nota: string }
  | { tipo: "sin_aval"; nota: string };

export function cruzarPuntoConSalida(
  lat: number | null,
  lng: number | null,
  destinoId: string,
  destinoNombre: string,
): CruceGpsSalida {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { tipo: "sin_dato", nota: "Sin coordenada GPS para cruzar." };
  }
  const p = { lat, lng };
  if (destinoId === "otro") {
    return enInterior(lat, lng)
      ? { tipo: "otro_interior", nota: `Destino fuera de tabla (${destinoNombre}). El GPS está en interior; revisar a mano.` }
      : { tipo: "otro_ciudad", nota: `Destino fuera de tabla (${destinoNombre}). El GPS sigue en la ciudad.` };
  }
  const geo = geoDestino(destinoId);
  if (!geo) {
    return enInterior(lat, lng)
      ? { tipo: "otro_interior", nota: `Sin pin de ${destinoNombre}. GPS en interior; revisar.` }
      : { tipo: "en_camino", km: null, nota: `Sin pin de ${destinoNombre}. GPS en la ciudad.` };
  }
  const km = haversineKm(p, { lat: geo.lat, lng: geo.lng });
  if (km <= geo.radioKm) {
    return { tipo: "ok", km, nota: `GPS cerca de ${destinoNombre} (${km} km).` };
  }
  if (enMetroPanama(lat, lng)) {
    return { tipo: "en_camino", km, nota: `Autorizado a ${destinoNombre}; el GPS sigue en ciudad (${km} km del destino).` };
  }
  return {
    tipo: "desvio",
    km,
    nota: `Autorizado a ${destinoNombre}, pero el GPS está a ${km} km de ahí (otro punto del interior).`,
  };
}
