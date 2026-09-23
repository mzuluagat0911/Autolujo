"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Money, StatusChip } from "@/components/kit";
import {
  money,
  textoEstadoCuotas,
  textoSituacionCuotas,
  esAdelantado,
  esAlDiaHoy,
  type EstadoCuenta,
} from "@/lib/cartera/estado-cuenta";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

function tonoSituacion(e: EstadoCuenta): "good" | "warn" | "crit" | "azul" {
  if (e.pendiente) return "azul";
  if (esAdelantado(e)) return "azul";
  if (esAlDiaHoy(e)) return "good";
  if (e.pendienteAnterior > 0.009) return "crit";
  return "warn";
}

function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}/${Number(m)}`;
}

function fechaLargaUi(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  try {
    return new Intl.DateTimeFormat("es-PA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00`));
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

function Fila({
  label,
  children,
  tone,
}: {
  label: string;
  children: ReactNode;
  tone?: "default" | "warn" | "crit" | "good" | "muted";
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
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-medium tabular-nums text-right ${valueClass}`}>{children}</span>
    </div>
  );
}

function Seccion({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {title}
      </h3>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

export function DetalleEstadoModal({
  estado,
  onClose,
}: {
  estado: EstadoCuenta;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const carro = etiquetaCarroUi(estado.empresa, estado.vehiculoNumero);
  const progreso = pctCuotas(estado);
  const adelantado = esAdelantado(estado);
  const alDia = esAlDiaHoy(estado);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

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
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl ring-1 ring-line sm:rounded-xl"
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
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

        {/* Cuerpo scrolleable */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Total hero */}
          <div className="rounded-xl bg-surface-2 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {adelantado
                ? "Situación"
                : alDia
                  ? "A pagar hoy"
                  : estado.pendiente
                    ? "Monto en validación"
                    : "A pagar hoy"}
            </p>
            {adelantado ? (
              <p className="mt-1 text-2xl font-bold tracking-tight text-azul">
                {estado.diasAdelantados} cuota{estado.diasAdelantados === 1 ? "" : "s"} por delante
              </p>
            ) : (
              <p
                className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${
                  alDia ? "text-verde" : estado.pendienteAnterior > 0.009 ? "text-rojo" : "text-ink"
                }`}
              >
                {alDia ? (
                  "Al día"
                ) : (
                  <Money amount={estado.totalHoy} className="text-3xl font-bold" />
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

          {/* Desglose del día */}
          <Seccion title="Desglose de hoy">
            {estado.lineas.length === 0 ? (
              <p className="py-2.5 text-sm text-muted">Sin cargos pendientes para hoy.</p>
            ) : (
              estado.lineas.map((l, i) => (
                <Fila
                  key={`${l.concepto}-${i}`}
                  label={l.concepto.charAt(0).toUpperCase() + l.concepto.slice(1)}
                  tone={l.monto < 0 ? "good" : l.concepto.includes("no pagar") ? "warn" : "default"}
                >
                  {l.monto < 0 ? `−${money(-l.monto)}` : money(l.monto)}
                </Fila>
              ))
            )}
            {!alDia && !adelantado && (
              <Fila label="Total">
                <span className="text-base font-semibold">{money(estado.totalHoy)}</span>
              </Fila>
            )}
            {estado.recargoSiTarda > 0.009 && (
              <Fila label="Si no completa antes de las 7 p.m." tone="warn">
                +{money(estado.recargoSiTarda)} → {money(estado.totalHoyTarde)}
              </Fila>
            )}
          </Seccion>

          {/* Plan de cuotas */}
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

          {/* Recargos y saldo */}
          <Seccion title="Recargos y saldo">
            <Fila
              label="Recargos acumulados"
              tone={estado.recargosAcumulados > 0.009 ? "warn" : "muted"}
            >
              {estado.recargosAcumulados > 0.009
                ? money(estado.recargosAcumulados)
                : "—"}
            </Fila>
            <Fila label="Recargo de hoy" tone={estado.recargo > 0.009 ? "warn" : "muted"}>
              {estado.recargo > 0.009 ? money(estado.recargo) : "—"}
            </Fila>
            <Fila
              label="Saldo anterior"
              tone={estado.pendienteAnterior > 0.009 ? "crit" : "muted"}
            >
              {estado.pendienteAnterior > 0.009
                ? money(estado.pendienteAnterior)
                : "—"}
            </Fila>
            <Fila label="Pagado hoy" tone={estado.pagadoHoy > 0.009 ? "good" : "muted"}>
              {estado.pagadoHoy > 0.009 ? money(estado.pagadoHoy) : "—"}
            </Fila>
            {estado.acuerdoHoy > 0.009 && (
              <Fila label="Arreglo de hoy">{money(estado.acuerdoHoy)}</Fila>
            )}
          </Seccion>

          {/* Contrato */}
          <Seccion title="Contrato">
            <Fila label="Valor / letra diaria">
              {estado.letra > 0.009 ? money(estado.letra) : "—"}
            </Fila>
            {estado.cobraDomingo && (
              <Fila label="Cuota domingo">
                {estado.cuotaDomingo > 0.009 ? money(estado.cuotaDomingo) : "Sí"}
              </Fila>
            )}
            <Fila label="Estado contrato">{estado.estadoContrato}</Fila>
            {estado.empresaNombre && (
              <Fila label="Empresa">{estado.empresaNombre}</Fila>
            )}
            {estado.waNumero && (
              <Fila label="WhatsApp">
                <span className="font-mono text-xs">{estado.waNumero}</span>
              </Fila>
            )}
            {estado.cubiertoHasta && (
              <Fila label="Cubierto hasta">{fechaCorta(estado.cubiertoHasta)}</Fila>
            )}
            {estado.esCumpleanos && (
              <Fila label="Cumpleaños" tone="good">
                {estado.cumpleLibreAplica
                  ? estado.cumpleMotivo ?? "Día libre"
                  : "Hoy (sin día libre)"}
              </Fila>
            )}
          </Seccion>
        </div>

        {/* Pie */}
        <div className="border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
