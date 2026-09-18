// Tipos y helpers de la hoja de vida (Operaciones).

export const TIPOS_EVENTO = [
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "revision", label: "Revisión" },
  { value: "chapisteria", label: "Chapistería" },
  { value: "contrato", label: "Contrato / entrega" },
  { value: "devolucion", label: "Devolución / retiro" },
  { value: "novedad", label: "Novedad" },
  { value: "documento", label: "Documento / placa" },
  { value: "otro", label: "Otro" },
] as const;

export type TipoEventoHv = (typeof TIPOS_EVENTO)[number]["value"];

export type EventoHv = {
  id: string;
  vehiculo_id: string;
  fecha: string;
  km: number | null;
  tipo: TipoEventoHv;
  titulo: string | null;
  detalle: string | null;
  lugar: string | null;
  valor: number | null;
  origen: string;
  created_at: string;
  updated_at: string;
};

export function etiquetaTipo(tipo: string): string {
  return TIPOS_EVENTO.find((t) => t.value === tipo)?.label ?? tipo;
}

/** Tone del StatusChip según tipo de evento. */
export function tonoTipo(
  tipo: string,
): "good" | "warn" | "crit" | "neutral" | "azul" | "purpura" {
  if (tipo === "mantenimiento") return "azul";
  if (tipo === "revision") return "good";
  if (tipo === "chapisteria" || tipo === "novedad") return "warn";
  if (tipo === "devolucion") return "crit";
  if (tipo === "contrato") return "purpura";
  if (tipo === "documento") return "neutral";
  return "neutral";
}

/** Clasifica texto libre del Excel / notas a un tipo. */
export function clasificarTexto(texto: string): TipoEventoHv {
  const u = texto.toUpperCase();
  if (/MANTENIMIENTO|FULL\b|ACEITE\s*10|PR[ÓO]XIMO MANTEN/.test(u)) return "mantenimiento";
  if (/CHAPISTER|COLISI[OÓ]N|CHOQUE|RAY[ÓO]N|DEFENSA/.test(u) && !/SIN NOVEDAD/.test(u)) {
    return "chapisteria";
  }
  if (/CONTRATO\s+Y\s+ENTREGA|ENTREGA\s+CARRO|CONSECUTIVO/.test(u)) return "contrato";
  if (/DEVOLUCI[OÓ]N|SE RETIRA|RETIRA VEH[IÍ]CULO|CUSTODIA/.test(u)) return "devolucion";
  if (/REVISI[OÓ]N|REVISION/.test(u)) return "revision";
  if (/PLACA|LICENCIA|REVISADO|SEGURO|PANAPASS|GPS/.test(u)) return "documento";
  if (/NOVEDAD/.test(u)) return "novedad";
  return "otro";
}
