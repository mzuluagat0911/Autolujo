"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Money, StatusChip, Tabs, Toast } from "@/components/kit";
import {
  money,
  textoEstadoCuotas,
  textoSituacionCuotas,
  esAdelantado,
  esAlDiaHoy,
  type EstadoCuenta,
} from "@/lib/cartera/estado-cuenta";
import { partesSaldoAnterior } from "@/lib/cartera/extracto-desglose";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { fechaConDia, fechaLarga } from "@/lib/cartera/fecha";
import type { EstadoCuentaFila } from "./types";
import { EditorLedger } from "./detalle-editar";
import { HistorialPagosSeccion } from "./historial-pagos";

type TabId = "resumen" | "ajustar" | "pagos";

function tonoSituacion(e: EstadoCuenta): "good" | "warn" | "crit" | "azul" {
  if (e.pendiente) return "azul";
  if (esAdelantado(e)) return "azul";
  if (esAlDiaHoy(e)) return "good";
  if (e.pendienteAnterior > 0.009) return "crit";
  return "warn";
}

function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return fechaConDia(iso.slice(0, 10));
}

function fechaLargaUi(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  try {
    return fechaLarga(iso.slice(0, 10));
  } catch {
    return fechaCorta(iso);
  }
}

function pctCuotas(e: EstadoCuenta): number | null {
  const total = e.numCuotasTotal;
  const pagadas = e.cuotasPagadas;
  if (total == null || !(total > 0) || pagadas == null) return null;
  return Math.min(100, Math.max(0, Math.round((pagadas / total) * 100)));
}

function capEtiqueta(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Fila({
  label,
  children,
  tone,
  indent,
}: {
  label: string;
  children: ReactNode;
  tone?: "default" | "warn" | "crit" | "good" | "muted";
  indent?: boolean;
}) {
  const valueClass =
    tone === "warn"
      ? "text-ambar"
      : tone === "crit"
        ? "text-rojo"
        : tone === "good"
          ? "text-verde"
          : tone === "muted"
            ? "text-muted"
            : "text-ink";
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2 ${indent ? "pl-3" : ""}`}
    >
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-medium tabular-nums text-right ${valueClass}`}>{children}</span>
    </div>
  );
}

