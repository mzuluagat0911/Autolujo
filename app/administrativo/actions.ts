"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionEquipo } from "@/lib/equipo/sesion";
import {
  normalizarCobro,
  normalizarNombreProveedor,
  normalizarRubro,
  normalizarSedeInventario,
  otraSede,
  type ComparativaPrecioItem,
  type EdicionMovimientoVista,
  type ItemInventarioVista,
  type MovimientoInventarioVista,
  type ProveedorVista,
  type RecomendacionCompra,
  type RubroInventario,
  type SedeInventario,
  type TipoMovimientoInventario,
} from "@/lib/administrativo/inventario";

export type ResultadoInv = { ok: true; msg?: string } | { ok: false; error: string };

async function exigirAdmin() {
  const s = await sesionEquipo();
  if (!s?.modulos.includes("administrativo") && !s?.modulos.includes("equipo")) {
    return null;
  }
  return s;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function revalidar() {
  revalidatePath("/administrativo");
  revalidatePath("/administrativo/inventario");
}

async function stockDe(
  sb: ReturnType<typeof createServerSupabase>,
  itemId: string,
  sede: SedeInventario,
): Promise<{ ok: true; cantidad: number } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("inventario_stock")
    .select("cantidad")
    .eq("item_id", itemId)
    .eq("sede", sede)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, cantidad: n(data?.cantidad) };
}

