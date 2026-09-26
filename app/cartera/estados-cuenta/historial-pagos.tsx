"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Money, StatusChip } from "@/components/kit";
import { Field, Select } from "@/components/form";
import { money } from "@/lib/cartera/estado-cuenta";
import { fechaConDia, hoyPanama } from "@/lib/cartera/fecha";
import { CONCEPTOS_PAGO } from "@/lib/cartera/rubros-pago";
import type { PagoHistorial } from "./actions";
import {
  cargarHistorialPagos,
  editarPagoHistorial,
  reaplicarPagoHistorial,
  guardarAsignacionesHistorial,
  agregarPagoHistorial,
  eliminarPagoHistorial,
} from "./actions";

type Linea = { tipo: string; etiqueta: string; aplicado: number };

const CONCEPTOS = CONCEPTOS_PAGO;

function etiquetaMetodo(metodo: string | null | undefined): string {
  const m = (metodo ?? "").toLowerCase();
  if (m === "transferencia") return "Transferencia";
  if (m === "efectivo") return "Efectivo";
  if (m === "tarjeta") return "Tarjeta";
  return metodo?.trim() || "Pago";
}

function etiquetaEstadoPago(estado: string | null | undefined): string {
  const e = (estado ?? "").toLowerCase();
  if (e === "conciliado") return "Conciliado";
  if (e === "manual") return "Manual";
  if (e === "pendiente") return "Pendiente";
  if (e === "rechazado") return "Rechazado";
  return estado?.trim() || "—";
}

function tonoEstado(estado: string): "good" | "warn" | "crit" | "azul" | "neutral" {
  const e = estado.toLowerCase();
  if (e === "conciliado" || e === "manual") return "good";
  if (e === "pendiente") return "warn";
  if (e === "rechazado") return "crit";
  return "neutral";
}

function fechaPago(p: PagoHistorial): string {
  try {
    return fechaConDia(p.fecha);
  } catch {
    return p.fecha;
  }
}

function horaCorta(iso: string): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("es-PA", {
      timeZone: "America/Panama",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return null;
  }
}

function horaInput(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "12:00";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Panama",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);
    const h = parts.find((p) => p.type === "hour")?.value ?? "12";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    return `${h}:${m}`;
  } catch {
    return "12:00";
  }
}

function labelConcepto(tipo: string): string {
  return CONCEPTOS.find((c) => c.value === tipo)?.label ?? tipo;
}

