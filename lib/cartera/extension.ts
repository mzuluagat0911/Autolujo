// Extensión: un plan con motivo, cobrado con la misma forma que un acuerdo.
// Se guarda en acuerdos. La descripción lleva el motivo para no pedir columna nueva.

export const MOTIVOS_EXTENSION = [
  { id: "seguro_menor", label: "Seguro menor de edad" },
  { id: "area_geografica", label: "Área geográfica" },
  { id: "beneficiario", label: "Beneficiario adicional" },
  { id: "pirateria", label: "Piratería" },
] as const;

export type MotivoExtension = (typeof MOTIVOS_EXTENSION)[number]["id"];

const PREFIJO = "Extensión · ";

export function esExtension(descripcion: string | null | undefined): boolean {
  return String(descripcion ?? "").trim().startsWith(PREFIJO);
}

export function motivoDeExtension(descripcion: string | null | undefined): MotivoExtension | null {
  const texto = String(descripcion ?? "").trim();
  if (!texto.startsWith(PREFIJO)) return null;
  const label = texto.slice(PREFIJO.length).trim();
  return MOTIVOS_EXTENSION.find((m) => m.label === label)?.id ?? null;
}

export function descripcionExtension(motivo: MotivoExtension): string {
  const label = MOTIVOS_EXTENSION.find((m) => m.id === motivo)?.label ?? MOTIVOS_EXTENSION[0].label;
  return `${PREFIJO}${label}`;
}

export function motivoExtensionDe(valor: unknown): MotivoExtension | null {
  const id = String(valor ?? "").trim();
  return MOTIVOS_EXTENSION.some((m) => m.id === id) ? (id as MotivoExtension) : null;
}