async function setStock(
  sb: ReturnType<typeof createServerSupabase>,
  itemId: string,
  sede: SedeInventario,
  cantidad: number,
): Promise<ResultadoInv> {
  const { error } = await sb.from("inventario_stock").upsert(
    {
      item_id: itemId,
      sede,
      cantidad: Math.round(cantidad * 1000) / 1000,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "item_id,sede" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Crea o reutiliza proveedor por nombre (sin duplicar Asia/asia). */
async function asegurarProveedor(
  sb: ReturnType<typeof createServerSupabase>,
  nombreRaw: string,
): Promise<
  | { ok: true; id: string | null; nombre: string | null }
  | { ok: false; error: string }
> {
  const nombre = String(nombreRaw ?? "").trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: true, id: null, nombre: null };
  const nombre_norm = normalizarNombreProveedor(nombre);
  if (!nombre_norm) return { ok: true, id: null, nombre: null };

  const { data: existente } = await sb
    .from("inventario_proveedores")
    .select("id, nombre")
    .eq("nombre_norm", nombre_norm)
    .maybeSingle();
  if (existente) {
    return { ok: true, id: String(existente.id), nombre: String(existente.nombre) };
  }

  const { data: creado, error } = await sb
    .from("inventario_proveedores")
    .insert({ nombre, nombre_norm, activo: true })
    .select("id, nombre")
    .single();
  if (error) {
    // carrera: otro insertó el mismo norm
    const { data: otra } = await sb
      .from("inventario_proveedores")
      .select("id, nombre")
      .eq("nombre_norm", nombre_norm)
      .maybeSingle();
    if (otra) return { ok: true, id: String(otra.id), nombre: String(otra.nombre) };
    if (/inventario_proveedores|does not exist/i.test(error.message)) {
      return { ok: true, id: null, nombre };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: String(creado.id), nombre: String(creado.nombre) };
}

/** Mapa item_id → proveedor más barato (mínimo precio_unitario en entradas). */
async function mapaProveedorMasBarato(
  sb: ReturnType<typeof createServerSupabase>,
  itemIds: string[],
): Promise<Map<string, { proveedor: string; precio: number }>> {
  const out = new Map<string, { proveedor: string; precio: number }>();
  if (itemIds.length === 0) return out;
  const { data, error } = await sb
    .from("inventario_movimientos")
    .select("item_id, proveedor, precio_unitario, fecha")
    .eq("tipo", "entrada")
    .in("item_id", itemIds)
    .not("precio_unitario", "is", null)
    .not("proveedor", "is", null)
    .order("fecha", { ascending: false })
    .limit(4000);
  if (error || !data) return out;

  type Agg = { min: number; proveedor: string; porProv: Map<string, number> };
  const agg = new Map<string, Agg>();
  for (const row of data as { item_id: string; proveedor: string | null; precio_unitario: number }[]) {
    const precio = n(row.precio_unitario);
    const prov = String(row.proveedor ?? "").trim();
    if (!(precio > 0) || !prov) continue;
    const cur = agg.get(row.item_id) ?? { min: Infinity, proveedor: prov, porProv: new Map() };
    const prev = cur.porProv.get(prov);
    if (prev == null || precio < prev) cur.porProv.set(prov, precio);
    if (precio < cur.min) {
      cur.min = precio;
      cur.proveedor = prov;
    }
    agg.set(row.item_id, cur);
  }
  for (const [id, a] of agg) {
    if (a.min < Infinity) out.set(id, { proveedor: a.proveedor, precio: a.min });
  }
  return out;
}

/** Busca carro por número (o etiqueta tipo AL331 / 331). */
async function resolverVehiculo(numeroRaw: string): Promise<
  | { ok: true; id: string; numero: string }
  | { ok: false; error: string }
> {
  const raw = String(numeroRaw ?? "").trim();
  if (!raw) return { ok: false, error: "Indicá el # de carro." };
  const digitos = raw.replace(/^[A-Za-z]+/, "").replace(/\D/g, "");
  const candidato = digitos || raw;
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("id, numero, estado")
    .ilike("numero", candidato)
    .limit(5);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as { id: string; numero: string; estado: string }[];
  if (rows.length === 0) {
    const { data: soft } = await sb
      .from("vehiculos")
      .select("id, numero, estado")
      .ilike("numero", `%${candidato}%`)
      .limit(5);
    const softRows = (soft ?? []) as { id: string; numero: string; estado: string }[];
    if (softRows.length === 1) {
      return { ok: true, id: softRows[0].id, numero: softRows[0].numero };
    }
    if (softRows.length > 1) {
      return { ok: false, error: `Varios carros coinciden con “${raw}”. Poné el número exacto.` };
    }
    return { ok: false, error: `No encontré el carro “${raw}”.` };
  }
  if (rows.length > 1) {
    const exact = rows.find((r) => String(r.numero) === candidato);
    if (exact) return { ok: true, id: exact.id, numero: exact.numero };
    return { ok: false, error: `Varios carros coinciden con “${raw}”.` };
  }
  return { ok: true, id: rows[0].id, numero: rows[0].numero };
}

function mapMovimiento(row: Record<string, unknown>): MovimientoInventarioVista {
  const itemRaw = row.item as
    | { codigo: string; descripcion: string; rubro: RubroInventario }
    | { codigo: string; descripcion: string; rubro: RubroInventario }[]
    | null;
  const item = Array.isArray(itemRaw) ? itemRaw[0] : itemRaw;
  const eds = row.ediciones as { count?: number }[] | number | null | undefined;
  let ediciones = 0;
  if (typeof eds === "number") ediciones = eds;
  else if (Array.isArray(eds) && eds[0] && typeof eds[0].count === "number") ediciones = eds[0].count;

  return {
    id: String(row.id),
    item_id: String(row.item_id ?? ""),
    tipo: row.tipo as TipoMovimientoInventario,
    cantidad: n(row.cantidad),
    fecha: String(row.fecha).slice(0, 10),
    vehiculo_numero: row.vehiculo_numero == null ? null : String(row.vehiculo_numero),
    vehiculo_id: row.vehiculo_id == null ? null : String(row.vehiculo_id),
    para_taller: Boolean(row.para_taller),
    proveedor: row.proveedor == null ? null : String(row.proveedor),
    precio_unitario: row.precio_unitario == null ? null : n(row.precio_unitario),
    notas: row.notas == null ? null : String(row.notas),
    codigo: item?.codigo ?? "",
    descripcion: item?.descripcion ?? "",
    rubro: (item?.rubro ?? "mecanica") as RubroInventario,
    sede: row.sede as SedeInventario,
    sede_destino: (row.sede_destino as SedeInventario | null) ?? null,
    cobro_a: (row.cobro_a as MovimientoInventarioVista["cobro_a"]) ?? null,
    created_at: String(row.created_at ?? ""),
    ediciones,
  };
}

function snapshotMovimiento(row: Record<string, unknown>) {
  return {
    tipo: row.tipo,
    cantidad: n(row.cantidad),
    fecha: String(row.fecha).slice(0, 10),
    vehiculo_numero: row.vehiculo_numero ?? null,
    vehiculo_id: row.vehiculo_id ?? null,
    para_taller: Boolean(row.para_taller),
    proveedor: row.proveedor ?? null,
    precio_unitario: row.precio_unitario == null ? null : n(row.precio_unitario),
    notas: row.notas ?? null,
    sede: row.sede,
    sede_destino: row.sede_destino ?? null,
    cobro_a: row.cobro_a ?? null,
  };
}

export async function listarInventario(opts: {
  sede: SedeInventario;
  rubro?: RubroInventario | "todos";
}): Promise<{ ok: true; filas: ItemInventarioVista[] } | { ok: false; error: string }> {
  if (!(await exigirAdmin())) return { ok: false, error: "Sin permiso." };
  const sede = normalizarSedeInventario(opts.sede);
  if (!sede) return { ok: false, error: "Sede inválida." };
  const rubro = opts.rubro && opts.rubro !== "todos" ? normalizarRubro(opts.rubro) : null;

  const sb = createServerSupabase();
  let q = sb
    .from("inventario_items")
    .select(
      "id, rubro, codigo, descripcion, precio_unitario, proveedor, inventario_stock!inner(cantidad, sede)",
    )
    .eq("activo", true)
    .eq("inventario_stock.sede", sede)
    .order("codigo");
  if (rubro) q = q.eq("rubro", rubro);

  const { data, error } = await q;
  if (error) {
    if (/inventario_items|does not exist|schema cache/i.test(error.message)) {
      return { ok: false, error: "Falta correr la migración 0061 de inventario." };
    }
    return { ok: false, error: error.message };
  }

  const filas: ItemInventarioVista[] = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const stocks = row.inventario_stock as
      | { cantidad: number; sede: string }[]
      | { cantidad: number; sede: string };
    const st = Array.isArray(stocks) ? stocks[0] : stocks;
    return {
      id: String(row.id),
      rubro: row.rubro as RubroInventario,
      codigo: String(row.codigo ?? ""),
      descripcion: String(row.descripcion ?? ""),
      precio_unitario: row.precio_unitario == null ? null : n(row.precio_unitario),
      proveedor: row.proveedor == null ? null : String(row.proveedor),
      cantidad: n(st?.cantidad),
    };
  });
  return { ok: true, filas };
}

export async function listarMovimientos(opts: {
  sede: SedeInventario;
  limite?: number;
}): Promise<{ ok: true; filas: MovimientoInventarioVista[] } | { ok: false; error: string }> {
  if (!(await exigirAdmin())) return { ok: false, error: "Sin permiso." };
  const sede = normalizarSedeInventario(opts.sede);
  if (!sede) return { ok: false, error: "Sede inválida." };
  const limite = Math.min(Math.max(opts.limite ?? 80, 1), 300);

  const sb = createServerSupabase();
  const selFull =
    "id, item_id, tipo, cantidad, fecha, vehiculo_numero, vehiculo_id, para_taller, proveedor, precio_unitario, notas, sede, sede_destino, cobro_a, created_at, item:inventario_items(codigo, descripcion, rubro), ediciones:inventario_movimientos_ediciones(count)";
  const selMid =
    "id, item_id, tipo, cantidad, fecha, vehiculo_numero, vehiculo_id, para_taller, proveedor, precio_unitario, notas, sede, sede_destino, cobro_a, created_at, item:inventario_items(codigo, descripcion, rubro)";
  const selBase =
    "id, item_id, tipo, cantidad, fecha, vehiculo_numero, proveedor, notas, sede, created_at, item:inventario_items(codigo, descripcion, rubro)";

  let { data, error } = await sb
    .from("inventario_movimientos")
    .select(selFull)
    .eq("sede", sede)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error && /ediciones|inventario_movimientos_ediciones/i.test(error.message)) {
    const retry = await sb
      .from("inventario_movimientos")
      .select(selMid)
      .eq("sede", sede)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite);
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error && /para_taller/i.test(error.message)) {
    const retry = await sb
      .from("inventario_movimientos")
      .select(
        "id, item_id, tipo, cantidad, fecha, vehiculo_numero, vehiculo_id, proveedor, precio_unitario, notas, sede, sede_destino, cobro_a, created_at, item:inventario_items(codigo, descripcion, rubro), ediciones:inventario_movimientos_ediciones(count)",
      )
      .eq("sede", sede)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite);
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error && /sede_destino|cobro_a|vehiculo_id|precio_unitario/i.test(error.message)) {
    const retry = await sb
      .from("inventario_movimientos")
      .select(selBase)
      .eq("sede", sede)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite);
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    filas: ((data ?? []) as Record<string, unknown>[]).map(mapMovimiento),
  };
}

