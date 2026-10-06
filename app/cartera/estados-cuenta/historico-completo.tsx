"use client";

import { useEffect, useId, useState } from "react";
import { Money } from "@/components/kit";
import { CONCEPTOS_PAGO } from "@/lib/cartera/rubros-pago";
import { guardarHistoricoDia, historicoCompleto, movimientosHistoricoDia } from "./actions";
import type { CargoDelDia, FilaHistorico, PagoDelDia } from "@/lib/cartera/historico-cuenta";

const INPUT =
  "w-full rounded-lg bg-surface px-2.5 py-2 text-sm tabular-nums ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20";

export function HistoricoCompleto({
  contratoId,
  cliente,
  carro,
  onClose,
}: {
  contratoId: string;
  cliente: string;
  carro: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [filas, setFilas] = useState<FilaHistorico[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [cargos, setCargos] = useState<CargoDelDia[]>([]);
  const [pagos, setPagos] = useState<PagoDelDia[]>([]);
  const [cargandoDia, setCargandoDia] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState("renta");
  const [nuevoConcepto, setNuevoConcepto] = useState("");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    historicoCompleto(contratoId).then((res) => {
      if (cancel) return;
      if (!res.ok) {
        setError(res.error);
        setFilas([]);
        return;
      }
      setFilas(res.filas);
    });
    return () => {
      cancel = true;
    };
  }, [contratoId]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        if (editando) setEditando(null);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editando, onClose]);

  async function abrir(fecha: string) {
    setAviso(null);
    setEditando(fecha);
    setNuevoTipo("renta");
    setNuevoConcepto("");
    setNuevoMonto("");
    setCargandoDia(true);
    const res = await movimientosHistoricoDia(contratoId, fecha);
    setCargandoDia(false);
    if (!res.ok) {
      setAviso(res.error);
      setCargos([]);
      setPagos([]);
      return;
    }
    setCargos(res.cargos);
    setPagos(
      res.pagos.map((p) => ({
        ...p,
        lineas:
          p.lineas.length > 0
            ? p.lineas
            : [{ tipo: "cuenta_diaria", aplicado: p.monto }],
      })),
    );
  }

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    setAviso(null);
    const res = await guardarHistoricoDia({
      contratoId,
      fecha: editando,
      cargos: cargos.map((c) => ({ id: c.id, monto: Number(c.monto) || 0 })),
      pagos: pagos.map((p) => ({
        id: p.id,
        monto: Number(p.monto) || 0,
        lineas: p.lineas.map((l) => ({ tipo: l.tipo, aplicado: Number(l.aplicado) || 0 })),
      })),
      nuevoCargo:
        Number(nuevoMonto) > 0
          ? { tipo: nuevoTipo, concepto: nuevoConcepto, monto: Number(nuevoMonto) }
          : null,
    });
    setGuardando(false);
    if (!res.ok) {
      setAviso(res.error);
      return;
    }
    setFilas(res.filas);
    setEditando(null);
    setAviso("Corrección guardada. Quedó el nombre y la fecha en el control.");
  }

  const diaEdit = filas?.find((f) => f.fecha === editando) ?? null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Cerrar histórico"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl ring-1 ring-line sm:rounded-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Histórico completo
            </p>
            <h2 id={titleId} className="mt-1 truncate text-xl font-bold tracking-tight">
              {carro}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted">
              {cliente}. Desde el día que entró. El debe se recalcula al corregir un día.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Cerrar histórico"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {aviso && <p className="mb-3 text-sm text-ink">{aviso}</p>}
          {filas == null && <p className="py-6 text-sm text-muted">Armando el día a día…</p>}
          {error && <p className="py-6 text-sm text-rojo">{error}</p>}
          {filas && filas.length === 0 && !error && (
            <p className="py-6 text-sm text-muted">Este contrato todavía no tiene cargos ni pagos.</p>
          )}
          {filas && filas.length > 0 && (
            <div className="overflow-x-auto rounded-xl ring-1 ring-line">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    <th className="px-3 py-2.5 font-semibold">Día</th>
                    <th className="px-3 py-2.5 font-semibold">Cargos</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Pago</th>
                    <th className="px-3 py-2.5 font-semibold">Se aplicó a</th>
                    <th className="px-3 py-2.5 font-semibold">Recargos</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Debe</th>
                    <th className="px-3 py-2.5 font-semibold">Control</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                      <tr key={f.fecha} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-ink">{f.dia}</td>
                        <td className="px-3 py-2.5 text-ink">{f.cargos}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {f.pago > 0.009 ? <Money amount={f.pago} /> : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-muted">{f.aplicado}</td>
                        <td className="px-3 py-2.5">
                          {f.recargos === "—" ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className={f.recargos.includes("pendiente") ? "text-rojo" : "text-muted"}>
                              {f.recargos}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                          <Money amount={f.debe} />
                        </td>
                        <td className="px-3 py-2.5">
                          {f.edicion ? (
                            <p className="text-xs text-ambar">
                              Editado por {f.edicion.nombre}
                              {f.edicion.cuando ? ` · ${f.edicion.cuando}` : ""}
                              {f.edicion.correcciones > 1 ? ` · ${f.edicion.correcciones} veces` : ""}
                            </p>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                          <button
                            type="button"
                            onClick={() => void abrir(f.fecha)}
                            className="mt-1 block text-xs font-medium text-ink underline-offset-2 hover:underline"
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

          {editando && diaEdit && (
            <form
              className="mt-4 rounded-xl bg-surface-2 p-4 ring-1 ring-line"
              onSubmit={(ev) => {
                ev.preventDefault();
                void guardar();
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Corregir {diaEdit.dia}
              </p>
              <p className="mt-1 text-sm text-muted">
                Cambiá el monto o a qué se aplicó el pago. Al guardar queda tu nombre y la fecha.
              </p>
              {cargandoDia && <p className="mt-3 text-sm text-muted">Cargando el día…</p>}
              {!cargandoDia && cargos.length === 0 && pagos.length === 0 && (
                <p className="mt-3 text-sm text-muted">Este día no tiene cargos ni pagos para corregir.</p>
              )}
              {!cargandoDia && cargos.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-ink">Cargos y recargos</p>
                  {cargos.map((c, i) => (
                    <label key={c.id} className="grid grid-cols-[1fr_7rem] items-center gap-3">
                      <span className="text-sm text-muted">{c.concepto}</span>
                      <input
                        className={INPUT}
                        inputMode="decimal"
                        aria-label={`Monto de ${c.concepto}`}
                        value={String(c.monto)}
                        onChange={(ev) => {
                          const monto = Number(ev.target.value);
                          setCargos((prev) => prev.map((row, j) => (j === i ? { ...row, monto } : row)));
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
              {!cargandoDia &&
                pagos.map((p, pi) => (
                  <div key={p.id} className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-ink">
                      Pago{p.referencia ? ` · ref ${p.referencia}` : ""}
                    </p>
                    <label className="grid grid-cols-[1fr_7rem] items-center gap-3">
                      <span className="text-sm text-muted">Monto</span>
                      <input
                        className={INPUT}
                        inputMode="decimal"
                        aria-label="Monto del pago"
                        value={String(p.monto)}
                        onChange={(ev) => {
                          const monto = Number(ev.target.value);
                          setPagos((prev) => prev.map((row, j) => (j === pi ? { ...row, monto } : row)));
                        }}
                      />
                    </label>
                    {p.lineas.map((l, li) => (
                      <div key={`${p.id}-${li}`} className="grid grid-cols-[1fr_7rem] gap-3">
                        <select
                          className={INPUT}
                          aria-label="A qué se aplicó"
                          value={l.tipo}
                          onChange={(ev) => {
                            const tipo = ev.target.value;
                            setPagos((prev) =>
                              prev.map((row, j) =>
                                j === pi
                                  ? {
                                      ...row,
                                      lineas: row.lineas.map((ln, k) => (k === li ? { ...ln, tipo } : ln)),
                                    }
                                  : row,
                              ),
                            );
                          }}
                        >
                          {CONCEPTOS_PAGO.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className={INPUT}
                          inputMode="decimal"
                          aria-label="Monto aplicado"
                          value={String(l.aplicado)}
                          onChange={(ev) => {
                            const aplicado = Number(ev.target.value);
                            setPagos((prev) =>
                              prev.map((row, j) =>
                                j === pi
                                  ? {
                                      ...row,
                                      lineas: row.lineas.map((ln, k) => (k === li ? { ...ln, aplicado } : ln)),
                                    }
                                  : row,
                              ),
                            );
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-ink">Agregar un cargo de este día</p>
                <div className="grid grid-cols-[8rem_1fr_7rem] gap-3">
                  <select
                    className={INPUT}
                    aria-label="Tipo de cargo"
                    value={nuevoTipo}
                    onChange={(ev) => setNuevoTipo(ev.target.value)}
                  >
                    <option value="renta">Letra</option>
                    <option value="multa">Recargo</option>
                    <option value="otras">Otro</option>
                  </select>
                  <input
                    className={INPUT}
                    aria-label="Concepto"
                    placeholder="Concepto"
                    value={nuevoConcepto}
                    onChange={(ev) => setNuevoConcepto(ev.target.value)}
                  />
                  <input
                    className={INPUT}
                    inputMode="decimal"
                    aria-label="Monto del cargo nuevo"
                    placeholder="0"
                    value={nuevoMonto}
                    onChange={(ev) => setNuevoMonto(ev.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="submit"
                  disabled={guardando || cargandoDia}
                  className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : "Guardar corrección"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
