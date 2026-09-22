// Filtro de empresas para envíos masivos (piloto Gold, etc.).
// CARTERA_EMPRESAS=GOLD          → solo Gold
// CARTERA_EMPRESAS=GOLD,KOWUA    → esas dos
// (vacío / no definido)          → todas

export function empresasEnvioPermitidas(): string[] | null {
  const raw = (process.env.CARTERA_EMPRESAS ?? "").trim();
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length ? list : null;
}

export function filtrarEstadosPorEmpresaEnvio<T extends { empresa: string | null }>(
  estados: T[],
): T[] {
  const allow = empresasEnvioPermitidas();
  if (!allow) return estados;
  return estados.filter(
    (e) => e.empresa != null && allow.includes(e.empresa.toUpperCase()),
  );
}