export async function listarCobrosPendientes(opts?: {
  sede?: SedeInventario;
}): Promise<{ ok: true; filas: MovimientoInventarioVista[] } | { ok: false; error: string }> {
  if (!(await exigirAdmin())) return { ok: false, error: "Sin permiso." };
  const sede = opts?.sede ? normalizarSedeInventario(opts.sede) : null;
  const sb = createServerSupabase();
  let q = sb
    .from("inventario_movimientos")
    .select(
      "id, item_id, tipo, cantidad, fecha, vehiculo_numero, vehiculo_id, para_taller, proveedor, precio_unitario, notas, sede, sede_destino, cobro_a, created_at, item:inventario_items(codigo, descripcion, rubro)",
    )
    .eq("tipo", "salida")
    .is("cobro_a", null)
    .eq("para_taller", false)
    .not("vehiculo_numero", "is", null)
    .order("fecha", { ascending: false })
    .limit(100);
  if (sede) q = q.eq("sede", sede);
  let { data, error } = await q;
  if (error && /para_taller/i.test(error.message)) {
    let q2 = sb
      .from("inventario_movimientos")
      .select(
        "id, item_id, tipo, cantidad, fecha, vehiculo_numero, vehiculo_id, proveedor, precio_unitario, notas, sede, sede_destino, cobro_a, created_at, item:inventario_items(codigo, descripcion, rubro)",
      )
      .eq("tipo", "salida")
      .is("cobro_a", null)
      .not("vehiculo_numero", "is", null)
      .order("fecha", { ascending: false })
      .limit(100);
    if (sede) q2 = q2.eq("sede", sede);
    const retry = await q2;
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error) {
    if (/cobro_a|does not exist/i.test(error.message)) return { ok: true, filas: [] };
    return { ok: false, error: error.message };
  }
  return { ok: true, filas: ((data ?? []) as Record<string, unknown>[]).map(mapMovimiento) };
}

/** Lo que más salió vs stock actual: qué comprar con el presupuesto. */
export async function recomendacionesCompra(opts: {
  sede: SedeInventario;
  dias?: number;
  presupuesto?: number | null;
}): Promise<{ ok: true; filas: RecomendacionCompra[] } | { ok: false; error: string }> {
  if (!(await exigirAdmin())) return { ok: false, error: "Sin permiso." };
  const sede = normalizarSedeInventario(opts.sede);
  if (!sede) return { ok: false, error: "Sede inválida." };
  const dias = Math.min(Math.max(opts.dias ?? 30, 7), 180);
  const presupuesto =
    opts.presupuesto != null && Number.isFinite(opts.presupuesto) && opts.presupuesto > 0
      ? opts.presupuesto
      : null;

  const desde = new Date();
  desde.setUTCDate(desde.getUTCDate() - dias);
  const desdeIso = desde.toISOString().slice(0, 10);

  const sb = createServerSupabase();
  const { data: movs, error } = await sb
    .from("inventario_movimientos")
    .select("item_id, cantidad, tipo, sede")
    .eq("sede", sede)
    .eq("tipo", "salida")
    .gte("fecha", desdeIso)
    .limit(5000);
  if (error) return { ok: false, error: error.message };

  const salidas = new Map<string, number>();
  for (const m of (movs ?? []) as { item_id: string; cantidad: number }[]) {
    salidas.set(m.item_id, (salidas.get(m.item_id) ?? 0) + n(m.cantidad));
  }
  if (salidas.size === 0) return { ok: true, filas: [] };

  const ids = [...salidas.keys()];
  const { data: items, error: iErr } = await sb
    .from("inventario_items")
    .select(
      "id, codigo, descripcion, rubro, precio_unitario, proveedor, inventario_stock!inner(cantidad, sede)",
    )
    .in("id", ids)
    .eq("inventario_stock.sede", sede)
    .eq("activo", true);
  if (iErr) return { ok: false, error: iErr.message };

  const baratos = await mapaProveedorMasBarato(sb, ids);

  let filas: RecomendacionCompra[] = ((items ?? []) as Record<string, unknown>[]).map((row) => {
    const stocks = row.inventario_stock as
      | { cantidad: number }[]
      | { cantidad: number };
    const st = Array.isArray(stocks) ? stocks[0] : stocks;
    const stock = n(st?.cantidad);
    const salidasPeriodo = salidas.get(String(row.id)) ?? 0;
    const sugerido = Math.max(0, Math.ceil(salidasPeriodo - stock));
    const precio = row.precio_unitario == null ? null : n(row.precio_unitario);
    const barato = baratos.get(String(row.id));
    const precioReco = barato?.precio ?? precio;
    return {
      item_id: String(row.id),
      codigo: String(row.codigo ?? ""),
      descripcion: String(row.descripcion ?? ""),
      rubro: row.rubro as RubroInventario,
      precio_unitario: precio,
      proveedor: row.proveedor == null ? null : String(row.proveedor),
      stock,
      salidas_periodo: salidasPeriodo,
      sugerido,
      costo_sugerido:
        precioReco == null || sugerido <= 0
          ? null
          : Math.round(precioReco * sugerido * 100) / 100,
      proveedor_mas_barato: barato?.proveedor ?? null,
      precio_mas_barato: barato?.precio ?? null,
    };
  });

  filas = filas
    .filter((f) => f.salidas_periodo > 0)
    .sort((a, b) => b.salidas_periodo - a.salidas_periodo || b.sugerido - a.sugerido);

  if (presupuesto != null) {
    const elegidas: RecomendacionCompra[] = [];
    let gastado = 0;
    for (const f of filas) {
      if (f.sugerido <= 0) continue;
      const costo = f.costo_sugerido ?? 0;
      if (f.precio_unitario == null) {
        elegidas.push(f);
        continue;
      }
      if (gastado + costo <= presupuesto + 0.009) {
        elegidas.push(f);
        gastado += costo;
      } else if (f.precio_unitario > 0) {
        const cabe = Math.floor((presupuesto - gastado) / f.precio_unitario);
        if (cabe > 0) {
          elegidas.push({
            ...f,
            sugerido: cabe,
            costo_sugerido: Math.round(f.precio_unitario * cabe * 100) / 100,
          });
          gastado += f.precio_unitario * cabe;
        }
        break;
      }
    }
    filas = elegidas.length ? elegidas : filas.filter((f) => f.sugerido > 0).slice(0, 15);
  } else {
    filas = filas.filter((f) => f.sugerido > 0 || f.salidas_periodo > 0).slice(0, 25);
  }

  return { ok: true, filas };
}

