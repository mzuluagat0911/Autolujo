// Normalización de teléfonos panameños.
//
// Los números llegan en formatos distintos: WhatsApp manda "50761234567",
// el control de Luis trae "6123-4567" y el importador guardó "+50761234567".
// Comparar por sufijo (ilike '%…') hace que dos clientes con números
// parecidos colisionen y la conversación quede amarrada al cliente
// equivocado. Aquí todo se lleva a una sola forma canónica: 507 + 8 dígitos.
//
// Este archivo es el espejo en TypeScript de la función SQL `normalizar_tel`
// (migración 0009). Si cambia uno, cambia el otro.

const PREFIJO = "507";

/**
 * Devuelve el número en forma canónica (solo dígitos, con código de país),
 * igual que lo manda WhatsApp. null si no es un número plausible.
 *
 * - 8 dígitos          → local panameño, se le antepone 507.
 * - empieza en 507     → tiene que medir exactamente 11; si no, es un dato
 *                        mal armado (el importador le pegó "+507" a números
 *                        incompletos) y NO se vincula a nadie.
 * - 10 a 15 dígitos    → otro país, ya trae código; se deja como está.
 * - cualquier otro caso → null.
 */
export function normalizarTelefono(valor: string | null | undefined): string | null {
  const d = (valor ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 8) return PREFIJO + d;
  if (d.startsWith(PREFIJO)) return d.length === 11 ? d : null;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

/** true si el valor ya es un canónico seguro para interpolar en un filtro. */
export function esTelefonoCanonico(v: string): boolean {
  return /^\d{10,15}$/.test(v);
}
