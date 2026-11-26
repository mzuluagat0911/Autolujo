"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, FiltersBar, StatusChip, Toast } from "@/components/kit";
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
  const [toast, setToast] = useState<string | null>(null);
  const [movItem, setMovItem] = useState<ItemInventarioVista | null>(null);
  const [ajusteItem, setAjusteItem] = useState<ItemInventarioVista | null>(null);
  const [xferItem, setXferItem] = useState<ItemInventarioVista | null>(null);
  const [presupuesto, setPresupuesto] = useState(presupuestoInicial);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return filasFiltradas;
    return filasFiltradas.filter((f) => {
      const blob = [f.codigo, f.descripcion, f.proveedor, etiquetaRubro(f.rubro)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [filasFiltradas, q]);

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

  return (
    <div className="mt-6 space-y-8">
      <FiltersBar
        search={{ value: q, onChange: setQ }}
        searchPlaceholder="Código, descripción, proveedor…"
        chipGroups={[
          {
            chips: SEDES_INVENTARIO.map((s) => ({ id: s.id, label: s.label })),
            active: sede,
            onChip: (id) => ir({ sede: id }),
          },
          {
            chips: [
              { id: "todos", label: "Todos", count: filas.length },
              ...RUBROS_INVENTARIO.map((r) => ({
                id: r.id,
                label: r.label,
                count: filas.filter((f) => f.rubro === r.id).length,
              })),
            ],
            active: rubro,
            onChip: (id) => ir({ rubro: id }),
          },
        ]}
        actions={
          <p className="text-sm text-muted">
            <span className="font-medium tabular-nums text-ink">{visibles.length}</span> ítems
          </p>
        }
      />

      {error ? (
        <EmptyState title="No se pudo cargar el inventario" hint={error} />
      ) : filas.length === 0 ? (
        <EmptyState
          title="Catálogo vacío"
          hint="Corré la migración 0061 y el seed del catálogo (stock en 0)."
        />
      ) : visibles.length === 0 ? (
        <EmptyState title="Ningún ítem coincide" hint="Probá otra búsqueda o rubro." />
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Descripción</th>
                <th className="px-4 py-3 font-medium">Rubro</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium">{f.codigo}</td>
                  <td className="px-4 py-3">
                    <p>{f.descripcion}</p>
                    {f.proveedor && <p className="mt-0.5 text-xs text-muted">{f.proveedor}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip tone={f.rubro === "chapisteria" ? "warn" : "azul"}>
                      {etiquetaRubro(f.rubro)}
                    </StatusChip>
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold">{f.cantidad}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">{money(f.precio_unitario)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setMovItem(f)}
                        className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-black"
                      >
                        Entrada / salida
                      </button>
                      <button
                        type="button"
                        onClick={() => setXferItem(f)}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface-2"
                      >
                        Transferir
                      </button>
                      <button
                        type="button"
                        onClick={() => setAjusteItem(f)}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface-2"
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

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Qué comprar</h2>
            <p className="mt-1 text-sm text-muted">
              Según salidas de los últimos 30 días vs stock en {etiquetaSedeInventario(sede)}.
            </p>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ir({ presupuesto });
            }}
          >
            <Field
              label="Presupuesto (USD)"
              name="presupuesto"
              type="number"
              step="0.01"
              min={0}
              value={presupuesto}
              onChange={(e) => setPresupuesto(e.target.value)}
              placeholder="ej. 500"
            />
            <button
              type="submit"
              className="rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
            >
              Filtrar
            </button>
          </form>
        </div>
        {recomendaciones.length === 0 ? (
          <EmptyState
            title="Sin recomendaciones aún"
            hint="Cuando haya salidas a carros, acá salen los ítems que más se mueven y lo sugerido a reponer."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-3 font-medium">Ítem</th>
                  <th className="px-4 py-3 font-medium">Salidas 30d</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Sugerido</th>
                  <th className="px-4 py-3 font-medium">Costo</th>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                </tr>
              </thead>
              <tbody>
                {recomendaciones.map((r) => (
                  <tr key={r.item_id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.codigo}</p>
                      <p className="text-xs text-muted">{r.descripcion}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.salidas_periodo}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{r.stock}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{r.sugerido}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{money(r.costo_sugerido)}</td>
                    <td className="px-4 py-3 text-muted">{r.proveedor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Cobro pendiente</h2>
            <p className="mt-1 text-sm text-muted">
              Salidas ya hechas al carro; después se define si paga el cliente o la empresa.
            </p>
          </div>
          {pendientesCobro.length > 0 && (
            <StatusChip tone="warn">{pendientesCobro.length}</StatusChip>
          )}
        </div>
        {pendientesCobro.length === 0 ? (
          <EmptyState title="Nada pendiente" hint="Las salidas nuevas aparecen acá hasta asignar el cobro." />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
            {pendientesCobro.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {m.codigo} · #{m.vehiculo_numero ?? "?"} · {m.cantidad}
                  </p>
                  <p className="text-xs text-muted">
                    {fmtFecha(m.fecha)} · {m.descripcion}
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
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Últimos movimientos</h2>
          <p className="text-xs text-muted">{etiquetaSedeInventario(sede)}</p>
        </div>
        {movimientos.length === 0 ? (
          <EmptyState
            title="Sin movimientos aún"
            hint="Entradas, salidas a carro y transferencias entre sedes."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Ítem</th>
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
                      <p className="font-medium">{m.codigo}</p>
                      <p className="text-xs text-muted">{m.descripcion}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{m.cantidad}</td>
                    <td className="px-4 py-3 text-muted">
                      {m.tipo === "salida" && (
                        <span>
                          Carro #{m.vehiculo_numero ?? "—"} · cobro {etiquetaCobro(m.cobro_a).toLowerCase()}
                        </span>
                      )}
                      {m.tipo === "transferencia" && (
                        <span>
                          → {etiquetaSedeInventario(m.sede_destino)}
                          {m.notas ? ` · ${m.notas}` : ""}
                        </span>
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
      </section>

      {movItem && (
        <ModalMovimiento
          item={movItem}
          sede={sede}
          fechaHoy={fechaHoy}
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
    <div className="flex flex-wrap items-center gap-2">
      {COBROS_INVENTARIO.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={pending}
          onClick={() => asignar(c.id)}
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
        >
          {c.label}
        </button>
      ))}
      {err && <p className="w-full text-xs text-rojo">{err}</p>}
    </div>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Cerrar" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-t-2xl bg-surface p-5 shadow-xl ring-1 ring-line sm:rounded-xl"
      >
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function ModalMovimiento({
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
  const [tipo, setTipo] = useState<"entrada" | "salida">("salida");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    start(async () => {
      const r = await registrarMovimiento({
        itemId: item.id,
        sede,
        tipo: String(fd.get("tipo") ?? tipo),
        cantidad: Number(fd.get("cantidad")),
        fecha: String(fd.get("fecha") ?? ""),
        vehiculoNumero: String(fd.get("vehiculo") ?? ""),
        proveedor: String(fd.get("proveedor") ?? ""),
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
    <ModalShell title={`${item.codigo} · stock ${item.cantidad}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">{item.descripcion}</p>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Tipo *"
          name="tipo"
          required
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "entrada" | "salida")}
          options={[
            { value: "salida", label: "Salida (a un carro)" },
            { value: "entrada", label: "Entrada (compra)" },
          ]}
        />
        <Field label="Cantidad *" name="cantidad" type="number" step="0.001" min={0.001} required />
        <Field label="Fecha *" name="fecha" type="date" required defaultValue={fechaHoy} />
        {tipo === "salida" ? (
          <Field
            label="# carro *"
            name="vehiculo"
            required
            placeholder="89 o AL89"
            hint="Obligatorio. El cobro (cliente/empresa) se asigna después."
          />
        ) : (
          <Field label="Proveedor" name="proveedor" placeholder="Asia" />
        )}
        {tipo === "salida" ? (
          <input type="hidden" name="proveedor" value="" />
        ) : (
          <input type="hidden" name="vehiculo" value="" />
        )}
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
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Registrar"}
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
    <ModalShell title={`Transferir · ${item.codigo}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        De <span className="font-medium text-ink">{etiquetaSedeInventario(sede)}</span> a{" "}
        <span className="font-medium text-ink">{etiquetaSedeInventario(destino)}</span>. Stock acá:{" "}
        <span className="tabular-nums font-medium text-ink">{item.cantidad}</span>.
      </p>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Cantidad *" name="cantidad" type="number" step="0.001" min={0.001} required />
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
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Transferir"}
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
    <ModalShell title={`Ajustar · ${item.codigo}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        Stock actual: <span className="font-medium text-ink tabular-nums">{item.cantidad}</span>. Poné el
        conteo físico.
      </p>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Cantidad nueva *"
          name="cantidad"
          type="number"
          step="0.001"
          min={0}
          required
          defaultValue={item.cantidad}
        />
        <Field label="Fecha *" name="fecha" type="date" required defaultValue={fechaHoy} />
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Motivo</span>
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
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar ajuste"}
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
