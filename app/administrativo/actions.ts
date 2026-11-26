"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionEquipo } from "@/lib/equipo/sesion";
import {
  normalizarRubro,
  normalizarSedeInventario,
  type ItemInventarioVista,
  type MovimientoInventarioVista,
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
    const stocks = row.inventario_stock as { cantidad: number; sede: string }[] | { cantidad: number; sede: string };
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
  const { data, error } = await sb
    .from("inventario_movimientos")
    .select(
      "id, tipo, cantidad, fecha, vehiculo_numero, proveedor, notas, sede, created_at, item:inventario_items(codigo, descripcion, rubro)",
    )
    .eq("sede", sede)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) return { ok: false, error: error.message };

  const filas: MovimientoInventarioVista[] = ((data ?? []) as Record<string, unknown>[]).map((row) => {
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
      proveedor: row.proveedor == null ? null : String(row.proveedor),
      notas: row.notas == null ? null : String(row.notas),
      codigo: item?.codigo ?? "",
      descripcion: item?.descripcion ?? "",
      rubro: (item?.rubro ?? "mecanica") as RubroInventario,
      sede: row.sede as SedeInventario,
      created_at: String(row.created_at ?? ""),
    };
  });
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
  if (tipo !== "entrada" && tipo !== "salida") return { ok: false, error: "Tipo inválido." };
  if (!(cantidad > 0)) return { ok: false, error: "La cantidad debe ser mayor a 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida." };

  const sb = createServerSupabase();
  const { data: stockRow, error: stockErr } = await sb
    .from("inventario_stock")
    .select("cantidad")
    .eq("item_id", itemId)
    .eq("sede", sede)
    .maybeSingle();
  if (stockErr) return { ok: false, error: stockErr.message };

  const actual = n(stockRow?.cantidad);
  const nuevo = tipo === "entrada" ? actual + cantidad : actual - cantidad;
  if (tipo === "salida" && nuevo < -0.0005) {
    return { ok: false, error: `No hay suficiente stock (hay ${actual}).` };
  }

  const { error: movErr } = await sb.from("inventario_movimientos").insert({
    item_id: itemId,
    sede,
    tipo,
    cantidad,
    fecha,
    vehiculo_numero: String(input.vehiculoNumero ?? "").trim() || null,
    proveedor: String(input.proveedor ?? "").trim() || null,
    notas: String(input.notas ?? "").trim() || null,
    creado_por: sesion.id,
  });
  if (movErr) return { ok: false, error: movErr.message };

  const { error: upErr } = await sb
    .from("inventario_stock")
    .upsert(
      {
        item_id: itemId,
        sede,
        cantidad: Math.round(nuevo * 1000) / 1000,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id,sede" },
    );
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/administrativo");
  revalidatePath("/administrativo/inventario");
  return { ok: true, msg: tipo === "entrada" ? "Entrada registrada." : "Salida registrada." };
}

/** Ajuste directo del stock (conteo físico). Deja traza como entrada/salida. */
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
  const { data: stockRow, error: stockErr } = await sb
    .from("inventario_stock")
    .select("cantidad")
    .eq("item_id", itemId)
    .eq("sede", sede)
    .maybeSingle();
  if (stockErr) return { ok: false, error: stockErr.message };

  const actual = n(stockRow?.cantidad);
  const delta = Math.round((cantidadNueva - actual) * 1000) / 1000;
  if (Math.abs(delta) < 0.0005) return { ok: true, msg: "Sin cambios." };

  const tipo: TipoMovimientoInventario = delta > 0 ? "entrada" : "salida";
  const cantidad = Math.abs(delta);
  const notaBase = String(input.notas ?? "").trim();
  const notas = notaBase
    ? `Ajuste de inventario: ${notaBase}`
    : `Ajuste de inventario (${actual} → ${cantidadNueva}).`;

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

  const { error: upErr } = await sb
    .from("inventario_stock")
    .upsert(
      {
        item_id: itemId,
        sede,
        cantidad: cantidadNueva,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id,sede" },
    );
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/administrativo");
  revalidatePath("/administrativo/inventario");
  return { ok: true, msg: "Stock actualizado." };
}