export async function registrarMovimiento(input: {
  itemId: string;
  sede: string;
  tipo: string;
  cantidad: number;
  fecha: string;
  /** Salida: "carro" (default) o "taller". */
  destinoSalida?: string | null;
  vehiculoNumero?: string | null;
  proveedor?: string | null;
  /** Solo entradas: precio de esta compra; actualiza el catálogo. */
  precioUnitario?: number | null;
  notas?: string | null;
}): Promise<ResultadoInv> {
  const sesion = await exigirAdmin();
  if (!sesion) return { ok: false, error: "Sin permiso." };

  const itemId = String(input.itemId ?? "").trim();
  const sede = normalizarSedeInventario(input.sede);
  const tipo = String(input.tipo ?? "").trim() as TipoMovimientoInventario;
  const cantidad = n(input.cantidad);
  const fecha = String(input.fecha ?? "").trim().slice(0, 10);
  const destinoRaw = String(input.destinoSalida ?? "carro").trim().toLowerCase();
  const paraTaller = tipo === "salida" && destinoRaw === "taller";

  if (!itemId) return { ok: false, error: "Elegí el ítem." };
  if (!sede) return { ok: false, error: "Elegí la sede." };
  if (tipo !== "entrada" && tipo !== "salida") {
    return { ok: false, error: "Usá transferencia para mover entre sedes." };
  }
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor a 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida." };

  let vehiculoId: string | null = null;
  let vehiculoNumero: string | null = null;
  if (tipo === "salida" && !paraTaller) {
    const veh = await resolverVehiculo(String(input.vehiculoNumero ?? ""));
    if (!veh.ok) return veh;
    vehiculoId = veh.id;
    vehiculoNumero = veh.numero;
  }

  const sb = createServerSupabase();

  let proveedor: string | null = null;
  let proveedorId: string | null = null;
  if (tipo === "entrada") {
    const aseg = await asegurarProveedor(sb, String(input.proveedor ?? ""));
    if (!aseg.ok) return aseg;
    proveedor = aseg.nombre;
    proveedorId = aseg.id;
  }

  let precioEntrada: number | null = null;
  if (tipo === "entrada" && input.precioUnitario != null && String(input.precioUnitario) !== "") {
    const p = n(input.precioUnitario);
    if (p < 0) return { ok: false, error: "El precio no puede ser negativo." };
    precioEntrada = Math.round(p * 100) / 100;
  }

  const stock = await stockDe(sb, itemId, sede);
  if (!stock.ok) return stock;

  const nuevo = tipo === "entrada" ? stock.cantidad + cantidad : stock.cantidad - cantidad;
  if (tipo === "salida" && nuevo < -0.0005) {
    return { ok: false, error: `No hay suficiente stock (hay ${stock.cantidad}).` };
  }

  const body: Record<string, unknown> = {
    item_id: itemId,
    sede,
    tipo,
    cantidad,
    fecha,
    vehiculo_id: vehiculoId,
    vehiculo_numero: vehiculoNumero,
    para_taller: paraTaller,
    proveedor,
    proveedor_id: proveedorId,
    notas: String(input.notas ?? "").trim() || null,
    creado_por: sesion.id,
    // Taller = consumo interno → empresa; carro = cobro pendiente.
    cobro_a: paraTaller ? "empresa" : null,
    cobro_asignado_at: paraTaller ? new Date().toISOString() : null,
  };
  if (precioEntrada != null) body.precio_unitario = precioEntrada;

  let { error: movErr } = await sb.from("inventario_movimientos").insert(body);
  if (movErr && /para_taller/i.test(movErr.message)) {
    return { ok: false, error: "Falta correr la migración 0066 (salida a taller)." };
  }
  if (movErr && /proveedor_id/i.test(movErr.message)) {
    const { proveedor_id: _pid, ...sinPid } = body;
    const retry = await sb.from("inventario_movimientos").insert(sinPid);
    movErr = retry.error;
  }
  if (movErr && /precio_unitario/i.test(movErr.message)) {
    const { precio_unitario: _p, proveedor_id: _pid, ...sinPrecio } = body;
    const retry = await sb.from("inventario_movimientos").insert(sinPrecio);
    movErr = retry.error;
  }
  if (movErr && /vehiculo_id|cobro_a|sede_destino|cobro_asignado_at/i.test(movErr.message)) {
    const { vehiculo_id: _v, cobro_a: _c, cobro_asignado_at: _ca, precio_unitario: _p, proveedor_id: _pid, ...sin } =
      body;
    const retry = await sb.from("inventario_movimientos").insert(sin);
    movErr = retry.error;
  }
  if (movErr) return { ok: false, error: movErr.message };

  const up = await setStock(sb, itemId, sede, nuevo);
  if (!up.ok) return up;

  if (tipo === "entrada" && (precioEntrada != null || proveedor)) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (precioEntrada != null) patch.precio_unitario = precioEntrada;
    if (proveedor) patch.proveedor = proveedor;
    await sb.from("inventario_items").update(patch).eq("id", itemId);
  }

  revalidar();
  return {
    ok: true,
    msg:
      tipo === "entrada"
        ? [
            "Entrada registrada.",
            proveedor ? `Proveedor: ${proveedor}.` : null,
            precioEntrada != null ? `Precio: $${precioEntrada}.` : null,
          ]
            .filter(Boolean)
            .join(" ")
        : paraTaller
          ? "Salida a taller registrada (cobra empresa)."
          : `Salida al carro ${vehiculoNumero}. Cobro pendiente (cliente/empresa).`,
  };
}

