/** Provincias y comarcas de Panamá, en el orden de los formularios oficiales. */

export const PROVINCIAS_PANAMA = [
  "Bocas del Toro",
  "Chiriquí",
  "Coclé",
  "Colón",
  "Darién",
  "Herrera",
  "Los Santos",
  "Panamá",
  "Panamá Oeste",
  "Veraguas",
  "Comarca Emberá-Wounaan",
  "Comarca Guna Yala",
  "Comarca Naso Tjër Di",
  "Comarca Ngäbe-Buglé",
] as const;

const VALIDAS = new Set<string>(PROVINCIAS_PANAMA);

export function provinciaValida(valor: string | null | undefined): boolean {
  return Boolean(valor && VALIDAS.has(valor));
}
