"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionEquipo } from "@/lib/equipo/sesion";
import {
  normalizarCobro,
  normalizarRubro,
  normalizarSedeInventario,
  otraSede,
  type ItemInventarioVista,
  type MovimientoInventarioVista,
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
  return {
    id: String(row.id),
    tipo: row.tipo as TipoMovimientoInventario,
    cantidad: n(row.cantidad),
    fecha: String(row.fecha).slice(0, 10),
    vehiculo_numero: row.vehiculo_numero == null ? null : String(row.vehiculo_numero),
    vehiculo_id: row.vehiculo_id == null ? null : String(row.vehiculo_id),
    proveedor: row.proveedor == null ? null : String(row.proveedor),
    notas: row.notas == null ? null : String(row.notas),
    codigo: item?.codigo ?? "",
    descripcion: item?.descripcion ?? "",
    rubro: (item?.rubro ?? "mecanica") as RubroInventario,
    sede: row.sede as SedeInventario,
    sede_destino: (row.sede_destino as SedeInventario | null) ?? null,
    cobro_a: (row.cobro_a as MovimientoInventarioVista["cobro_a"]) ?? null,
    created_at: String(row.created_at ?? ""),
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
    "id, tipo, cantidad, fecha, vehiculo_numero, vehiculo_id, proveedor, notas, sede, sede_destino, cobro_a, created_at, item:inventario_items(codigo, descripcion, rubro)";
  const selBase =
    "id, tipo, cantidad, fecha, vehiculo_numero, proveedor, notas, sede, created_at, item:inventario_items(codigo, descripcion, rubro)";

  let { data, error } = await sb
    .from("inventario_movimientos")
    .select(selFull)
    .eq("sede", sede)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error && /sede_destino|cobro_a|vehiculo_id/i.test(error.message)) {
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
      "id, tipo, cantidad, fecha, vehiculo_numero, vehiculo_id, proveedor, notas, sede, sede_destino, cobro_a, created_at, item:inventario_items(codigo, descripcion, rubro)",
    )
    .eq("tipo", "salida")
    .is("cobro_a", null)
    .not("vehiculo_numero", "is", null)
    .order("fecha", { ascending: false })
    .limit(100);
  if (sede) q = q.eq("sede", sede);
  const { data, error } = await q;
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

  let filas: RecomendacionCompra[] = ((items ?? []) as Record<string, unknown>[]).map((row) => {
    const stocks = row.inventario_stock as
      | { cantidad: number }[]
      | { cantidad: number };
    const st = Array.isArray(stocks) ? stocks[0] : stocks;
    const stock = n(st?.cantidad);
    const salidasPeriodo = salidas.get(String(row.id)) ?? 0;
    const sugerido = Math.max(0, Math.ceil(salidasPeriodo - stock));
    const precio = row.precio_unitario == null ? null : n(row.precio_unitario);
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
      costo_sugerido: precio == null ? null : Math.round(precio * sugerido * 100) / 100,
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

  if (!itemId) return { ok: false, error: "Elegí el ítem." };
  if (!sede) return { ok: false, error: "Elegí la sede." };
  if (tipo !== "entrada" && tipo !== "salida") {
    return { ok: false, error: "Usá transferencia para mover entre sedes." };
  }
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor a 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida." };

  let vehiculoId: string | null = null;
  let vehiculoNumero: string | null = null;
  if (tipo === "salida") {
    const veh = await resolverVehiculo(String(input.vehiculoNumero ?? ""));
    if (!veh.ok) return veh;
    vehiculoId = veh.id;
    vehiculoNumero = veh.numero;
  }

  const proveedor =
    tipo === "entrada" ? String(input.proveedor ?? "").trim() || null : null;
  let precioEntrada: number | null = null;
  if (tipo === "entrada" && input.precioUnitario != null && String(input.precioUnitario) !== "") {
    const p = n(input.precioUnitario);
    if (p < 0) return { ok: false, error: "El precio no puede ser negativo." };
    precioEntrada = Math.round(p * 100) / 100;
  }

  const sb = createServerSupabase();
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
    proveedor,
    notas: String(input.notas ?? "").trim() || null,
    creado_por: sesion.id,
    cobro_a: null,
  };
  if (precioEntrada != null) body.precio_unitario = precioEntrada;

  let { error: movErr } = await sb.from("inventario_movimientos").insert(body);
  if (movErr && /precio_unitario/i.test(movErr.message)) {
    const { precio_unitario: _p, ...sinPrecio } = body;
    const retry = await sb.from("inventario_movimientos").insert(sinPrecio);
    movErr = retry.error;
  }
  if (movErr && /vehiculo_id|cobro_a|sede_destino/i.test(movErr.message)) {
    const { vehiculo_id: _v, cobro_a: _c, precio_unitario: _p, ...sin } = body;
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
        ? precioEntrada != null
          ? `Entrada registrada. Precio catálogo: $${precioEntrada}.`
          : "Entrada registrada."
        : `Salida al carro ${vehiculoNumero}. Cobro pendiente (cliente/empresa).`,
  };
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