export async function listarProveedores(): Promise<
  { ok: true; filas: ProveedorVista[]; nombres: string[] } | { ok: false; error: string }
> {
  if (!(await exigirAdmin())) return { ok: false, error: "Sin permiso." };
  const sb = createServerSupabase();
  const { data: provs, error } = await sb
    .from("inventario_proveedores")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");
  if (error) {
    if (/inventario_proveedores|does not exist/i.test(error.message)) {
      return { ok: true, filas: [], nombres: [] };
    }
    return { ok: false, error: error.message };
  }

  const { data: movs } = await sb
    .from("inventario_movimientos")
    .select("proveedor, proveedor_id, item_id, fecha")
    .eq("tipo", "entrada")
    .not("proveedor", "is", null)
    .limit(5000);

  const stats = new Map<
    string,
    { entradas: number; items: Set<string>; ultima: string | null; nombre: string }
  >();

  for (const p of (provs ?? []) as { id: string; nombre: string }[]) {
    stats.set(p.id, { entradas: 0, items: new Set(), ultima: null, nombre: p.nombre });
  }

  for (const m of (movs ?? []) as {
    proveedor: string | null;
    proveedor_id: string | null;
    item_id: string;
    fecha: string;
  }[]) {
    const key = m.proveedor_id || normalizarNombreProveedor(String(m.proveedor ?? ""));
    if (!key) continue;
    let cur = stats.get(key);
    if (!cur) {
      // movimiento sin proveedor_id aún: agrupar por nombre
      const nombre = String(m.proveedor ?? "").trim();
      if (!nombre) continue;
      cur = { entradas: 0, items: new Set(), ultima: null, nombre };
      stats.set(key, cur);
    }
    cur.entradas += 1;
    cur.items.add(m.item_id);
    const f = String(m.fecha).slice(0, 10);
    if (!cur.ultima || f > cur.ultima) cur.ultima = f;
  }

  const filas: ProveedorVista[] = [...stats.entries()]
    .map(([id, s]) => ({
      id,
      nombre: s.nombre,
      entradas: s.entradas,
      items_distintos: s.items.size,
      ultima_fecha: s.ultima,
    }))
    .filter((f) => f.entradas > 0 || (provs ?? []).some((p: { id: string }) => p.id === f.id))
    .sort((a, b) => b.entradas - a.entradas || a.nombre.localeCompare(b.nombre, "es"));

  const nombres = [
    ...new Set(
      [
        ...((provs ?? []) as { nombre: string }[]).map((p) => p.nombre),
        ...filas.map((f) => f.nombre),
      ].filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));

  return { ok: true, filas, nombres };
}

/** Por pieza: precios vistos por proveedor (para recomendar el más barato). */
export async function listarComparativaPrecios(): Promise<
  { ok: true; filas: ComparativaPrecioItem[] } | { ok: false; error: string }
> {
  if (!(await exigirAdmin())) return { ok: false, error: "Sin permiso." };
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("inventario_movimientos")
    .select(
      "item_id, proveedor, precio_unitario, fecha, item:inventario_items(codigo, descripcion, rubro)",
    )
    .eq("tipo", "entrada")
    .not("precio_unitario", "is", null)
    .not("proveedor", "is", null)
    .order("fecha", { ascending: false })
    .limit(5000);
  if (error) {
    if (/precio_unitario/i.test(error.message)) return { ok: true, filas: [] };
    return { ok: false, error: error.message };
  }

  type Opt = ComparativaPrecioItem["opciones"][number];
  const byItem = new Map<
    string,
    {
      codigo: string;
      descripcion: string;
      rubro: RubroInventario;
      porProv: Map<string, Opt>;
    }
  >();

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const itemRaw = row.item as
      | { codigo: string; descripcion: string; rubro: RubroInventario }
      | { codigo: string; descripcion: string; rubro: RubroInventario }[]
      | null;
    const item = Array.isArray(itemRaw) ? itemRaw[0] : itemRaw;
    const itemId = String(row.item_id);
    const proveedor = String(row.proveedor ?? "").trim();
    const precio = n(row.precio_unitario);
    const fecha = String(row.fecha).slice(0, 10);
    if (!proveedor || !(precio > 0)) continue;

    let cur = byItem.get(itemId);
    if (!cur) {
      cur = {
        codigo: item?.codigo ?? "",
        descripcion: item?.descripcion ?? "",
        rubro: (item?.rubro ?? "mecanica") as RubroInventario,
        porProv: new Map(),
      };
      byItem.set(itemId, cur);
    }
    const norm = normalizarNombreProveedor(proveedor);
    const prev = cur.porProv.get(norm);
    if (!prev) {
      cur.porProv.set(norm, {
        proveedor_id: norm,
        proveedor,
        precio_ultimo: precio,
        precio_min: precio,
        compras: 1,
        ultima_fecha: fecha,
      });
    } else {
      prev.compras += 1;
      if (precio < prev.precio_min) prev.precio_min = precio;
      if (fecha >= prev.ultima_fecha) {
        prev.ultima_fecha = fecha;
        prev.precio_ultimo = precio;
        prev.proveedor = proveedor;
      }
    }
  }

  const filas: ComparativaPrecioItem[] = [...byItem.entries()].map(([item_id, v]) => {
    const opciones = [...v.porProv.values()].sort((a, b) => a.precio_min - b.precio_min);
    const mas = opciones[0] ?? null;
    return {
      item_id,
      codigo: v.codigo,
      descripcion: v.descripcion,
      rubro: v.rubro,
      opciones,
      mas_barato: mas ? { proveedor: mas.proveedor, precio: mas.precio_min } : null,
      comparable: opciones.length >= 2,
    };
  });

  filas.sort((a, b) => {
    if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
    return a.descripcion.localeCompare(b.descripcion, "es");
  });

  return { ok: true, filas };
}

