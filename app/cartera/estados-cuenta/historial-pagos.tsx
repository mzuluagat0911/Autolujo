"use client";

import { useEffect, useState, useTransition } from "react";
import { Money, StatusChip } from "@/components/kit";
import { Field, Select } from "@/components/form";
import { money } from "@/lib/cartera/estado-cuenta";
import { fechaConDia } from "@/lib/cartera/fecha";
import type { PagoHistorial } from "./actions";
import {
  cargarHistorialPagos,
  editarPagoHistorial,
  reaplicarPagoHistorial,
} from "./actions";

function etiquetaMetodo(metodo: string | null | undefined): string {
  const m = (metodo ?? "").toLowerCase();
  if (m === "transferencia") return "Transferencia";
  if (m === "efectivo") return "Efectivo";
  if (m === "tarjeta") return "Tarjeta";
  if (m === "yappy") return "Yappy";
  if (m === "ach") return "ACH";
  if (m === "otro") return "Otro";
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
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="mt-2.5 space-y-3 rounded-lg bg-surface px-3 py-3 ring-1 ring-line"
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        setMsg(null);
        setErr(null);
        start(async () => {
          const res = await editarPagoHistorial(null, fd);
          if (!res.ok) {
            setErr(res.msg);
            return;
          }
          setMsg(res.msg);
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
        <Field
          label="Monto"
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          required
          defaultValue={pago.monto}
        />
        <Field label="Fecha" name="fecha" type="date" required defaultValue={pago.fecha} />
        <Field
          label="Hora (Panamá)"
          name="hora"
          type="time"
          required
          defaultValue={horaInput(pago.pagadoAt)}
        />
        <Select
          label="Método"
          name="metodo"
          required
          defaultValue={pago.metodo || "transferencia"}
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
        <Field
          label="Referencia"
          name="referencia"
          defaultValue={pago.referencia ?? ""}
          placeholder="Opcional"
        />
      </div>
      <Field
        label="Nota interna"
        name="notas"
        placeholder="Opcional · se agrega al historial del pago"
      />
      {err && <p className="text-sm text-rojo">{err}</p>}
      {msg && <p className="text-sm text-verde">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
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
}: {
  contratoId: string;
  onChanged?: () => void;
}) {
  const [pagos, setPagos] = useState<PagoHistorial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pendingRe, startRe] = useTransition();
  const [tick, setTick] = useState(0);

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
      if (!abierto && !editando) {
        const primero = res.pagos.find((p) => (p.asignaciones?.length ?? 0) > 0) ?? res.pagos[0];
        if (primero) setAbierto(primero.id);
      }
    })();
    return () => {
      cancel = true;
    };
    // tick fuerza recarga tras editar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId, tick]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 3200);
    return () => window.clearTimeout(t);
  }, [flash]);

  function recargar(msg?: string) {
    if (msg) setFlash(msg);
    setEditando(null);
    setTick((n) => n + 1);
    onChanged?.();
  }

  return (
    <section className="border-t border-line pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Historial de pagos
        </h3>
        {pagos && pagos.length > 0 && (
          <span className="text-[11px] tabular-nums text-faint">{pagos.length}</span>
        )}
      </div>

      {flash && <p className="mb-2 text-sm text-verde">{flash}</p>}
      {pagos == null && <p className="py-2.5 text-sm text-muted">Cargando pagos…</p>}
      {error && <p className="py-2.5 text-sm text-rojo">{error}</p>}
      {pagos && pagos.length === 0 && !error && (
        <p className="py-2.5 text-sm text-muted">Sin pagos registrados en este contrato.</p>
      )}

      {pagos && pagos.length > 0 && (
        <ul className="divide-y divide-line">
          {pagos.map((p) => {
            const expandido = abierto === p.id || editando === p.id;
            const tieneDisc = (p.asignaciones?.length ?? 0) > 0;
            const esEdit = editando === p.id;
            return (
              <li key={p.id} className="py-3">
                <button
                  type="button"
                  onClick={() => {
                    if (esEdit) return;
                    setAbierto(expandido && abierto === p.id ? null : p.id);
                  }}
                  className="flex w-full items-start justify-between gap-3 text-left"
                  aria-expanded={expandido}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{fechaPago(p)}</span>
                      {horaCorta(p.pagadoAt) && (
                        <span className="text-[11px] text-faint">{horaCorta(p.pagadoAt)}</span>
                      )}
                      <StatusChip tone={tonoEstado(p.estado)}>
                        {etiquetaEstadoPago(p.estado)}
                      </StatusChip>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {etiquetaMetodo(p.metodo)}
                      {p.banco ? ` · ${p.banco}` : ""}
                      {p.referencia ? ` · ref ${p.referencia}` : ""}
                      {p.origen ? ` · ${p.origen}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money amount={p.monto} className="text-sm font-semibold text-ink" />
                    <p className="mt-0.5 text-[11px] text-faint">
                      {esEdit ? "Editando" : expandido ? "Ocultar" : "Ver / editar"}
                    </p>
                  </div>
                </button>

                {expandido && !esEdit && (
                  <div className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2.5">
                    {tieneDisc ? (
                      <>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                          Aplicado a
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
                          <p className="mt-2 text-xs leading-snug text-muted">
                            {p.resumenAplicacion}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted">
                        {p.estado === "pendiente"
                          ? "Comprobante en validación: aún no se repartió a cuentas."
                          : p.estado === "rechazado"
                            ? "Pago rechazado: no se aplicó a ninguna cuenta."
                            : "Este pago no tiene discriminado guardado."}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditando(p.id);
                          setAbierto(p.id);
                        }}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface"
                      >
                        Editar
                      </button>
                      {(p.estado === "conciliado" || p.estado === "manual") && !tieneDisc && (
                        <button
                          type="button"
                          disabled={pendingRe}
                          onClick={() => {
                            startRe(async () => {
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
                          {pendingRe ? "Reaplicando…" : "Reaplicar desglose"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {esEdit && (
                  <EditorPago
                    pago={p}
                    contratoId={contratoId}
                    onCancel={() => setEditando(null)}
                    onSaved={(m) => recargar(m)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
