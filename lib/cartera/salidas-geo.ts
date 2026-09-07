// Dónde queda cada destino y en qué zona del país está el pin.
// Radios: centro del pueblo (fino) + anillo de llegada; el metro PA no es interior.

export type PuntoDestino = {
  id: string;
  lat: number;
  lng: number;
  /** Radio “llegó / cerca” (km). */
  radioKm: number;
  /** Anillo intermedio: aún se cuenta como hacia ese destino, no desvío duro. */
  radioCaminoKm: number;
};

export const GEO_DESTINOS: PuntoDestino[] = [
  { id: "penonome", lat: 8.518, lng: -80.357, radioKm: 18, radioCaminoKm: 45 },
  { id: "aguadulce", lat: 8.242, lng: -80.546, radioKm: 15, radioCaminoKm: 40 },
  { id: "santiago", lat: 8.102, lng: -80.971, radioKm: 20, radioCaminoKm: 55 },
  { id: "chitre", lat: 7.966, lng: -80.429, radioKm: 16, radioCaminoKm: 45 },
  { id: "las_tablas", lat: 7.766, lng: -80.275, radioKm: 16, radioCaminoKm: 45 },
  { id: "david", lat: 8.427, lng: -82.430, radioKm: 22, radioCaminoKm: 55 },
  { id: "chiriqui", lat: 8.400, lng: -82.350, radioKm: 40, radioCaminoKm: 80 },
];

export type ZonaGeo = {
  id: string;
  nombre: string;
  interior: boolean;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
};

/** Cajas aproximadas (orden: más específica primero). */
export const ZONAS_GEO: ZonaGeo[] = [
  { id: "metro", nombre: "Metro Panamá", interior: false, latMin: 8.90, latMax: 9.22, lngMin: -79.62, lngMax: -79.28 },
  { id: "oeste", nombre: "Arraiján / Chorrera", interior: false, latMin: 8.78, latMax: 9.12, lngMin: -79.92, lngMax: -79.55 },
  { id: "colon", nombre: "Colón", interior: false, latMin: 9.22, latMax: 9.45, lngMin: -79.95, lngMax: -79.55 },
  { id: "cocle", nombre: "Coclé", interior: true, latMin: 8.15, latMax: 8.75, lngMin: -80.70, lngMax: -80.05 },
  { id: "veraguas", nombre: "Veraguas", interior: true, latMin: 7.70, latMax: 8.55, lngMin: -81.40, lngMax: -80.55 },
  { id: "herrera", nombre: "Herrera / Los Santos", interior: true, latMin: 7.40, latMax: 8.15, lngMin: -80.85, lngMax: -80.05 },
  { id: "chiriqui", nombre: "Chiriquí", interior: true, latMin: 8.10, latMax: 8.95, lngMin: -83.00, lngMax: -82.00 },
  { id: "bocas", nombre: "Bocas del Toro", interior: true, latMin: 8.95, latMax: 9.65, lngMin: -82.55, lngMax: -81.65 },
  { id: "azuero_sur", nombre: "Azuero sur", interior: true, latMin: 7.20, latMax: 7.70, lngMin: -80.60, lngMax: -80.10 },
];

/** Caja amplia ciudad + oeste (compat). */
const METRO_AMPLO = { latMin: 8.78, latMax: 9.22, lngMin: -79.92, lngMax: -79.28 };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}

export function clasificarZona(lat: number, lng: number): ZonaGeo | null {
  for (const z of ZONAS_GEO) {
    if (lat >= z.latMin && lat <= z.latMax && lng >= z.lngMin && lng <= z.lngMax) return z;
  }
  return null;
}

export function etiquetaZona(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const z = clasificarZona(lat, lng);
  if (z) return z.nombre;
  return enInterior(lat, lng) ? "Interior (sin zona)" : "Ciudad / costa";
}

export function enMetroPanama(lat: number, lng: number): boolean {
  const z = clasificarZona(lat, lng);
  if (z) return !z.interior;
  return lat >= METRO_AMPLO.latMin && lat <= METRO_AMPLO.latMax && lng >= METRO_AMPLO.lngMin && lng <= METRO_AMPLO.lngMax;
}

export function enInterior(lat: number, lng: number): boolean {
  const z = clasificarZona(lat, lng);
  if (z) return z.interior;
  return !enMetroPanama(lat, lng);
}

export function geoDestino(id: string): PuntoDestino | null {
  return GEO_DESTINOS.find((d) => d.id === id) ?? null;
}

export type CruceGpsSalida =
  | { tipo: "ok"; km: number; nota: string; zona: string | null }
  | { tipo: "desvio"; km: number; nota: string; zona: string | null }
  | { tipo: "en_camino"; km: number | null; nota: string; zona: string | null }
  | { tipo: "otro_interior"; nota: string; zona: string | null }
  | { tipo: "otro_ciudad"; nota: string; zona: string | null }
  | { tipo: "sin_dato"; nota: string; zona: null }
  | { tipo: "sin_aval"; nota: string; zona: string | null };

export function cruzarPuntoConSalida(
  lat: number | null,
  lng: number | null,
  destinoId: string,
  destinoNombre: string,
): CruceGpsSalida {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { tipo: "sin_dato", nota: "Sin coordenada GPS para cruzar.", zona: null };
  }
  const p = { lat, lng };
  const zona = etiquetaZona(lat, lng);
  if (destinoId === "otro") {
    return enInterior(lat, lng)
      ? {
          tipo: "otro_interior",
          zona,
          nota: `Destino fuera de tabla (${destinoNombre}). GPS en ${zona ?? "interior"}; revisar a mano.`,
        }
      : {
          tipo: "otro_ciudad",
          zona,
          nota: `Destino fuera de tabla (${destinoNombre}). GPS en ${zona ?? "ciudad"}.`,
        };
  }
  const geo = geoDestino(destinoId);
  if (!geo) {
    return enInterior(lat, lng)
      ? { tipo: "otro_interior", zona, nota: `Sin pin de ${destinoNombre}. GPS en ${zona ?? "interior"}; revisar.` }
      : { tipo: "en_camino", km: null, zona, nota: `Sin pin de ${destinoNombre}. GPS en ${zona ?? "ciudad"}.` };
  }
  const km = haversineKm(p, { lat: geo.lat, lng: geo.lng });
  if (km <= geo.radioKm) {
    return { tipo: "ok", km, zona, nota: `GPS cerca de ${destinoNombre} (${km} km · ${zona ?? "zona"}).` };
  }
  if (km <= geo.radioCaminoKm || enMetroPanama(lat, lng)) {
    return {
      tipo: "en_camino",
      km,
      zona,
      nota: `Autorizado a ${destinoNombre}; GPS a ${km} km (${zona ?? "en ruta"}).`,
    };
  }
  return {
    tipo: "desvio",
    km,
    zona,
    nota: `Autorizado a ${destinoNombre}, pero el GPS está a ${km} km (${zona ?? "otro interior"}).`,
  };
}
