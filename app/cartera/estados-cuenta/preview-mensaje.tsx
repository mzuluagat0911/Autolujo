"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { StatusChip } from "@/components/kit";
import { money } from "@/lib/cartera/estado-cuenta";
import {
  previewEstadoCuenta,
  estaAlDia,
  totalCobrarHoyExtracto,
} from "@/lib/cartera/extracto-preview";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import type { EstadoCuentaFila } from "./types";
import { previewMensajeLetraDiaria } from "./actions";

function ctxDe(e: EstadoCuentaFila) {
  return { acuerdoSaldo: e.acuerdoSaldo, extras: e.extras };
}

export function PreviewMensajeModal({
  estado,
  onClose,
  refreshKey = 0,
}: {
  estado: EstadoCuentaFila;
  onClose: () => void;
  /** Sube cuando hay un pago/ajuste — fuerza relectura en vivo. */
  refreshKey?: number;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState(() => previewEstadoCuenta(estado, ctxDe(estado)));
  const [total, setTotal] = useState(() => totalCobrarHoyExtracto(estado, ctxDe(estado)));
  const [seEnvia, setSeEnvia] = useState(() => totalCobrarHoyExtracto(estado, ctxDe(estado)) > 0.009);
  const [alDia, setAlDia] = useState(() => estaAlDia(estado));
  const [error, setError] = useState<string | null>(null);
  const [vivo, setVivo] = useState(false);

  const carro = etiquetaCarroUi(estado.empresa, estado.vehiculoNumero);

  function cargarVivo() {
    start(async () => {
      setError(null);
      const res = await previewMensajeLetraDiaria(estado.contratoId);
      if (!res.ok) {
        setError(res.error ?? "No pude actualizar el mensaje.");
        return;
      }
      setTexto(res.texto ?? "");
      setTotal(res.totalCobrarHoy ?? 0);
      setSeEnvia(Boolean(res.seEnvia));
      setAlDia(Boolean(res.alDia));
      setVivo(true);
    });
  }

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

  // Primera apertura + cada refreshKey (pago/ajuste) → estado en vivo desde DB.
  useEffect(() => {
    cargarVivo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.contratoId, refreshKey]);

  // Si el panel refresca la fila (router.refresh), actualizá también el fallback local.
  useEffect(() => {
    if (vivo) return;
    setTexto(previewEstadoCuenta(estado, ctxDe(estado)));
    const t = totalCobrarHoyExtracto(estado, ctxDe(estado));
    setTotal(t);
    setSeEnvia(t > 0.009);
    setAlDia(estaAlDia(estado));
  }, [estado, vivo]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-paper shadow-xl ring-1 ring-line sm:rounded-2xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Mensaje · letra diaria
            </p>
            <h2 id={titleId} className="mt-0.5 truncate text-base font-semibold text-ink">
              {carro} · {estado.clienteNombre}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusChip tone={seEnvia ? (alDia ? "good" : "warn") : "neutral"}>
                {seEnvia ? (alDia ? "Se envía · al día" : "Se envía") : "No se envía ($0)"}
              </StatusChip>
              {vivo && (
                <span className="text-[11px] text-faint">
                  {pending ? "Actualizando…" : "En vivo"}
                </span>
              )}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-sm text-muted ring-1 ring-line hover:bg-surface-2 hover:text-ink"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 text-sm text-rojo">{error}</p>}
          <div className="whitespace-pre-wrap rounded-xl bg-ink p-5 text-sm leading-relaxed text-paper">
            {pending && !texto ? "Armando mensaje…" : texto}
          </div>
          <p className="mt-3 text-xs text-muted">
            Total del extracto:{" "}
            <span className="font-medium tabular-nums text-ink">{money(total)}</span>
            . Misma lógica del cron de las 9 a.m.
          </p>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            disabled={pending}
            onClick={cargarVivo}
            className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
          >
            {pending ? "Actualizando…" : "Actualizar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Botón compacto para la columna Situación (no abre el detalle de fila). */
export function BotonPreviewMensaje({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title="Ver mensaje de letra diaria"
      onClick={(ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        onClick();
      }}
      onKeyDown={(ev) => ev.stopPropagation()}
      className="mt-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-ink ring-1 ring-line transition hover:bg-surface-2"
    >
      Ver mensaje
    </button>
  );
}
