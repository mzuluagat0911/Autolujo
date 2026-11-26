"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, FiltersBar, Kpi, StatusChip, Tabs, Toast } from "@/components/kit";
import { Field, Select } from "@/components/form";
import {
  COBROS_INVENTARIO,
  etiquetaCobro,
  etiquetaRubro,
  etiquetaSedeInventario,
  etiquetaTipoMovimiento,
  otraSede,
  RUBROS_INVENTARIO,
  SEDES_INVENTARIO,
  type ComparativaPrecioItem,
  type EdicionMovimientoVista,
  type ItemInventarioVista,
  type MovimientoInventarioVista,
  type ProveedorVista,
  type RecomendacionCompra,
  type RubroInventario,
  type SedeInventario,
} from "@/lib/administrativo/inventario";
import {
  actualizarItemInventario,
  ajustarStock,
  asignarCobroSalida,
  crearItemInventario,
  editarMovimiento,
  listarEdicionesMovimiento,
  registrarMovimiento,
  transferirEntreSedes,
} from "../actions";

type TabId = "stock" | "cobros" | "comprar" | "proveedores" | "movimientos";

function money(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-PA", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function InventarioVista({
  sede,
  rubro,
  filas,
  filasFiltradas,
  movimientos,
  pendientesCobro,
  recomendaciones,
  proveedores,
  nombresProveedores,
  comparativaPrecios,
  presupuestoInicial = "",
  fechaHoy,
  error,
}: {
  sede: SedeInventario;
  rubro: RubroInventario | "todos";
  filas: ItemInventarioVista[];
  filasFiltradas: ItemInventarioVista[];
  movimientos: MovimientoInventarioVista[];
  pendientesCobro: MovimientoInventarioVista[];
  recomendaciones: RecomendacionCompra[];
  proveedores: ProveedorVista[];
  nombresProveedores: string[];
  comparativaPrecios: ComparativaPrecioItem[];
  presupuestoInicial?: string;
  fechaHoy: string;
  error: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [soloSinStock, setSoloSinStock] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>(pendientesCobro.length > 0 ? "cobros" : "stock");
  const [movItem, setMovItem] = useState<ItemInventarioVista | null>(null);
  const [movTipo, setMovTipo] = useState<"entrada" | "salida">("salida");
  const [ajusteItem, setAjusteItem] = useState<ItemInventarioVista | null>(null);
  const [xferItem, setXferItem] = useState<ItemInventarioVista | null>(null);
  const [nuevoItemOpen, setNuevoItemOpen] = useState(false);
  const [editarItem, setEditarItem] = useState<ItemInventarioVista | null>(null);
  const [editarMov, setEditarMov] = useState<MovimientoInventarioVista | null>(null);
  const [presupuesto, setPresupuesto] = useState(presupuestoInicial);

  const conStock = useMemo(() => filas.filter((f) => f.cantidad > 0.0005).length, [filas]);
  const aComprar = useMemo(
    () => recomendaciones.filter((r) => r.sugerido > 0).length,
    [recomendaciones],
  );

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return filasFiltradas.filter((f) => {
      if (soloSinStock && f.cantidad > 0.0005) return false;
      if (!needle) return true;
      const blob = [f.codigo, f.descripcion, f.proveedor, etiquetaRubro(f.rubro)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [filasFiltradas, q, soloSinStock]);

  function ir(next: { sede?: string; rubro?: string; presupuesto?: string }) {
    const sp = new URLSearchParams();
    sp.set("sede", next.sede ?? sede);
    const r = next.rubro ?? rubro;
    if (r && r !== "todos") sp.set("rubro", r);
    const p = next.presupuesto ?? presupuesto;
    if (p.trim()) sp.set("presupuesto", p.trim());
    router.push(`/administrativo/inventario?${sp.toString()}`);
  }

  function afterOk(msg: string) {
    setMovItem(null);
    setAjusteItem(null);
    setXferItem(null);
    setNuevoItemOpen(false);
    setEditarItem(null);
    setEditarMov(null);
    setToast(msg);
    router.refresh();
  }

  function abrirSalida(item: ItemInventarioVista) {
    setMovTipo("salida");
    setMovItem(item);
  }

  function abrirEntrada(item: ItemInventarioVista) {
    setMovTipo("entrada");
    setMovItem(item);
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Contexto de sede + KPIs */}
      <div className="rounded-xl bg-surface p-4 ring-1 ring-line sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Trabajando en
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{etiquetaSedeInventario(sede)}</p>
            <p className="mt-1 text-sm text-muted">
              Cambiá de sede con los chips. La lista es la misma; el stock es de esta sede.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SEDES_INVENTARIO.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => ir({ sede: s.id })}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  sede === s.id
                    ? "bg-ink text-white"
                    : "bg-white text-ink ring-1 ring-line hover:bg-surface-2"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Ítems" value={filas.length} />
          <Kpi label="Con stock" value={conStock} tone="good" />
          <button
            type="button"
            onClick={() => setTab("cobros")}
            className="text-left"
          >
            <Kpi
              label="Cobros pendientes"
              value={pendientesCobro.length}
              tone={pendientesCobro.length > 0 ? "warn" : "default"}
              hint={pendientesCobro.length > 0 ? "Tocá para asignar" : undefined}
            />
          </button>
          <button type="button" onClick={() => setTab("comprar")} className="text-left">
            <Kpi
              label="Sugeridos a comprar"
              value={aComprar}
              tone={aComprar > 0 ? "warn" : "default"}
              hint="Según salidas 30 días"
            />
          </button>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "stock", label: "Stock", count: filasFiltradas.length },
          { id: "cobros", label: "Cobros", count: pendientesCobro.length },
          { id: "comprar", label: "Qué comprar", count: aComprar },
          { id: "proveedores", label: "Proveedores", count: proveedores.length },
          { id: "movimientos", label: "Movimientos", count: movimientos.length },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {error && <EmptyState title="No se pudo cargar" hint={error} />}

      {!error && tab === "stock" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Buscá la pieza y registrá una{" "}
            <span className="font-medium text-ink">salida a carro</span> o a{" "}
            <span className="font-medium text-ink">taller</span>, una entrada de compra, o transferí
            a la otra sede. También podés añadir o editar piezas del catálogo.
          </p>
          <FiltersBar
            search={{ value: q, onChange: setQ }}
            searchPlaceholder="Buscar por código o nombre (ej. farol, aceite…)"
            chips={[
              { id: "todos", label: "Todos", count: filas.length },
              ...RUBROS_INVENTARIO.map((r) => ({
                id: r.id,
                label: r.label,
                count: filas.filter((f) => f.rubro === r.id).length,
              })),
              {
                id: "sin_stock",
                label: "Sin stock",
                count: filasFiltradas.filter((f) => f.cantidad <= 0.0005).length,
              },
            ]}
            activeChip={soloSinStock ? "sin_stock" : rubro}
            onChip={(id) => {
              if (id === "sin_stock") {
                setSoloSinStock(true);
                return;
              }
              setSoloSinStock(false);
              ir({ rubro: id });
            }}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted">
                  <span className="font-medium tabular-nums text-ink">{visibles.length}</span> visibles
                </p>
                <button
                  type="button"
                  onClick={() => setNuevoItemOpen(true)}
                  className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-black"
                >
                  Nuevo ítem
                </button>
              </div>
            }
          />

          {filas.length === 0 ? (
            <EmptyState
              title="Catálogo vacío"
              hint="Creá el primer ítem con el botón Nuevo ítem, o pedí que carguen el Excel."
              action={
                <button
                  type="button"
                  onClick={() => setNuevoItemOpen(true)}
                  className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
                >
                  Nuevo ítem
                </button>
              }
            />
          ) : visibles.length === 0 ? (
            <EmptyState title="Nada coincide" hint="Probá otra palabra o quitá el filtro." />
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                    <th className="px-4 py-3 font-medium">Pieza</th>
                    <th className="px-4 py-3 font-medium">Rubro</th>
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-4 py-3 font-medium">Precio</th>
                    <th className="px-4 py-3 font-medium">Qué hacer</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => (
                    <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-ink">{f.descripcion}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {f.codigo}
                          {f.proveedor ? ` · ${f.proveedor}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusChip tone={f.rubro === "chapisteria" ? "warn" : "azul"}>
                          {etiquetaRubro(f.rubro)}
                        </StatusChip>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-base font-semibold tabular-nums ${
                            f.cantidad <= 0.0005 ? "text-rojo" : "text-ink"
                          }`}
                        >
                          {f.cantidad}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-muted">
                        {money(f.precio_unitario)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => abrirSalida(f)}
                            disabled={f.cantidad <= 0.0005}
                            className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-40"
                          >
                            Salida
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirEntrada(f)}
                            className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
                          >
                            Entrada
                          </button>
                          <button
                            type="button"
                            onClick={() => setXferItem(f)}
                            disabled={f.cantidad <= 0.0005}
                            className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-40"
                          >
                            Transferir
                          </button>
                          <button
                            type="button"
                            onClick={() => setAjusteItem(f)}
                            className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink"
                          >
                            Ajustar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditarItem(f)}
                            className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink"
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!error && tab === "cobros" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Estas piezas ya salieron al carro. Ahora elegí quién paga:{" "}
            <span className="font-medium text-ink">cliente</span> o{" "}
            <span className="font-medium text-ink">empresa</span>.
          </p>
          {pendientesCobro.length === 0 ? (
            <EmptyState
              title="Todo al día"
              hint="Cuando registres una salida, aparece acá hasta que asignes el cobro."
              action={
                <button
                  type="button"
                  onClick={() => setTab("stock")}
                  className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
                >
                  Ir al stock
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
              {pendientesCobro.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-col gap-3 bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone="warn">Pendiente</StatusChip>
                      <span className="text-sm font-semibold tabular-nums">
                        Carro #{m.vehiculo_numero}
                      </span>
                      <span className="text-xs tabular-nums text-muted">{fmtFecha(m.fecha)}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium">{m.descripcion}</p>
                    <p className="text-xs text-muted">
                      {m.codigo} · cantidad {m.cantidad}
                      {m.notas ? ` · ${m.notas}` : ""}
                    </p>
                  </div>
                  <AsignarCobro
                    id={m.id}
                    onOk={(msg) => {
                      setToast(msg);
                      router.refresh();
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!error && tab === "comprar" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-sm text-muted max-w-xl">
              Lo que más salió en 30 días y ya no alcanza el stock. Usá el presupuesto para priorizar
              la compra de la semana.
            </p>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ir({ presupuesto });
              }}
            >
              <Field
                label="Presupuesto USD"
                name="presupuesto"
                type="number"
                step="0.01"
                min={0}
                value={presupuesto}
                onChange={(e) => setPresupuesto(e.target.value)}
                placeholder="500"
              />
              <button
                type="submit"
                className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
              >
                Aplicar
              </button>
            </form>
          </div>
          {recomendaciones.length === 0 ? (
            <EmptyState
              title="Todavía no hay qué sugerir"
              hint="Cuando haya salidas a carros, acá verás qué reponer primero."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                    <th className="px-4 py-3 font-medium">Pieza</th>
                    <th className="px-4 py-3 font-medium">Salió</th>
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-4 py-3 font-medium">Comprar</th>
                    <th className="px-4 py-3 font-medium">Costo</th>
                    <th className="px-4 py-3 font-medium">Más barato</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {recomendaciones.map((r) => {
                    const item = filas.find((f) => f.id === r.item_id);
                    return (
                      <tr key={r.item_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <p className="font-medium">{r.descripcion}</p>
                          <p className="text-xs text-muted">{r.codigo}</p>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{r.salidas_periodo}</td>
                        <td className="px-4 py-3 tabular-nums text-muted">{r.stock}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                          {r.sugerido}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted">
                          {money(r.costo_sugerido)}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {r.proveedor_mas_barato ? (
                            <span>
                              <span className="font-medium text-ink">{r.proveedor_mas_barato}</span>
                              {r.precio_mas_barato != null
                                ? ` · ${money(r.precio_mas_barato)}`
                                : ""}
                            </span>
                          ) : (
                            "Sin historial aún"
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item && (
                            <button
                              type="button"
                              onClick={() => abrirEntrada(item)}
                              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-black"
                            >
                              Registrar entrada
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!error && tab === "proveedores" && (
        <div className="space-y-6">
          <p className="text-sm text-muted max-w-2xl">
            Se van creando solos cuando Ángela pone proveedor + precio en una entrada. Con más
            compras, acá se ve quién sale más barato por pieza.
          </p>

          <section className="space-y-3">
            <h3 className="text-base font-semibold">Lista de proveedores</h3>
            {proveedores.length === 0 ? (
              <EmptyState
                title="Todavía no hay proveedores"
                hint="Registrá una entrada con nombre de proveedor y precio; aparece acá."
                action={
                  <button
                    type="button"
                    onClick={() => setTab("stock")}
                    className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
                  >
                    Ir al stock
                  </button>
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-xl ring-1 ring-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                      <th className="px-4 py-3 font-medium">Proveedor</th>
                      <th className="px-4 py-3 font-medium">Entradas</th>
                      <th className="px-4 py-3 font-medium">Piezas distintas</th>
                      <th className="px-4 py-3 font-medium">Última compra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proveedores.map((p) => (
                      <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 font-medium">{p.nombre}</td>
                        <td className="px-4 py-3 tabular-nums">{p.entradas}</td>
                        <td className="px-4 py-3 tabular-nums text-muted">{p.items_distintos}</td>
                        <td className="px-4 py-3 tabular-nums text-muted">
                          {p.ultima_fecha ? fmtFecha(p.ultima_fecha) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold">¿Quién es más barato?</h3>
            <p className="text-sm text-muted">
              Compara precios mínimos vistos en entradas. La recomendación es más útil cuando hay
              dos o más proveedores para la misma pieza.
            </p>
            {comparativaPrecios.length === 0 ? (
              <EmptyState
                title="Falta historial de precios"
                hint="Cada entrada con precio alimenta esta tabla."
              />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
                {comparativaPrecios.slice(0, 40).map((c) => (
                  <li key={c.item_id} className="bg-surface px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{c.descripcion}</p>
                        <p className="text-xs text-muted">{c.codigo}</p>
                      </div>
                      {c.mas_barato && (
                        <StatusChip tone={c.comparable ? "good" : "neutral"}>
                          {c.comparable ? "Más barato: " : "Único dato: "}
                          {c.mas_barato.proveedor} · {money(c.mas_barato.precio)}
                        </StatusChip>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {c.opciones.map((o) => (
                        <span
                          key={o.proveedor_id}
                          className={`rounded-lg px-3 py-1.5 text-xs ring-1 ${
                            c.mas_barato?.proveedor === o.proveedor &&
                            c.mas_barato.precio === o.precio_min
                              ? "bg-verde-wash text-verde ring-verde/20"
                              : "bg-white text-muted ring-line"
                          }`}
                        >
                          {o.proveedor}: {money(o.precio_min)}
                          <span className="text-faint"> · {o.compras} compra{o.compras === 1 ? "" : "s"}</span>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {!error && tab === "movimientos" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Historial reciente en {etiquetaSedeInventario(sede)}. Podés corregir una entrada o salida;
            el motivo queda guardado para trazabilidad.
          </p>
          {movimientos.length === 0 ? (
            <EmptyState title="Sin movimientos" hint="Todavía no se registró nada en esta sede." />
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Pieza</th>
                    <th className="px-4 py-3 font-medium">Cant.</th>
                    <th className="px-4 py-3 font-medium">Detalle</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 tabular-nums text-muted">{fmtFecha(m.fecha)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusChip
                            tone={
                              m.tipo === "entrada"
                                ? "good"
                                : m.tipo === "salida"
                                  ? "crit"
                                  : "azul"
                            }
                          >
                            {etiquetaTipoMovimiento(m.tipo)}
                          </StatusChip>
                          {m.ediciones > 0 && (
                            <StatusChip tone="warn">
                              {m.ediciones} edit{m.ediciones === 1 ? "" : "s"}
                            </StatusChip>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.descripcion}</p>
                        <p className="text-xs text-muted">{m.codigo}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{m.cantidad}</td>
                      <td className="px-4 py-3 text-muted">
                        {m.tipo === "salida" && (
                          <span>
                            {m.para_taller ? (
                              <>
                                Taller
                                {m.notas ? ` · ${m.notas}` : ""}
                                {" · "}
                                <span className="text-ink">cobra empresa</span>
                              </>
                            ) : (
                              <>
                                Carro #{m.vehiculo_numero ?? "—"} ·{" "}
                                {m.cobro_a ? (
                                  <span className="text-ink">
                                    cobra {etiquetaCobro(m.cobro_a).toLowerCase()}
                                  </span>
                                ) : (
                                  <span className="text-ambar">cobro pendiente</span>
                                )}
                              </>
                            )}
                          </span>
                        )}
                        {m.tipo === "transferencia" && (
                          <span>→ {etiquetaSedeInventario(m.sede_destino)}</span>
                        )}
                        {m.tipo === "entrada" &&
                          ([
                            m.proveedor,
                            m.precio_unitario != null ? money(m.precio_unitario) : null,
                            m.notas,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditarMov(m)}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {movItem && (
        <ModalMovimiento
          item={movItem}
          sede={sede}
          fechaHoy={fechaHoy}
          tipoInicial={movTipo}
          nombresProveedores={nombresProveedores}
          onClose={() => setMovItem(null)}
          onOk={afterOk}
        />
      )}
      {xferItem && (
        <ModalTransferencia
          item={xferItem}
          sede={sede}
          fechaHoy={fechaHoy}
          onClose={() => setXferItem(null)}
          onOk={afterOk}
        />
      )}
      {ajusteItem && (
        <ModalAjuste
          item={ajusteItem}
          sede={sede}
          fechaHoy={fechaHoy}
          onClose={() => setAjusteItem(null)}
          onOk={afterOk}
        />
      )}
      {nuevoItemOpen && (
        <ModalItem
          nombresProveedores={nombresProveedores}
          rubroInicial={rubro === "todos" ? "mecanica" : rubro}
          onClose={() => setNuevoItemOpen(false)}
          onOk={afterOk}
        />
      )}
      {editarItem && (
        <ModalItem
          item={editarItem}
          nombresProveedores={nombresProveedores}
          onClose={() => setEditarItem(null)}
          onOk={afterOk}
        />
      )}
      {editarMov && (
        <ModalEditarMovimiento
          movimiento={editarMov}
          nombresProveedores={nombresProveedores}
          onClose={() => setEditarMov(null)}
          onOk={afterOk}
        />
      )}
      {toast && <Toast tone="good" message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function AsignarCobro({ id, onOk }: { id: string; onOk: (msg: string) => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function asignar(cobroA: string) {
    setErr(null);
    start(async () => {
      const r = await asignarCobroSalida({ movimientoId: id, cobroA });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onOk(r.msg ?? "Listo.");
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">¿Quién paga?</p>
      <div className="flex flex-wrap gap-2">
        {COBROS_INVENTARIO.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={pending}
            onClick={() => asignar(c.id)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${
              c.id === "cliente"
                ? "bg-ink text-white hover:bg-black"
                : "bg-white text-ink ring-1 ring-line hover:bg-surface-2"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-rojo">{err}</p>}
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Cerrar" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl ring-1 ring-line sm:rounded-xl"
      >
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function ModalMovimiento({
  item,
  sede,
  fechaHoy,
  tipoInicial,
  nombresProveedores,
  onClose,
  onOk,
}: {
  item: ItemInventarioVista;
  sede: SedeInventario;
  fechaHoy: string;
  tipoInicial: "entrada" | "salida";
  nombresProveedores: string[];
  onClose: () => void;
  onOk: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"entrada" | "salida">(tipoInicial);
  const [destino, setDestino] = useState<"carro" | "taller">("carro");
  const [precio, setPrecio] = useState(
    item.precio_unitario != null ? String(item.precio_unitario) : "",
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    const precioRaw = String(fd.get("precio") ?? "").trim();
    start(async () => {
      const r = await registrarMovimiento({
        itemId: item.id,
        sede,
        tipo: String(fd.get("tipo") ?? tipo),
        cantidad: Number(fd.get("cantidad")),
        fecha: String(fd.get("fecha") ?? ""),
        destinoSalida: tipo === "salida" ? destino : undefined,
        vehiculoNumero: String(fd.get("vehiculo") ?? ""),
        proveedor: String(fd.get("proveedor") ?? ""),
        precioUnitario: precioRaw === "" ? null : Number(precioRaw),
        notas: String(fd.get("notas") ?? ""),
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onOk(r.msg ?? "Listo.");
    });
  }

  const tituloSalida =
    destino === "taller" ? "Salida a taller" : "Salida a un carro";

  return (
    <ModalShell
      title={tipo === "salida" ? tituloSalida : "Entrada de compra"}
      subtitle={`${item.descripcion} · stock ${item.cantidad} en ${etiquetaSedeInventario(sede)}`}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Tipo *"
          name="tipo"
          required
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "entrada" | "salida")}
          options={[
            { value: "salida", label: "Salida" },
            { value: "entrada", label: "Entrada (compra)" },
          ]}
        />
        <Field
          label="Cantidad *"
          name="cantidad"
          type="number"
          step="0.001"
          min={0.001}
          required
          defaultValue={1}
        />
        <Field label="Fecha *" name="fecha" type="date" required defaultValue={fechaHoy} />
        {tipo === "salida" ? (
          <>
            <Select
              label="¿A dónde sale? *"
              name="destino"
              required
              value={destino}
              onChange={(e) => setDestino(e.target.value as "carro" | "taller")}
              options={[
                { value: "carro", label: "A un carro" },
                { value: "taller", label: "Al taller (sin carro)" },
              ]}
            />
            {destino === "carro" ? (
              <Field
                label="Número de carro *"
                name="vehiculo"
                required
                placeholder="89"
                hint="Solo el número. El cobro (cliente o empresa) lo asignás después."
                autoComplete="off"
              />
            ) : (
              <p className="text-sm text-muted self-end pb-1">
                Consumo de taller. Queda cobrado a <span className="font-medium text-ink">empresa</span>;
                no pide carro.
              </p>
            )}
          </>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Proveedor
            </span>
            <input
              name="proveedor"
              list="lista-proveedores-inv"
              defaultValue={item.proveedor ?? ""}
              placeholder="Asia, Terpel…"
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
              autoComplete="off"
            />
            <datalist id="lista-proveedores-inv">
              {nombresProveedores.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <span className="text-xs text-muted">Si es nuevo, se crea solo en Proveedores.</span>
          </label>
        )}
        {tipo === "entrada" && (
          <Field
            label="Precio unitario (USD)"
            name="precio"
            type="number"
            step="0.01"
            min={0}
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="0.00"
            hint="Queda en la entrada, actualiza el catálogo y sirve para comparar proveedores."
          />
        )}
        {tipo === "salida" ? (
          <input type="hidden" name="proveedor" value="" />
        ) : (
          <input type="hidden" name="vehiculo" value="" />
        )}
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Notas (opcional)
          </span>
          <textarea
            name="notas"
            rows={2}
            placeholder={
              tipo === "salida"
                ? destino === "taller"
                  ? "Ej. grasa para piso / uso general"
                  : "Ej. farol roto en choque"
                : "Ej. factura 1234"
            }
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending
              ? "Guardando…"
              : tipo === "salida"
                ? destino === "taller"
                  ? "Registrar salida a taller"
                  : "Registrar salida a carro"
                : "Registrar entrada"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Cancelar
          </button>
          {err && <p className="w-full text-sm text-rojo">{err}</p>}
        </div>
      </form>
    </ModalShell>
  );
}

function ModalTransferencia({
  item,
  sede,
  fechaHoy,
  onClose,
  onOk,
}: {
  item: ItemInventarioVista;
  sede: SedeInventario;
  fechaHoy: string;
  onClose: () => void;
  onOk: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const destino = otraSede(sede);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    start(async () => {
      const r = await transferirEntreSedes({
        itemId: item.id,
        sedeOrigen: sede,
        cantidad: Number(fd.get("cantidad")),
        fecha: String(fd.get("fecha") ?? ""),
        notas: String(fd.get("notas") ?? ""),
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onOk(r.msg ?? "Listo.");
    });
  }

  return (
    <ModalShell
      title="Transferir a la otra sede"
      subtitle={`De ${etiquetaSedeInventario(sede)} → ${etiquetaSedeInventario(destino)}`}
      onClose={onClose}
    >
      <div className="mb-4 rounded-lg bg-azul-wash px-3 py-2.5 text-sm text-azul">
        {item.descripcion}. Stock acá: <span className="font-semibold tabular-nums">{item.cantidad}</span>
      </div>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Cantidad *" name="cantidad" type="number" step="0.001" min={0.001} required defaultValue={1} />
        <Field label="Fecha *" name="fecha" type="date" required defaultValue={fechaHoy} />
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Notas</span>
          <textarea
            name="notas"
            rows={2}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Guardando…" : `Enviar a ${etiquetaSedeInventario(destino)}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Cancelar
          </button>
          {err && <p className="w-full text-sm text-rojo">{err}</p>}
        </div>
      </form>
    </ModalShell>
  );
}

function ModalAjuste({
  item,
  sede,
  fechaHoy,
  onClose,
  onOk,
}: {
  item: ItemInventarioVista;
  sede: SedeInventario;
  fechaHoy: string;
  onClose: () => void;
  onOk: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    start(async () => {
      const r = await ajustarStock({
        itemId: item.id,
        sede,
        cantidadNueva: Number(fd.get("cantidad")),
        fecha: String(fd.get("fecha") ?? ""),
        notas: String(fd.get("notas") ?? ""),
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onOk(r.msg ?? "Listo.");
    });
  }

  return (
    <ModalShell
      title="Ajuste de conteo"
      subtitle="Para cuando el físico no cuadra con el sistema. No es una salida a carro."
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Cantidad real *"
          name="cantidad"
          type="number"
          step="0.001"
          min={0}
          required
          defaultValue={item.cantidad}
        />
        <Field label="Fecha *" name="fecha" type="date" required defaultValue={fechaHoy} />
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Motivo
          </span>
          <textarea
            name="notas"
            rows={2}
            placeholder="Conteo físico / corrección"
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar conteo"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Cancelar
          </button>
          {err && <p className="w-full text-sm text-rojo">{err}</p>}
        </div>
      </form>
    </ModalShell>
  );
}

function ModalItem({
  item,
  nombresProveedores,
  rubroInicial = "mecanica",
  onClose,
  onOk,
}: {
  item?: ItemInventarioVista;
  nombresProveedores: string[];
  rubroInicial?: RubroInventario;
  onClose: () => void;
  onOk: (msg: string) => void;
}) {
  const editando = Boolean(item);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [rubro, setRubro] = useState<RubroInventario>(item?.rubro ?? rubroInicial);
  const [precio, setPrecio] = useState(
    item?.precio_unitario != null ? String(item.precio_unitario) : "",
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    const precioRaw = String(fd.get("precio") ?? "").trim();
    start(async () => {
      const payload = {
        rubro: String(fd.get("rubro") ?? rubro),
        codigo: String(fd.get("codigo") ?? ""),
        descripcion: String(fd.get("descripcion") ?? ""),
        precioUnitario: precioRaw === "" ? null : Number(precioRaw),
        proveedor: String(fd.get("proveedor") ?? ""),
      };
      const r = editando
        ? await actualizarItemInventario({ itemId: item!.id, ...payload })
        : await crearItemInventario(payload);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onOk(r.msg ?? "Listo.");
    });
  }

  return (
    <ModalShell
      title={editando ? "Editar ítem" : "Nuevo ítem"}
      subtitle={
        editando
          ? "Cambiá código, nombre, rubro o precio de referencia."
          : "Queda en el catálogo con stock 0 en Juan Díaz y La Chorrera."
      }
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Rubro *"
          name="rubro"
          required
          value={rubro}
          onChange={(e) => setRubro(e.target.value as RubroInventario)}
          options={RUBROS_INVENTARIO.map((r) => ({ value: r.id, label: r.label }))}
        />
        <Field
          label="Código *"
          name="codigo"
          required
          defaultValue={item?.codigo ?? ""}
          placeholder="FAR-001"
          autoComplete="off"
        />
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Descripción *
          </span>
          <input
            name="descripcion"
            required
            defaultValue={item?.descripcion ?? ""}
            placeholder="Farol delantero izquierdo"
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            autoComplete="off"
          />
        </label>
        <Field
          label="Precio referencia (USD)"
          name="precio"
          type="number"
          step="0.01"
          min={0}
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="0.00"
          hint="Opcional. Se actualiza también al registrar entradas."
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Proveedor habitual
          </span>
          <input
            name="proveedor"
            list="lista-proveedores-item"
            defaultValue={item?.proveedor ?? ""}
            placeholder="Asia, Terpel…"
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            autoComplete="off"
          />
          <datalist id="lista-proveedores-item">
            {nombresProveedores.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Guardando…" : editando ? "Guardar cambios" : "Crear ítem"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Cancelar
          </button>
          {err && <p className="w-full text-sm text-rojo">{err}</p>}
        </div>
      </form>
    </ModalShell>
  );
}

function resumenSnap(s: Record<string, unknown>) {
  const parts: string[] = [];
  if (s.cantidad != null) parts.push(`cant. ${s.cantidad}`);
  if (s.fecha) parts.push(fmtFecha(String(s.fecha)));
  if (s.para_taller) parts.push("taller");
  else if (s.vehiculo_numero) parts.push(`carro #${s.vehiculo_numero}`);
  if (s.proveedor) parts.push(String(s.proveedor));
  if (s.precio_unitario != null && s.precio_unitario !== "") {
    parts.push(money(Number(s.precio_unitario)));
  }
  if (s.notas) parts.push(String(s.notas));
  return parts.join(" · ") || "—";
}

function ModalEditarMovimiento({
  movimiento,
  nombresProveedores,
  onClose,
  onOk,
}: {
  movimiento: MovimientoInventarioVista;
  nombresProveedores: string[];
  onClose: () => void;
  onOk: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [historial, setHistorial] = useState<EdicionMovimientoVista[] | null>(null);
  const [histErr, setHistErr] = useState<string | null>(null);
  const [destino, setDestino] = useState<"carro" | "taller">(
    movimiento.para_taller ? "taller" : "carro",
  );
  const [precio, setPrecio] = useState(
    movimiento.precio_unitario != null ? String(movimiento.precio_unitario) : "",
  );

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const r = await listarEdicionesMovimiento(movimiento.id);
      if (cancelado) return;
      if (!r.ok) {
        setHistErr(r.error);
        setHistorial([]);
        return;
      }
      setHistorial(r.filas);
    })();
    return () => {
      cancelado = true;
    };
  }, [movimiento.id]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    const precioRaw = String(fd.get("precio") ?? "").trim();
    start(async () => {
      const r = await editarMovimiento({
        movimientoId: movimiento.id,
        cantidad: Number(fd.get("cantidad")),
        fecha: String(fd.get("fecha") ?? ""),
        motivo: String(fd.get("motivo") ?? ""),
        destinoSalida: movimiento.tipo === "salida" ? destino : undefined,
        vehiculoNumero: String(fd.get("vehiculo") ?? ""),
        proveedor: String(fd.get("proveedor") ?? ""),
        precioUnitario: precioRaw === "" ? null : Number(precioRaw),
        notas: String(fd.get("notas") ?? ""),
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onOk(r.msg ?? "Listo.");
    });
  }

  return (
    <ModalShell
      title={`Corregir ${etiquetaTipoMovimiento(movimiento.tipo).toLowerCase()}`}
      subtitle={`${movimiento.descripcion} · ${movimiento.codigo}`}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Cantidad *"
          name="cantidad"
          type="number"
          step="0.001"
          min={0.001}
          required
          defaultValue={movimiento.cantidad}
        />
        <Field
          label="Fecha *"
          name="fecha"
          type="date"
          required
          defaultValue={movimiento.fecha}
        />
        {movimiento.tipo === "salida" && (
          <>
            <Select
              label="¿A dónde sale? *"
              name="destino"
              required
              value={destino}
              onChange={(e) => setDestino(e.target.value as "carro" | "taller")}
              options={[
                { value: "carro", label: "A un carro" },
                { value: "taller", label: "Al taller (sin carro)" },
              ]}
            />
            {destino === "carro" ? (
              <Field
                label="Número de carro *"
                name="vehiculo"
                required
                defaultValue={movimiento.vehiculo_numero ?? ""}
                placeholder="89"
                autoComplete="off"
              />
            ) : (
              <p className="text-sm text-muted self-end pb-1">
                Consumo de taller · cobra empresa
              </p>
            )}
          </>
        )}
        {movimiento.tipo === "entrada" && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Proveedor
              </span>
              <input
                name="proveedor"
                list="lista-proveedores-edit-mov"
                defaultValue={movimiento.proveedor ?? ""}
                placeholder="Asia, Terpel…"
                className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                autoComplete="off"
              />
              <datalist id="lista-proveedores-edit-mov">
                {nombresProveedores.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <Field
              label="Precio unitario (USD)"
              name="precio"
              type="number"
              step="0.01"
              min={0}
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="0.00"
            />
          </>
        )}
        {movimiento.tipo === "transferencia" && (
          <p className="sm:col-span-2 text-sm text-muted">
            Destino: {etiquetaSedeInventario(movimiento.sede_destino)}. La sede no se cambia acá;
            solo cantidad, fecha y notas.
          </p>
        )}
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Notas
          </span>
          <textarea
            name="notas"
            rows={2}
            defaultValue={movimiento.notas ?? ""}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Motivo de la corrección *
          </span>
          <textarea
            name="motivo"
            required
            minLength={5}
            rows={2}
            placeholder="Ej. cantidad mal tipiada / carro equivocado"
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
          <span className="text-xs text-muted">
            Obligatorio. Queda en el historial; el stock se ajusta solo.
          </span>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar corrección"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Cancelar
          </button>
          {err && <p className="w-full text-sm text-rojo">{err}</p>}
        </div>
      </form>

      <div className="mt-6 border-t border-line pt-4">
        <h4 className="text-sm font-semibold">Historial de correcciones</h4>
        {histErr && <p className="mt-2 text-xs text-rojo">{histErr}</p>}
        {historial == null && !histErr && (
          <p className="mt-2 text-xs text-muted">Cargando…</p>
        )}
        {historial && historial.length === 0 && (
          <p className="mt-2 text-xs text-muted">Todavía no hay correcciones en este movimiento.</p>
        )}
        {historial && historial.length > 0 && (
          <ul className="mt-3 space-y-3">
            {historial.map((h) => (
              <li key={h.id} className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-ink">{h.motivo}</p>
                  <p className="text-xs tabular-nums text-muted">
                    {h.created_at.slice(0, 16).replace("T", " ")}
                    {h.editor ? ` · ${h.editor}` : ""}
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Antes: {resumenSnap(h.antes)}
                </p>
                <p className="text-xs text-muted">Después: {resumenSnap(h.despues)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}
