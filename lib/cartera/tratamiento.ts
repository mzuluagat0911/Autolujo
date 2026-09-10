/** Tratamiento formal a partir del género guardado en clientes. */

export type GeneroCliente = "m" | "f";

export function normalizarGenero(v: unknown): GeneroCliente | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "m" || s === "f") return s;
  if (s === "masculino" || s === "hombre" || s === "sr" || s === "sr.") return "m";
  if (s === "femenino" || s === "mujer" || s === "sra" || s === "sra.") return "f";
  return null;
}

/** Primer nombre útil para saludo (sin apellidos). */
export function primerNombre(nombreCompleto: string | null | undefined): string {
  const t = (nombreCompleto ?? "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0] ?? t;
}

/**
 * "Sr. Juan" / "Sra. María". Si no hay género, solo el primer nombre.
 */
export function tratamientoCliente(
  nombreCompleto: string | null | undefined,
  genero: string | null | undefined,
): string {
  const nombre = primerNombre(nombreCompleto);
  if (!nombre) return "";
  const g = normalizarGenero(genero);
  if (g === "m") return `Sr. ${nombre}`;
  if (g === "f") return `Sra. ${nombre}`;
  return nombre;
}

export function etiquetaGenero(genero: string | null | undefined): string {
  const g = normalizarGenero(genero);
  if (g === "m") return "Sr.";
  if (g === "f") return "Sra.";
  return "—";
}
