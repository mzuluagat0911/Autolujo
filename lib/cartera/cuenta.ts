/** Solo los dígitos, para comparar cuentas escritas de mil formas. */
export function digitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * ¿La cuenta leída es una de las nuestras? Los comprobantes suelen enmascarar
 * la cuenta ("****9347"), así que basta con que una termine en la otra y que
 * la parte visible tenga al menos 4 dígitos.
 */
export function mismaCuenta(leida: string, nuestra: string): boolean {
  const a = digitos(leida);
  const b = digitos(nuestra);
  if (a.length < 4 || b.length < 4) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}