export async function transferirEntreSedes(input: {
  itemId: string;
  sedeOrigen: string;
  cantidad: number;
  fecha: string;
  notas?: string | null;
}): Promise<ResultadoInv> {
  const sesion = await exigirAdmin();
  if (!sesion) return { ok: false, error: "Sin permiso." };

  const itemId = String(input.itemId ?? "").trim();
  const origen = normalizarSedeInventario(input.sedeOrigen);
  const cantidad = n(input.cantidad);
  const fecha = String(input.fecha ?? "").trim().slice(0, 10);
  if (!itemId || !origen) return { ok: false, error: "Falta ítem o sede." };
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor a 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida." };

  const destino = otraSede(origen);
  const sb = createServerSupabase();
  const stockO = await stockDe(sb, itemId, origen);
  if (!stockO.ok) return stockO;
  if (stockO.cantidad - cantidad < -0.0005) {
    return { ok: false, error: `No hay suficiente stock en origen (hay ${stockO.cantidad}).` };
  }
  const stockD = await stockDe(sb, itemId, destino);
  if (!stockD.ok) return stockD;

  const body = {
    item_id: itemId,
    sede: origen,
    sede_destino: destino,
    tipo: "transferencia",
    cantidad,
    fecha,
    notas: String(input.notas ?? "").trim() || null,
    creado_por: sesion.id,
  };
  let { error } = await sb.from("inventario_movimientos").insert(body);
  if (error && /sede_destino|transferencia/i.test(error.message)) {
    return {
      ok: false,
      error: "Falta correr la migración 0062 (transferencias).",
    };
  }
  if (error) return { ok: false, error: error.message };

  const a = await setStock(sb, itemId, origen, stockO.cantidad - cantidad);
  if (!a.ok) return a;
  const b = await setStock(sb, itemId, destino, stockD.cantidad + cantidad);
  if (!b.ok) return b;

  revalidar();
  return {
    ok: true,
    msg: `Transferencia hecha a ${destino === "chorrera" ? "La Chorrera" : "Juan Díaz"}.`,
  };
}

export async function asignarCobroSalida(input: {
  movimientoId: string;
  cobroA: string;
}): Promise<ResultadoInv> {
  const sesion = await exigirAdmin();
  if (!sesion) return { ok: false, error: "Sin permiso." };
  const id = String(input.movimientoId ?? "").trim();
  const cobro = normalizarCobro(input.cobroA);
  if (!id) return { ok: false, error: "Falta el movimiento." };
  if (!cobro) return { ok: false, error: "Elegí cliente o empresa." };

  const sb = createServerSupabase();
  const { data, error: leerErr } = await sb
    .from("inventario_movimientos")
    .select("id, tipo, cobro_a")
    .eq("id", id)
    .maybeSingle();
  if (leerErr) return { ok: false, error: leerErr.message };
  if (!data) return { ok: false, error: "No encontré esa salida." };
  if (data.tipo !== "salida") return { ok: false, error: "Solo se asigna cobro a salidas." };

  const { error } = await sb
    .from("inventario_movimientos")
    .update({
      cobro_a: cobro,
      cobro_asignado_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    if (/cobro_a/i.test(error.message)) {
      return { ok: false, error: "Falta correr la migración 0062 (cobro)." };
    }
    return { ok: false, error: error.message };
  }
  revalidar();
  return { ok: true, msg: `Cobro asignado a ${cobro === "cliente" ? "cliente" : "empresa"}.` };
}

export async function ajustarStock(input: {
  itemId: string;
  sede: string;
  cantidadNueva: number;
  fecha: string;
  notas?: string | null;
}): Promise<ResultadoInv> {
  const sesion = await exigirAdmin();
  if (!sesion) return { ok: false, error: "Sin permiso." };

  const itemId = String(input.itemId ?? "").trim();
  const sede = normalizarSedeInventario(input.sede);
  const cantidadNueva = n(input.cantidadNueva);
  const fecha = String(input.fecha ?? "").trim().slice(0, 10);
  if (!itemId || !sede) return { ok: false, error: "Falta ítem o sede." };
  if (cantidadNueva < 0) return { ok: false, error: "La cantidad no puede ser negativa." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida." };

  const sb = createServerSupabase();
  const stock = await stockDe(sb, itemId, sede);
  if (!stock.ok) return stock;

  const delta = Math.round((cantidadNueva - stock.cantidad) * 1000) / 1000;
  if (Math.abs(delta) < 0.0005) return { ok: true, msg: "Sin cambios." };

  const tipo: TipoMovimientoInventario = delta > 0 ? "entrada" : "salida";
  const cantidad = Math.abs(delta);
  const notaBase = String(input.notas ?? "").trim();
  const notas = notaBase
    ? `Ajuste de inventario: ${notaBase}`
    : `Ajuste de inventario (${stock.cantidad} → ${cantidadNueva}).`;

  // Ajuste no es salida a carro: no exige vehículo ni cobro.
  const { error: movErr } = await sb.from("inventario_movimientos").insert({
    item_id: itemId,
    sede,
    tipo,
    cantidad,
    fecha,
    notas,
    creado_por: sesion.id,
  });
  if (movErr) return { ok: false, error: movErr.message };

  const up = await setStock(sb, itemId, sede, cantidadNueva);
  if (!up.ok) return up;

  revalidar();
  return { ok: true, msg: "Stock actualizado." };
}

export async function crearItemInventario(input: {
  rubro: string;
  codigo: string;
  descripcion: string;
  precioUnitario?: number | null;
  proveedor?: string | null;
}): Promise<ResultadoInv> {
  const sesion = await exigirAdmin();
  if (!sesion) return { ok: false, error: "Sin permiso." };

  const rubro = normalizarRubro(input.rubro);
  const codigo = String(input.codigo ?? "").trim();
  const descripcion = String(input.descripcion ?? "").trim();
  if (!rubro) return { ok: false, error: "Elegí chapistería o mecánica." };
  if (!codigo) return { ok: false, error: "Poné el código." };
  if (!descripcion) return { ok: false, error: "Poné la descripción." };

  let precio: number | null = null;
  if (input.precioUnitario != null && String(input.precioUnitario) !== "") {
    precio = Math.round(n(input.precioUnitario) * 100) / 100;
    if (precio < 0) return { ok: false, error: "El precio no puede ser negativo." };
  }
  const proveedor = String(input.proveedor ?? "").trim() || null;

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("inventario_items")
    .insert({
      rubro,
      codigo,
      descripcion,
      precio_unitario: precio,
      proveedor,
      activo: true,
    })
    .select("id")
    .single();
  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      return { ok: false, error: "Ya existe un ítem con ese código en ese rubro." };
    }
    return { ok: false, error: error.message };
  }

  const itemId = String(data.id);
  const stockRows = [
    { item_id: itemId, sede: "juan_diaz", cantidad: 0 },
    { item_id: itemId, sede: "chorrera", cantidad: 0 },
  ];
  const { error: sErr } = await sb.from("inventario_stock").insert(stockRows);
  if (sErr) return { ok: false, error: sErr.message };

  revalidar();
  return { ok: true, msg: "Ítem creado con stock 0 en ambas sedes." };
}

