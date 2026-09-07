// Km del día a partir del odómetro (una lectura Diacor), no del recorrido punto a punto.

const TOPE_ABSURDO = 2000;

/** Diferencia de odómetro si las dos lecturas son creíbles. Si no, null → hay que pedir recorrido. */
export function kmDesdeOdometro(ini: number | null | undefined, fin: number | null | undefined): number | null {
  if (ini == null || fin == null) return null;
  if (!(ini > 0) || !(fin > 0)) return null;
  const d = Math.round((fin - ini) * 100) / 100;
  if (d < 0 || d > TOPE_ABSURDO) return null;
  return d;
}

export function odometroUtil(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return n;
}
