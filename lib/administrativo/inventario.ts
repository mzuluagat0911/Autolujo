// Inventario administrativo: chapistería / mecánica por sede.

export type RubroInventario = "chapisteria" | "mecanica";
export type SedeInventario = "juan_diaz" | "chorrera";
export type TipoMovimientoInventario = "entrada" | "salida" | "transferencia";
export type CobroInventario = "cliente" | "empresa";

export const RUBROS_INVENTARIO: { id: RubroInventario; label: string }[] = [
  { id: "chapisteria", label: "Chapistería" },
  { id: "mecanica", label: "Mecánica" },
];

export const SEDES_INVENTARIO: { id: SedeInventario; label: string }[] = [
  { id: "juan_diaz", label: "Juan Díaz" },
  { id: "chorrera", label: "La Chorrera" },
];

export const COBROS_INVENTARIO: { id: CobroInventario; label: string }[] = [
  { id: "cliente", label: "Cliente" },
  { id: "empresa", label: "Empresa" },
];

export function etiquetaRubro(r: string | null | undefined): string {
  return RUBROS_INVENTARIO.find((x) => x.id === r)?.label ?? r ?? "—";
}

export function etiquetaSedeInventario(s: string | null | undefined): string {
  return SEDES_INVENTARIO.find((x) => x.id === s)?.label ?? "Sin sede";
}

export function etiquetaCobro(c: string | null | undefined): string {
  if (!c) return "Pendiente";
  return COBROS_INVENTARIO.find((x) => x.id === c)?.label ?? c;
}

export function etiquetaTipoMovimiento(t: string | null | undefined): string {
  if (t === "entrada") return "Entrada";
  if (t === "salida") return "Salida";
  if (t === "transferencia") return "Transferencia";
  return t ?? "—";
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

export function normalizarCobro(v: string | null | undefined): CobroInventario | null {
  const s = String(v ?? "").trim();
  if (s === "cliente" || s === "empresa") return s;
  return null;
}

export function otraSede(sede: SedeInventario): SedeInventario {
  return sede === "juan_diaz" ? "chorrera" : "juan_diaz";
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

export type DestinoSalidaInventario = "carro" | "taller";

export type MovimientoInventarioVista = {
  id: string;
  item_id: string;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  fecha: string;
  vehiculo_numero: string | null;
  vehiculo_id: string | null;
  /** Consumo de taller: sin carro. */
  para_taller: boolean;
  proveedor: string | null;
  precio_unitario: number | null;
  notas: string | null;
  codigo: string;
  descripcion: string;
  rubro: RubroInventario;
  sede: SedeInventario;
  sede_destino: SedeInventario | null;
  cobro_a: CobroInventario | null;
  created_at: string;
  ediciones: number;
};

export type EdicionMovimientoVista = {
  id: string;
  motivo: string;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
  created_at: string;
  editor: string | null;
};

export type RecomendacionCompra = {
  item_id: string;
  codigo: string;
  descripcion: string;
  rubro: RubroInventario;
  precio_unitario: number | null;
  proveedor: string | null;
  stock: number;
  salidas_periodo: number;
  sugerido: number;
  costo_sugerido: number | null;
  /** Si hay historial de entradas con precio. */
  proveedor_mas_barato: string | null;
  precio_mas_barato: number | null;
};

export type ProveedorVista = {
  id: string;
  nombre: string;
  entradas: number;
  items_distintos: number;
  ultima_fecha: string | null;
};

/** Comparativa de precios por pieza entre proveedores (desde entradas). */
export type ComparativaPrecioItem = {
  item_id: string;
  codigo: string;
  descripcion: string;
  rubro: RubroInventario;
  opciones: {
    proveedor_id: string;
    proveedor: string;
    precio_ultimo: number;
    precio_min: number;
    compras: number;
    ultima_fecha: string;
  }[];
  mas_barato: { proveedor: string; precio: number } | null;
  /** true si hay ≥2 proveedores con precio (recomendación útil). */
  comparable: boolean;
};

/** Normaliza nombre de proveedor para no duplicar (Asia / asia / ASIA). */
export function normalizarNombreProveedor(nombre: string): string {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
