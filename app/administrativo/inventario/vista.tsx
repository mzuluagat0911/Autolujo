"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
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
  type ItemInventarioVista,
  type MovimientoInventarioVista,
  type RecomendacionCompra,
  type RubroInventario,
  type SedeInventario,
} from "@/lib/administrativo/inventario";
import {
  ajustarStock,
  asignarCobroSalida,
  registrarMovimiento,
  transferirEntreSedes,
} from "../actions";

type TabId = "stock" | "cobros" | "comprar" | "movimientos";

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
          { id: "movimientos", label: "Movimientos", count: movimientos.length },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {error && <EmptyState title="No se pudo cargar" hint={error} />}

      {!error && tab === "stock" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Buscá la pieza y registrá una <span className="font-medium text-ink">salida al carro</span>{" "}
            (lo más común), una entrada de compra, o transferí a la otra sede.
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
              <p className="text-sm text-muted">
                <span className="font-medium tabular-nums text-ink">{visibles.length}</span> visibles
              </p>
            }
          />

          {filas.length === 0 ? (
            <EmptyState
              title="Catálogo vacío"
              hint="Falta cargar el inventario. Avisá a quien administra el sistema."
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
                            Salida a carro
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
                    <th className="px-4 py-3 font-medium">Proveedor</th>
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
                        <td className="px-4 py-3 text-muted">{r.proveedor ?? "—"}</td>
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

      {!error && tab === "movimientos" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Historial reciente en {etiquetaSedeInventario(sede)}: entradas, salidas y transferencias.
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
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 tabular-nums text-muted">{fmtFecha(m.fecha)}</td>
                      <td className="px-4 py-3">
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
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.descripcion}</p>
                        <p className="text-xs text-muted">{m.codigo}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{m.cantidad}</td>
                      <td className="px-4 py-3 text-muted">
                        {m.tipo === "salida" && (
                          <span>
                            Carro #{m.vehiculo_numero ?? "—"} ·{" "}
                            {m.cobro_a ? (
                              <span className="text-ink">cobra {etiquetaCobro(m.cobro_a).toLowerCase()}</span>
                            ) : (
                              <span className="text-ambar">cobro pendiente</span>
                            )}
                          </span>
                        )}
                        {m.tipo === "transferencia" && (
                          <span>→ {etiquetaSedeInventario(m.sede_destino)}</span>
                        )}
                        {m.tipo === "entrada" &&
                          ([m.proveedor, m.notas].filter(Boolean).join(" · ") || "—")}
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
  onClose,
  onOk,
}: {
  item: ItemInventarioVista;
  sede: SedeInventario;
  fechaHoy: string;
  tipoInicial: "entrada" | "salida";
  onClose: () => void;
  onOk: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"entrada" | "salida">(tipoInicial);
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
      title={tipo === "salida" ? "Salida a un carro" : "Entrada de compra"}
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
            { value: "salida", label: "Salida (al carro)" },
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
          <Field
            label="Número de carro *"
            name="vehiculo"
            required
            placeholder="89"
            hint="Solo el número. El cobro (cliente o empresa) lo asignás después."
            autoComplete="off"
          />
        ) : (
          <Field
            label="Proveedor"
            name="proveedor"
            placeholder="Asia, Terpel…"
            defaultValue={item.proveedor ?? ""}
          />
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
            hint="Se guarda en esta entrada y actualiza el precio del catálogo."
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
            placeholder={tipo === "salida" ? "Ej. farol roto en choque" : "Ej. factura 1234"}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Guardando…" : tipo === "salida" ? "Registrar salida" : "Registrar entrada"}
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
