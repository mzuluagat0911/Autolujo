/**
 * Siglas cortas para la UI (como en el control operativo).
 * En base siguen AUTOLUJO / KOWUA / GOLD; en pantallas: AL / KW / GD.
 */
export function siglaEmpresa(codigo: string | null | undefined): string {
  if (!codigo) return "";
  const u = codigo.trim().toUpperCase().replace(/\s+/g, "");
  if (u === "AL" || u === "KW" || u === "GD") return u;
  if (u === "AUTOLUJO" || u === "AUTOLUJOS" || u.startsWith("AUTOLUJO")) return "AL";
  if (u === "KOWUA") return "KW";
  if (u === "GOLD" || u.includes("GOLD") || u.includes("REPARACIONESGOLD")) return "GD";
  return codigo.trim();
}

/** "AL · 144" / "GD · G10". */
export function etiquetaCarroUi(
  empresa: string | null | undefined,
  numero: string | null | undefined,
): string {
  const sigla = siglaEmpresa(empresa);
  const n = (numero ?? "").trim();
  if (sigla && n) return `${sigla} · ${n}`;
  if (n) return n;
  return sigla || "—";
}
