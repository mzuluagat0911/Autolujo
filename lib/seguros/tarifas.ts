import libro from "./tarifas-colision";

export type Tarifa = { nombre: string; pieza: number; mano: number };

type LibroId = "grand-i10-2023" | "grand-i10-2027" | "kia-soluto";

/**
 * El precio de la pieza es el de descuento. El precio lleno del listado no se usa.
 * Kia Soluto no trae mano de obra: se copia la de la misma pieza en Hyundai.
 * Grand i10 2024 y anteriores usan el listado 2023 (ahí están las piezas 2024).
 * Del 2025 en adelante, el listado 2027.
 */
export function libroId(marca: string, modelo: string, anio: number | null): LibroId {
  const t = `${marca} ${modelo}`.toLowerCase();
  if (t.includes("kia") || t.includes("soluto")) return "kia-soluto";
  if ((anio ?? 0) >= 2025) return "grand-i10-2027";
  return "grand-i10-2023";
}

export function tarifasDe(marca: string, modelo: string, anio: number | null): Tarifa[] {
  const lista = libro[libroId(marca, modelo, anio)] as Tarifa[];
  const vistos = new Set<string>();
  return lista.filter((t) => {
    if (vistos.has(t.nombre)) return false;
    vistos.add(t.nombre);
    return true;
  });
}

export function totalTarifa(t: Pick<Tarifa, "pieza" | "mano">): number {
  return Math.round((t.pieza + t.mano) * 100) / 100;
}

export function plata(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
