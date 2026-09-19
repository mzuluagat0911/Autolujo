/**
 * Tarifario de chapistería — Hyundai Grand i10 y Kia Soluto.
 * Fuente: listado operativo (crédito). Contado = −20% en reparadas / rollingboard.
 * Piezas nuevas: &lt;50k km sin recargo; ≥50k km → +40% (Rastro/Autorepuestos).
 *
 * INTERNO: no citar al cliente por WhatsApp sin confirmación humana.
 */

export const KM_SIN_RECARGO_NUEVA = 50_000;
export const RECARGO_NUEVA_ALTO_KM = 0.4;
export const DESCUENTO_CONTADO = 0.2;

export type CategoriaChapisteria =
  | "nueva"
  | "reparada_leve"
  | "reparada_fuerte"
  | "rollingboard";

export type ItemChapisteria = {
  id: string;
  categoria: CategoriaChapisteria;
  pieza: string;
  /** Precio a crédito (USD). */
  credito: number;
  /** Si true, aplica descuento de contado (−20%). */
  contadoAplica: boolean;
};

export const ITEMS_CHAPISTERIA: ItemChapisteria[] = [
  // Pieza nueva
  { id: "n-defensa", categoria: "nueva", pieza: "Defensa", credito: 100, contadoAplica: false },
  { id: "n-gf-del", categoria: "nueva", pieza: "Guardafango delantero", credito: 100, contadoAplica: false },
  { id: "n-tapa", categoria: "nueva", pieza: "Tapa de motor", credito: 120, contadoAplica: false },
  { id: "n-gf-tras", categoria: "nueva", pieza: "Guardafango trasero", credito: 120, contadoAplica: false },
  { id: "n-puerta", categoria: "nueva", pieza: "Puerta", credito: 120, contadoAplica: false },
  // Reparada leve
  { id: "rl-defensa", categoria: "reparada_leve", pieza: "Defensa delantera y trasera", credito: 120, contadoAplica: true },
  { id: "rl-gf-del", categoria: "reparada_leve", pieza: "Guardafango delantero", credito: 120, contadoAplica: true },
  { id: "rl-tapa", categoria: "reparada_leve", pieza: "Tapa de motor", credito: 150, contadoAplica: true },
  { id: "rl-gf-tras", categoria: "reparada_leve", pieza: "Guardafango trasero", credito: 150, contadoAplica: true },
  { id: "rl-puerta", categoria: "reparada_leve", pieza: "Puerta", credito: 150, contadoAplica: true },
  { id: "rl-postes", categoria: "reparada_leve", pieza: "Reparación de postes laterales", credito: 75, contadoAplica: true },
  { id: "rl-punta", categoria: "reparada_leve", pieza: "Reparación de punta de chasis", credito: 120, contadoAplica: true },
  // Reparada fuerte
  { id: "rf-defensa", categoria: "reparada_fuerte", pieza: "Defensa", credito: 150, contadoAplica: true },
  { id: "rf-gf-del", categoria: "reparada_fuerte", pieza: "Guardafango delantero", credito: 150, contadoAplica: true },
  { id: "rf-tapa", categoria: "reparada_fuerte", pieza: "Tapa de motor", credito: 175, contadoAplica: true },
  { id: "rf-gf-tras", categoria: "reparada_fuerte", pieza: "Guardafango trasero", credito: 175, contadoAplica: true },
  { id: "rf-puerta", categoria: "reparada_fuerte", pieza: "Puerta", credito: 175, contadoAplica: true },
  { id: "rf-techo", categoria: "reparada_fuerte", pieza: "Reparación de techo", credito: 150, contadoAplica: true },
  { id: "rf-punta", categoria: "reparada_fuerte", pieza: "Reparación de punta de chasis", credito: 150, contadoAplica: true },
  // Rollingboard
  { id: "rb-g1", categoria: "rollingboard", pieza: "Compacto / rollingboard — Grado 1", credito: 100, contadoAplica: true },
  { id: "rb-g3", categoria: "rollingboard", pieza: "Compacto / rollingboard — Grado 3", credito: 120, contadoAplica: true },
];

export const CATEGORIA_LABEL: Record<CategoriaChapisteria, string> = {
  nueva: "Pieza nueva",
  reparada_leve: "Reparada leve (crédito)",
  reparada_fuerte: "Reparada fuerte (crédito)",
  rollingboard: "Compacto / rollingboard",
};

export const TALLERES_EXTERNOS = [
  "Chapistería El Varón",
  "Chapistería Benigno",
  "Taller Rigoberto",
] as const;

export const CAJAS_CHAPISTERIA = [
  { id: 1, periodo: "Del 1 al 8", presupuesto: 1000 },
  { id: 2, periodo: "Del 9 al 16", presupuesto: 1000 },
  { id: 3, periodo: "Del 17 al 22", presupuesto: 1200 },
  { id: 4, periodo: "Del 23 al 30/31", presupuesto: 1200 },
] as const;

export function precioChapisteria(
  item: ItemChapisteria,
  opts: { km?: number | null; contado?: boolean } = {},
): { unitario: number; nota: string } {
  let unitario = item.credito;
  const notas: string[] = [];

  if (item.categoria === "nueva") {
    const km = opts.km ?? null;
    if (km != null && km >= KM_SIN_RECARGO_NUEVA) {
      unitario = Math.round(unitario * (1 + RECARGO_NUEVA_ALTO_KM));
      notas.push(`+40% (≥ ${KM_SIN_RECARGO_NUEVA.toLocaleString("es-PA")} km)`);
    } else {
      notas.push(
        km == null
          ? `< ${KM_SIN_RECARGO_NUEVA.toLocaleString("es-PA")} km: sin recargo`
          : `sin recargo (< ${KM_SIN_RECARGO_NUEVA.toLocaleString("es-PA")} km)`,
      );
    }
  }

  if (item.contadoAplica && opts.contado) {
    unitario = Math.round(unitario * (1 - DESCUENTO_CONTADO));
    notas.push("contado −20%");
  } else if (item.contadoAplica) {
    notas.push("precio crédito");
  }

  return { unitario, nota: notas.join(" · ") };
}