export async function actualizarItemInventario(input: {
  itemId: string;
  codigo: string;
  descripcion: string;
  rubro: string;
  precioUnitario?: number | null;
  proveedor?: string | null;
  activo?: boolean;
}): Promise<ResultadoInv> {
  const sesion = await exigirAdmin();
  if (!sesion) return { ok: false, error: "Sin permiso." };

  const itemId = String(input.itemId ?? "").trim();
  const rubro = normalizarRubro(input.rubro);
  const codigo = String(input.codigo ?? "").trim();
  const descripcion = String(input.descripcion ?? "").trim();
  if (!itemId) return { ok: false, error: "Falta el ítem." };
  if (!rubro) return { ok: false, error: "Elegí chapistería o mecánica." };
  if (!codigo || !descripcion) return { ok: false, error: "Código y descripción son obligatorios." };

  let precio: number | null = null;
  if (input.precioUnitario != null && String(input.precioUnitario) !== "") {
    precio = Math.round(n(input.precioUnitario) * 100) / 100;
    if (precio < 0) return { ok: false, error: "El precio no puede ser negativo." };
  }

  const sb = createServerSupabase();
  const { error } = await sb
    .from("inventario_items")
    .update({
      rubro,
      codigo,
      descripcion,
      precio_unitario: precio,
      proveedor: String(input.proveedor ?? "").trim() || null,
      activo: input.activo !== false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      return { ok: false, error: "Ya existe otro ítem con ese código en ese rubro." };
    }
    return { ok: false, error: error.message };
  }
  revalidar();
  return { ok: true, msg: "Ítem actualizado." };
}