function Seccion({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </h3>
        {action}
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Atajo({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-xl bg-surface px-3.5 py-3 text-left ring-1 ring-line transition hover:bg-surface-2"
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="mt-0.5 text-xs text-muted">{hint}</span>
    </button>
  );
}

export function DetalleEstadoModal({
  estado,
  onClose,
  onSaved,
}: {
  estado: EstadoCuentaFila;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<TabId>("resumen");
  const [toast, setToast] = useState<string | null>(null);
  const carro = etiquetaCarroUi(estado.empresa, estado.vehiculoNumero);
  const progreso = pctCuotas(estado);
  const adelantado = esAdelantado(estado);
  const alDia = esAlDiaHoy(estado);
  const lineasHoy = estado.lineas.filter(
    (l) => !(l.concepto.includes("no pagar") && (estado.recargosAcumulados ?? 0) <= 0.009),
  );
  const recargoSoloCalculado = estado.lineas.reduce(
    (s, l) => s + (l.concepto.includes("no pagar") && (estado.recargosAcumulados ?? 0) <= 0.009 ? l.monto : 0),
    0,
  );
  const totalHoyVisible = Math.max((estado.totalCobrarHoy ?? estado.totalHoy) - recargoSoloCalculado, 0);

  const partesSaldo = useMemo(
    () =>
      partesSaldoAnterior({
        pendienteAnterior: estado.pendienteAnterior,
        extras: estado.extras,
      }),
    [estado],
  );

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        if (tab !== "resumen") setTab("resumen");
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, tab]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  function afterSave(msg: string) {
    setToast(msg);
    setTab("resumen");
    onSaved?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Cerrar detalle"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl ring-1 ring-line sm:rounded-xl"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-line px-5 pt-4">
          <div className="flex items-start justify-between gap-3 pb-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Estado de cuenta
                {fechaLargaUi(estado.fecha) ? ` · ${fechaLargaUi(estado.fecha)}` : ""}
              </p>
              <h2 id={titleId} className="mt-1 truncate text-xl font-bold tracking-tight">
                {carro}
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted">{estado.clienteNombre}</p>
              <div className="mt-2.5">
                <StatusChip tone={tonoSituacion(estado)}>
                  {textoSituacionCuotas(estado)}
                </StatusChip>
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Cerrar"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <Tabs
            tabs={[
              { id: "resumen", label: "Resumen" },
              { id: "ajustar", label: "Ajustar cuenta" },
              { id: "pagos", label: "Pagos" },
            ]}
            active={tab}
            onChange={(id) => setTab(id as TabId)}
          />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "resumen" && (
            <div className="space-y-5 px-5 py-5">
              <div className="rounded-xl bg-surface-2 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {adelantado || alDia || totalHoyVisible <= 0.009
                    ? "Situación"
                    : estado.pendiente
                      ? "Monto en validación"
                      : "A pagar hoy"}
                </p>
                {adelantado ? (
                  <p className="mt-1 text-2xl font-bold tracking-tight text-azul">
                    {estado.diasAdelantados} cuota
                    {estado.diasAdelantados === 1 ? "" : "s"} por delante
                  </p>
                ) : (
                  <p
                    className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${
                      alDia
                        ? "text-verde"
                        : estado.pendienteAnterior > 0.009
                          ? "text-rojo"
                          : "text-ink"
                    }`}
                  >
                    {alDia ? (
                      "Al día"
                    ) : (
                      <Money amount={totalHoyVisible} className="text-3xl font-bold" />
                    )}
                  </p>
                )}
                {adelantado && estado.cubiertoHasta && (
                  <p className="mt-1 text-sm text-muted">
                    Cubierto hasta {fechaCorta(estado.cubiertoHasta)}
                  </p>
                )}
                {!adelantado && !alDia && estado.desglose && (
                  <p className="mt-2 text-sm leading-snug text-muted">{estado.desglose}</p>
                )}
                {estado.pendiente && (
                  <p className="mt-2 text-sm text-azul">
                    Comprobante en validación
                    {estado.pendienteMonto > 0.009 ? ` · ${money(estado.pendienteMonto)}` : ""}
                    {estado.pendienteHora ? ` · ${estado.pendienteHora}` : ""}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Atajo
                  label="Ajustar cuenta"
                  hint="Letra, cargos, acuerdos"
                  onClick={() => setTab("ajustar")}
                />
                <Atajo
                  label="Pagos"
                  hint="Historial y corregir montos"
                  onClick={() => setTab("pagos")}
                />
                <Atajo
                  label="Cerrar"
                  hint="Volver a la lista"
                  onClick={onClose}
                />
              </div>

              <Seccion
                title="Desglose de hoy"
                action={
                  <button
                    type="button"
                    onClick={() => setTab("ajustar")}
                    className="text-[11px] font-medium text-muted hover:text-ink"
                  >
                    Corregir
                  </button>
                }
              >
                {lineasHoy.length === 0 ? (
                  <p className="py-2.5 text-sm text-muted">Sin cargos pendientes para hoy.</p>
                ) : (
                  lineasHoy.map((l, i) => {
                    const esSaldoAnt = l.concepto === "saldo anterior" && l.monto > 0.009;
                    const partes = esSaldoAnt ? partesSaldo : [];
                    return (
                      <div key={`${l.concepto}-${i}`}>
                        <Fila
                          label={capEtiqueta(l.concepto)}
                          tone={
                            l.monto < 0
                              ? "good"
                              : l.concepto.includes("no pagar")
                                ? "warn"
                                : esSaldoAnt
                                  ? "crit"
                                  : "default"
                          }
                        >
                          {l.monto < 0 ? `−${money(-l.monto)}` : money(l.monto)}
                        </Fila>
                        {partes.length > 0 && (
                          <div className="mb-1 ml-1 border-l-2 border-line pl-2">
                            {partes.map((p) => (
                              <Fila key={p.etiqueta} label={capEtiqueta(p.etiqueta)} tone="muted" indent>
                                {money(p.monto)}
                              </Fila>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {!alDia && !adelantado && (
                  <Fila label="Total">
                    <span className="text-base font-semibold">{money(totalHoyVisible)}</span>
                  </Fila>
                )}
                {!adelantado && !alDia && estado.recargoSiTarda > 0.009 && (
                  <Fila label="Si no completa antes de las 7 p.m." tone="warn">
                    +{money(estado.recargoSiTarda)} → {money(estado.totalHoyTarde)}
                  </Fila>
                )}
              </Seccion>

              {estado.acuerdoSaldo > 0.009 && (
                <Seccion
                  title="Acuerdos"
                  action={
                    <button
                      type="button"
                      onClick={() => setTab("ajustar")}
                      className="text-[11px] font-medium text-muted hover:text-ink"
                    >
                      Editar
                    </button>
                  }
                >
                  <Fila label="Saldo del plan" tone="warn">
                    {money(estado.acuerdoSaldo)}
                  </Fila>
                  {estado.acuerdoHoy > 0.009 && (
                    <Fila label="Cuota de hoy">{money(estado.acuerdoHoy)}</Fila>
                  )}
                </Seccion>
              )}

              <Seccion title="Plan de cuotas">
                <Fila label="Resumen">{textoEstadoCuotas(estado)}</Fila>
                {estado.numCuotasTotal != null && (
                  <Fila label="Totales del deal">
                    {estado.numCuotasTotal.toLocaleString("es-PA")}
                  </Fila>
                )}
                {estado.cuotasPagadas != null && (
                  <Fila label="Pagadas" tone="good">
                    {estado.cuotasPagadas.toLocaleString("es-PA")}
                  </Fila>
                )}
                {estado.cuotasDebe != null && (
                  <Fila label="Faltantes" tone={estado.cuotasDebe > 0 ? "warn" : "good"}>
                    {estado.cuotasDebe.toLocaleString("es-PA")}
                  </Fila>
                )}
                {progreso != null && (
                  <div className="py-3">
                    <div className="mb-1.5 flex justify-between text-[11px] text-muted">
                      <span>Avance del plan</span>
                      <span className="tabular-nums font-medium text-ink">{progreso}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-ink transition-[width] duration-200"
                        style={{ width: `${progreso}%` }}
                      />
                    </div>
                  </div>
                )}
              </Seccion>

              <Seccion title="Detalle">
                <Fila
                  label="Recargos acumulados"
                  tone={estado.recargosAcumulados > 0.009 ? "warn" : "muted"}
                >
                  {estado.recargosAcumulados > 0.009 ? money(estado.recargosAcumulados) : "—"}
                </Fila>
                <Fila label="Letra diaria">
                  {estado.letra > 0.009 ? money(estado.letra) : "—"}
                </Fila>
                {estado.cobraDomingo && (
                  <Fila label="Cuota domingo">
                    {estado.cuotaDomingo > 0.009 ? money(estado.cuotaDomingo) : "Sí"}
                  </Fila>
                )}
                <Fila label="Pagado hoy" tone={estado.pagadoHoy > 0.009 ? "good" : "muted"}>
                  {estado.pagadoHoy > 0.009 ? money(estado.pagadoHoy) : "—"}
                </Fila>
                {estado.waNumero && (
                  <Fila label="WhatsApp">
                    <span className="font-mono text-xs">{estado.waNumero}</span>
                  </Fila>
                )}
                {estado.cubiertoHasta && (
                  <Fila label="Cubierto hasta">{fechaCorta(estado.cubiertoHasta)}</Fila>
                )}
              </Seccion>
            </div>
          )}

          {tab === "ajustar" && (
            <EditorLedger
              contratoId={estado.contratoId}
              onCancel={() => setTab("resumen")}
              onSaved={() => afterSave("Cuenta actualizada.")}
            />
          )}

          {tab === "pagos" && (
            <div className="px-5 py-5">
              <HistorialPagosSeccion
                contratoId={estado.contratoId}
                embedded
                onChanged={() => {
                  setToast("Pago actualizado · el resumen se refresca.");
                  onSaved?.();
                }}
              />
            </div>
          )}
        </div>

        {tab === "resumen" && (
          <div className="flex shrink-0 gap-2 border-t border-line px-5 py-3">
            <button
              type="button"
              onClick={() => setTab("ajustar")}
              className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
            >
              Ajustar cuenta
            </button>
            <button
              type="button"
              onClick={() => setTab("pagos")}
              className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
            >
              Ver pagos
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
      {toast && <Toast tone="good" message={toast} />}
    </div>
  );
}