function EditorPago({
  pago,
  contratoId,
  onCancel,
  onSaved,
}: {
  pago: PagoHistorial;
  contratoId: string;
  onCancel: () => void;
  onSaved: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="mt-2.5 space-y-3 rounded-lg bg-surface px-3 py-3 ring-1 ring-line"
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        setErr(null);
        start(async () => {
          const res = await editarPagoHistorial(null, fd);
          if (!res.ok) {
            setErr(res.msg);
            return;
          }
          onSaved(res.msg);
        });
      }}
    >
      <input type="hidden" name="pago_id" value={pago.id} />
      <input type="hidden" name="contrato_id" value={contratoId} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Editar pago
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Field label="Monto" name="monto" type="number" step="0.01" min="0.01" required defaultValue={pago.monto} />
        <Field label="Fecha" name="fecha" type="date" required defaultValue={pago.fecha} />
        <Field label="Hora (Panamá)" name="hora" type="time" required defaultValue={horaInput(pago.pagadoAt)} />
        <Select
          label="Método"
          name="metodo"
          required
          defaultValue={["transferencia", "efectivo", "tarjeta"].includes(pago.metodo) ? pago.metodo : "transferencia"}
          options={[
            { value: "transferencia", label: "Transferencia" },
            { value: "efectivo", label: "Efectivo" },
            { value: "tarjeta", label: "Tarjeta" },
          ]}
        />
        <Select
          label="Estado"
          name="estado"
          required
          defaultValue={pago.estado || "manual"}
          options={[
            { value: "manual", label: "Manual (cuenta)" },
            { value: "conciliado", label: "Conciliado" },
            { value: "pendiente", label: "Pendiente" },
            { value: "rechazado", label: "Rechazado" },
          ]}
        />
        <Field label="Referencia" name="referencia" defaultValue={pago.referencia ?? ""} placeholder="Opcional" />
      </div>
      <Field label="Nota interna" name="notas" placeholder="Opcional" />
      {err && <p className="text-sm text-rojo">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar pago"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function EditorAsignaciones({
  pago,
  contratoId,
  onCancel,
  onSaved,
}: {
  pago: PagoHistorial;
  contratoId: string;
  onCancel: () => void;
  onSaved: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[]>(() => {
    if (pago.asignaciones?.length) {
      return pago.asignaciones.map((a) => ({
        tipo: a.tipo,
        etiqueta: a.etiqueta,
        aplicado: a.aplicado,
      }));
    }
    return [{ tipo: "cuenta_diaria", etiqueta: "Cuota / letra", aplicado: pago.monto }];
  });

  const suma = Math.round(lineas.reduce((s, l) => s + (Number(l.aplicado) || 0), 0) * 100) / 100;
  const sobrante = Math.round((pago.monto - suma) * 100) / 100;

  return (
    <div className="mt-2.5 space-y-3 rounded-lg bg-surface px-3 py-3 ring-1 ring-line">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Reasignar conceptos
        </p>
        <p className="mt-1 text-xs text-muted">
          Letra, acuerdo y recargo, y también domingo, mantenimiento, panapass, cierre, exceso de km y ajuste. Si asignás una parte a uno de esos y no había cargo, se carga ese monto para que no baje la letra. La suma + sobrante debe igualar {money(pago.monto)}.
        </p>
      </div>

      <ul className="space-y-2">
        {lineas.map((l, i) => (
          <li key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2">
            <select
              className="rounded-lg bg-surface px-2.5 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
              value={l.tipo}
              onChange={(e) => {
                const tipo = e.target.value;
                setLineas((prev) =>
                  prev.map((x, j) =>
                    j === i
                      ? { ...x, tipo, etiqueta: labelConcepto(tipo) }
                      : x,
                  ),
                );
              }}
            >
              {CONCEPTOS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              className="rounded-lg bg-surface px-2.5 py-2 text-sm tabular-nums ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
              value={l.aplicado}
              onChange={(e) => {
                const aplicado = Number(e.target.value) || 0;
                setLineas((prev) => prev.map((x, j) => (j === i ? { ...x, aplicado } : x)));
              }}
            />
            <button
              type="button"
              onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))}
              className="rounded-lg px-2.5 py-2 text-sm text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash"
              aria-label="Quitar línea"
            >
              −
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() =>
          setLineas((prev) => [
            ...prev,
            { tipo: "saldo_anterior", etiqueta: "Saldo anterior", aplicado: 0 },
          ])
        }
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface-2"
      >
        + Concepto
      </button>

      <div className="flex justify-between text-sm">
        <span className="text-muted">Suma conceptos</span>
        <span className="tabular-nums font-medium">{money(suma)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className={sobrante < -0.009 ? "text-rojo" : "text-azul"}>Sobrante / a favor</span>
        <span className={`tabular-nums font-medium ${sobrante < -0.009 ? "text-rojo" : "text-azul"}`}>
          {money(Math.max(sobrante, 0))}
        </span>
      </div>

      {err && <p className="text-sm text-rojo">{err}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const res = await guardarAsignacionesHistorial({
                pagoId: pago.id,
                contratoId,
                lineas: lineas.map((l) => ({
                  tipo: l.tipo,
                  aplicado: l.aplicado,
                  etiqueta: labelConcepto(l.tipo),
                })),
                sobrante: Math.max(sobrante, 0),
              });
              if (!res.ok) {
                setErr(res.msg);
                return;
              }
              onSaved(res.msg);
            });
          }}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar asignación"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function FormAgregarPago({
  contratoId,
  onCancel,
  onSaved,
}: {
  contratoId: string;
  onCancel: () => void;
  onSaved: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const hoy = hoyPanama();

  return (
    <form
      className="mb-4 space-y-3 rounded-xl bg-surface-2 px-3.5 py-3.5 ring-1 ring-line"
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        setErr(null);
        start(async () => {
          const res = await agregarPagoHistorial(null, fd);
          if (!res.ok) {
            setErr(res.msg);
            return;
          }
          onSaved(res.msg);
        });
      }}
    >
      <input type="hidden" name="contrato_id" value={contratoId} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Agregar pago anterior
      </p>
      <p className="text-xs text-muted">
        Úsalo si el cliente pagó un día y no quedó registrado. Se aplica al instante con el
        waterfall del agente.
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Field label="Monto" name="monto" type="number" step="0.01" min="0.01" required />
        <Field label="Fecha" name="fecha" type="date" required defaultValue={hoy} />
        <Field label="Hora" name="hora" type="time" required defaultValue="12:00" />
        <Select
          label="Método"
          name="metodo"
          required
          defaultValue="transferencia"
          options={[
            { value: "transferencia", label: "Transferencia" },
            { value: "efectivo", label: "Efectivo" },
            { value: "tarjeta", label: "Tarjeta" },
          ]}
        />
        <Field label="Referencia" name="referencia" placeholder="Opcional" />
        <Field label="Nota" name="notas" placeholder="Opcional" />
      </div>
      {err && <p className="text-sm text-rojo">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Agregar y aplicar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function HistorialPagosSeccion({
  contratoId,
  onChanged,
  embedded = false,
}: {
  contratoId: string;
  onChanged?: () => void;
  embedded?: boolean;
}) {
  const [pagos, setPagos] = useState<PagoHistorial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [modo, setModo] = useState<"ver" | "editar" | "asignar" | null>(null);
  const [agregar, setAgregar] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tick, setTick] = useState(0);
  const [filtroFecha, setFiltroFecha] = useState("");

  useEffect(() => {
    let cancel = false;
    setPagos(null);
    setError(null);
    void (async () => {
      const res = await cargarHistorialPagos(contratoId);
      if (cancel) return;
      if (!res.ok) {
        setError(res.error ?? "No pude cargar el historial.");
        setPagos([]);
        return;
      }
      setPagos(res.pagos);
      if (!abierto) {
        const primero = res.pagos[0];
        if (primero) setAbierto(primero.id);
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId, tick]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 3500);
    return () => window.clearTimeout(t);
  }, [flash]);

  const porDia = useMemo(() => {
    const list = (pagos ?? []).filter((p) => !filtroFecha || p.fecha === filtroFecha);
    const map = new Map<string, PagoHistorial[]>();
    for (const p of list) {
      const arr = map.get(p.fecha) ?? [];
      arr.push(p);
      map.set(p.fecha, arr);
    }
    return [...map.entries()];
  }, [pagos, filtroFecha]);

  function recargar(msg?: string) {
    if (msg) setFlash(msg);
    setModo(null);
    setAgregar(false);
    setTick((n) => n + 1);
    onChanged?.();
  }

  return (
    <section className={embedded ? undefined : "border-t border-line pt-4"}>
      {!embedded && (
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Historial de pagos
        </h3>
      )}

      <div className="mb-4 space-y-3">
        <p className="text-sm text-muted">
          Cómo el agente recibió y repartió cada abono. Podés corregir monto/fecha, reasignar a qué
          concepto fue, agregar un pago que faltaba o eliminarlo.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Filtrar día
            </span>
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="rounded-lg bg-surface px-2.5 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
          </label>
          {filtroFecha && (
            <button
              type="button"
              onClick={() => setFiltroFecha("")}
              className="rounded-lg px-3 py-2 text-sm text-muted ring-1 ring-line hover:bg-surface-2"
            >
              Ver todos
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setAgregar((v) => !v);
              setModo(null);
            }}
            className="ml-auto rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-black"
          >
            {agregar ? "Cerrar alta" : "+ Agregar pago"}
          </button>
        </div>
        <p className="text-[11px] text-faint">
          Orden del agente: recargo manual → acuerdo hasta saldo cero → letra. Mantenimiento y domingo se listan y no entran al total mientras el acuerdo tenga saldo.
        </p>
      </div>

      {agregar && (
        <FormAgregarPago
          contratoId={contratoId}
          onCancel={() => setAgregar(false)}
          onSaved={(m) => recargar(m)}
        />
      )}

      {flash && <p className="mb-2 text-sm text-verde">{flash}</p>}
      {pagos == null && <p className="py-2.5 text-sm text-muted">Cargando pagos…</p>}
      {error && <p className="py-2.5 text-sm text-rojo">{error}</p>}
      {pagos && pagos.length === 0 && !error && (
        <p className="py-2.5 text-sm text-muted">Sin pagos. Agregá uno si el cliente ya pagó.</p>
      )}
      {pagos && pagos.length > 0 && porDia.length === 0 && (
        <p className="py-2.5 text-sm text-muted">No hay pagos en esa fecha.</p>
      )}

      {porDia.map(([fecha, delDia]) => {
        const sumaDia = delDia
          .filter((p) => p.estado === "conciliado" || p.estado === "manual")
          .reduce((s, p) => s + p.monto, 0);
        return (
          <div key={fecha} className="mb-5">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">{fechaConDia(fecha)}</h4>
              <span className="text-xs tabular-nums text-muted">
                {delDia.length} pago{delDia.length === 1 ? "" : "s"}
                {sumaDia > 0.009 ? ` · aplicado ${money(sumaDia)}` : ""}
              </span>
            </div>
            <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
              {delDia.map((p) => {
                const abiertoAhora = abierto === p.id;
                const tieneDisc = (p.asignaciones?.length ?? 0) > 0;
                const editando = abiertoAhora && modo === "editar";
                const asignando = abiertoAhora && modo === "asignar";
                return (
                  <li
                    key={p.id}
                    className="bg-surface px-3.5 py-3 first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (editando || asignando) return;
                          setAbierto(abiertoAhora ? null : p.id);
                          setModo(null);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {horaCorta(p.pagadoAt) && (
                            <span className="text-sm font-medium text-ink">{horaCorta(p.pagadoAt)}</span>
                          )}
                          <StatusChip tone={tonoEstado(p.estado)}>
                            {etiquetaEstadoPago(p.estado)}
                          </StatusChip>
                          {p.origen && (
                            <span className="text-[11px] text-faint">{p.origen}</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {etiquetaMetodo(p.metodo)}
                          {p.referencia ? ` · ref ${p.referencia}` : ""}
                          {tieneDisc
                            ? ` · ${p.asignaciones!.map((a) => `${money(a.aplicado)} ${a.etiqueta}`).join(" · ")}`
                            : p.estado === "conciliado" || p.estado === "manual"
                              ? " · sin desglose"
                              : ""}
                        </p>
                      </button>
                      <Money amount={p.monto} className="shrink-0 text-sm font-semibold text-ink" />
                    </div>

                    {abiertoAhora && !editando && !asignando && (
                      <div className="mt-2.5 space-y-3 rounded-lg bg-surface-2 px-3 py-2.5">
                        {tieneDisc ? (
                          <>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                              Cómo lo asignó el agente
                            </p>
                            <ul className="space-y-1.5">
                              {p.asignaciones!.map((a, i) => (
                                <li
                                  key={`${a.tipo}-${i}`}
                                  className="flex items-baseline justify-between gap-3 text-sm"
                                >
                                  <span className="text-muted capitalize">{a.etiqueta}</span>
                                  <span className="tabular-nums font-medium text-ink">
                                    {money(a.aplicado)}
                                  </span>
                                </li>
                              ))}
                              {p.sobrante > 0.009 && (
                                <li className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5 text-sm">
                                  <span className="text-azul">A favor (sobrante)</span>
                                  <span className="tabular-nums font-medium text-azul">
                                    {money(p.sobrante)}
                                  </span>
                                </li>
                              )}
                            </ul>
                            {p.resumenAplicacion && (
                              <p className="text-xs leading-snug text-muted">{p.resumenAplicacion}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-muted">
                            {p.estado === "pendiente"
                              ? "Pendiente de validación: aún no se repartió."
                              : p.estado === "rechazado"
                                ? "Rechazado: no cuenta en el saldo."
                                : "Sin discriminado. Reaplicá el waterfall o asigná a mano."}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setModo("editar")}
                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface"
                          >
                            Editar pago
                          </button>
                          {(p.estado === "conciliado" || p.estado === "manual") && (
                            <button
                              type="button"
                              onClick={() => setModo("asignar")}
                              className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface"
                            >
                              Reasignar conceptos
                            </button>
                          )}
                          {(p.estado === "conciliado" || p.estado === "manual") && !tieneDisc && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                start(async () => {
                                  const res = await reaplicarPagoHistorial(p.id, contratoId);
                                  if (!res.ok) {
                                    setFlash(res.msg);
                                    return;
                                  }
                                  recargar(res.msg);
                                });
                              }}
                              className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface disabled:opacity-50"
                            >
                              Reaplicar waterfall
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              if (!window.confirm(`¿Eliminar el pago de ${money(p.monto)} del ${fechaPago(p)}? Se revierte del saldo.`)) {
                                return;
                              }
                              start(async () => {
                                const res = await eliminarPagoHistorial(p.id, contratoId);
                                if (!res.ok) {
                                  setFlash(res.msg);
                                  return;
                                }
                                recargar(res.msg);
                              });
                            }}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}

                    {editando && (
                      <EditorPago
                        pago={p}
                        contratoId={contratoId}
                        onCancel={() => setModo(null)}
                        onSaved={(m) => recargar(m)}
                      />
                    )}
                    {asignando && (
                      <EditorAsignaciones
                        pago={p}
                        contratoId={contratoId}
                        onCancel={() => setModo(null)}
                        onSaved={(m) => recargar(m)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