/** Corrige una entrada/salida/transferencia. Motivo obligatorio; queda en el historial. */
export async function editarMovimiento(input: {
  movimientoId: string;
  cantidad: number;
  fecha: string;
  motivo: string;
  destinoSalida?: string | null;
  vehiculoNumero?: string | null;
  proveedor?: string | null;
  precioUnitario?: number | null;
  notas?: string | null;
}): Promise<ResultadoInv> {
  const sesion = await exigirAdmin();
  if (!sesion) return { ok: false, error: "Sin permiso." };

  const id = String(input.movimientoId ?? "").trim();
  const motivo = String(input.motivo ?? "").trim();
  const cantidad = n(input.cantidad);
  const fecha = String(input.fecha ?? "").trim().slice(0, 10);
  if (!id) return { ok: false, error: "Falta el movimiento." };
  if (motivo.length < 5) return { ok: false, error: "El motivo de la corrección es obligatorio (mín. 5 caracteres)." };
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor a 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida." };

  const sb = createServerSupabase();
  const probe = await sb.from("inventario_movimientos_ediciones").select("id").limit(1);
  if (probe.error && /inventario_movimientos_ediciones|does not exist/i.test(probe.error.message)) {
    return { ok: false, error: "Falta correr la migración 0065 (historial de ediciones)." };
  }

  const { data: row, error: leerErr } = await sb
    .from("inventario_movimientos")
    .select(
      "id, item_id, tipo, cantidad, fecha, vehiculo_numero, vehiculo_id, para_taller, proveedor, precio_unitario, notas, sede, sede_destino, cobro_a",
    )
    .eq("id", id)
    .maybeSingle();
  if (leerErr) {
    if (/para_taller/i.test(leerErr.message)) {
      return { ok: false, error: "Falta correr la migración 0066 (salida a taller)." };
    }
    return { ok: false, error: leerErr.message };
  }
  if (!row) return { ok: false, error: "No encontré ese movimiento." };

  const antes = snapshotMovimiento(row as Record<string, unknown>);
  const tipo = String(row.tipo) as TipoMovimientoInventario;
  const itemId = String(row.item_id);
  const sede = row.sede as SedeInventario;
  const cantAntes = n(row.cantidad);

  const destinoRaw =
    input.destinoSalida != null && String(input.destinoSalida).trim() !== ""
      ? String(input.destinoSalida).trim().toLowerCase()
      : Boolean(row.para_taller)
        ? "taller"
        : "carro";
  const paraTaller = tipo === "salida" && destinoRaw === "taller";

  let vehiculoId: string | null = null;
  let vehiculoNumero: string | null = null;
  if (tipo === "salida" && !paraTaller) {
    const veh = await resolverVehiculo(
      String(input.vehiculoNumero ?? row.vehiculo_numero ?? ""),
    );
    if (!veh.ok) return veh;
    vehiculoId = veh.id;
    vehiculoNumero = veh.numero;
  }

  let proveedor = (row.proveedor as string | null) ?? null;
  let proveedorId: string | null = null;
  let precio: number | null =
    row.precio_unitario == null ? null : n(row.precio_unitario);

  if (tipo === "entrada") {
    const aseg = await asegurarProveedor(sb, String(input.proveedor ?? proveedor ?? ""));
    if (!aseg.ok) return aseg;
    proveedor = aseg.nombre;
    proveedorId = aseg.id;
    if (input.precioUnitario != null && String(input.precioUnitario) !== "") {
      precio = Math.round(n(input.precioUnitario) * 100) / 100;
      if (precio < 0) return { ok: false, error: "El precio no puede ser negativo." };
    }
  }

  const deltaCant = Math.round((cantidad - cantAntes) * 1000) / 1000;
  if (Math.abs(deltaCant) > 0.0005) {
    if (tipo === "entrada") {
      const st = await stockDe(sb, itemId, sede);
      if (!st.ok) return st;
      const up = await setStock(sb, itemId, sede, st.cantidad + deltaCant);
      if (!up.ok) return up;
    } else if (tipo === "salida") {
      const st = await stockDe(sb, itemId, sede);
      if (!st.ok) return st;
      // aumentar cantidad de salida → baja más stock
      const nuevo = st.cantidad - deltaCant;
      if (nuevo < -0.0005) {
        return { ok: false, error: `No hay stock suficiente para esa corrección (hay ${st.cantidad}).` };
      }
      const up = await setStock(sb, itemId, sede, nuevo);
      if (!up.ok) return up;
    } else if (tipo === "transferencia") {
      const destino = (row.sede_destino as SedeInventario | null) ?? null;
      if (!destino) return { ok: false, error: "Transferencia sin sede destino." };
      const stO = await stockDe(sb, itemId, sede);
      if (!stO.ok) return stO;
      const stD = await stockDe(sb, itemId, destino);
      if (!stD.ok) return stD;
      const nuevoO = stO.cantidad - deltaCant;
      const nuevoD = stD.cantidad + deltaCant;
      if (nuevoO < -0.0005) {
        return { ok: false, error: `No hay stock en origen para esa corrección (hay ${stO.cantidad}).` };
      }
      const a = await setStock(sb, itemId, sede, nuevoO);
      if (!a.ok) return a;
      const b = await setStock(sb, itemId, destino, nuevoD);
      if (!b.ok) return b;
    }
  }

  const patch: Record<string, unknown> = {
    cantidad,
    fecha,
    notas: String(input.notas ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (tipo === "salida") {
    patch.vehiculo_id = vehiculoId;
    patch.vehiculo_numero = vehiculoNumero;
    patch.para_taller = paraTaller;
    if (paraTaller) {
      // Pasó a taller: cobro empresa. Si era carro con cobro ya asignado y vuelve a carro, no tocamos cobro_a.
      patch.cobro_a = "empresa";
      patch.cobro_asignado_at = new Date().toISOString();
    } else if (Boolean(row.para_taller) && !paraTaller) {
      // Pasó de taller a carro: vuelve a pendiente de cobro.
      patch.cobro_a = null;
      patch.cobro_asignado_at = null;
    }
  }
  if (tipo === "entrada") {
    patch.proveedor = proveedor;
    if (proveedorId) patch.proveedor_id = proveedorId;
    patch.precio_unitario = precio;
  }

  const { error: upErr } = await sb.from("inventario_movimientos").update(patch).eq("id", id);
  if (upErr) {
    if (/para_taller/i.test(upErr.message)) {
      return { ok: false, error: "Falta correr la migración 0066 (salida a taller)." };
    }
    return { ok: false, error: upErr.message };
  }

  const despues = {
    ...antes,
    cantidad,
    fecha,
    vehiculo_numero: tipo === "salida" ? vehiculoNumero : antes.vehiculo_numero,
    vehiculo_id: tipo === "salida" ? vehiculoId : antes.vehiculo_id,
    para_taller: tipo === "salida" ? paraTaller : antes.para_taller,
    proveedor: tipo === "entrada" ? proveedor : antes.proveedor,
    precio_unitario: tipo === "entrada" ? precio : antes.precio_unitario,
    notas: String(input.notas ?? "").trim() || null,
  };

  const { error: histErr } = await sb.from("inventario_movimientos_ediciones").insert({
    movimiento_id: id,
    motivo,
    antes,
    despues,
    editado_por: sesion.id,
  });
  if (histErr) {
    return { ok: false, error: `Movimiento corregido, pero no pude guardar el historial: ${histErr.message}` };
  }

  if (tipo === "entrada" && (precio != null || proveedor)) {
    const itemPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (precio != null) itemPatch.precio_unitario = precio;
    if (proveedor) itemPatch.proveedor = proveedor;
    await sb.from("inventario_items").update(itemPatch).eq("id", itemId);
  }

  revalidar();
  return { ok: true, msg: "Movimiento corregido. Quedó el motivo en el historial." };
}

export async function listarEdicionesMovimiento(
  movimientoId: string,
): Promise<{ ok: true; filas: EdicionMovimientoVista[] } | { ok: false; error: string }> {
  if (!(await exigirAdmin())) return { ok: false, error: "Sin permiso." };
  const id = String(movimientoId ?? "").trim();
  if (!id) return { ok: false, error: "Falta el movimiento." };
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("inventario_movimientos_ediciones")
    .select("id, motivo, antes, despues, created_at, editor:equipo!inventario_movimientos_ediciones_editado_por_fkey(nombre)")
    .eq("movimiento_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    if (/inventario_movimientos_ediciones|does not exist/i.test(error.message)) {
      return { ok: true, filas: [] };
    }
    // fallback sin join
    const retry = await sb
      .from("inventario_movimientos_ediciones")
      .select("id, motivo, antes, despues, created_at")
      .eq("movimiento_id", id)
      .order("created_at", { ascending: false });
    if (retry.error) return { ok: false, error: retry.error.message };
    return {
      ok: true,
      filas: ((retry.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        motivo: String(r.motivo ?? ""),
        antes: (r.antes as Record<string, unknown>) ?? {},
        despues: (r.despues as Record<string, unknown>) ?? {},
        created_at: String(r.created_at ?? ""),
        editor: null,
      })),
    };
  }

  return {
    ok: true,
    filas: ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const ed = r.editor as { nombre?: string } | { nombre?: string }[] | null;
      const nombre = Array.isArray(ed) ? ed[0]?.nombre : ed?.nombre;
      return {
        id: String(r.id),
        motivo: String(r.motivo ?? ""),
        antes: (r.antes as Record<string, unknown>) ?? {},
        despues: (r.despues as Record<string, unknown>) ?? {},
        created_at: String(r.created_at ?? ""),
        editor: nombre ?? null,
      };
    }),
  };
}
