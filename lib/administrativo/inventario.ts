// Inventario administrativo: chapistería / mecánica por sede.

export type RubroInventario = "chapisteria" | "mecanica";
export type SedeInventario = "juan_diaz" | "chorrera";
export type TipoMovimientoInventario = "entrada" | "salida";

export const RUBROS_INVENTARIO: { id: RubroInventario; label: string }[] = [
  { id: "chapisteria", label: "Chapistería" },
  { id: "mecanica", label: "Mecánica" },
];

export const SEDES_INVENTARIO: { id: SedeInventario; label: string }[] = [
  { id: "juan_diaz", label: "Juan Díaz" },
  { id: "chorrera", label: "La Chorrera" },
];

export function etiquetaRubro(r: string | null | undefined): string {
  return RUBROS_INVENTARIO.find((x) => x.id === r)?.label ?? r ?? "—";
}

export function etiquetaSedeInventario(s: string | null | undefined): string {
  return SEDES_INVENTARIO.find((x) => x.id === s)?.label ?? "Sin sede";
}

export function normalizarSedeInventario(v: string | null | undefined): SedeInventario | null {
  const s = String(v ?? "").trim();
  if (s === "juan_diaz" || s === "chorrera") return s;
  return null;
}

export function normalizarRubro(v: string | null | undefined): RubroInventario | null {
  const s = String(v ?? "").trim();
  if (s === "chapisteria" || s === "mecanica") return s;
  return null;
}

export type ItemInventarioVista = {
  id: string;
  rubro: RubroInventario;
  codigo: string;
  descripcion: string;
  precio_unitario: number | null;
  proveedor: string | null;
  cantidad: number;
};

export type MovimientoInventarioVista = {
  id: string;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  fecha: string;
  vehiculo_numero: string | null;
  proveedor: string | null;
  notas: string | null;
  codigo: string;
  descripcion: string;
  rubro: RubroInventario;
  sede: SedeInventario;
  created_at: string;
};
