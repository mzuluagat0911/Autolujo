"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { registrarPagoManual, type ResultadoPagoManual } from "./actions";

const HOY = new Date().toISOString().slice(0, 10);

export function PagoManualForm() {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState<ResultadoPagoManual | null, FormData>(
    registrarPagoManual,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Limpiar el formulario tras un registro exitoso.
  useEffect(() => {
    if (estado?.ok) formRef.current?.reset();
  }, [estado?.ok]);

  return (
    <div className="rounded-xl bg-surface ring-1 ring-line">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span>
          <span className="text-sm font-semibold">Registrar pago en oficina</span>
          <span className="ml-2 text-xs text-muted">efectivo o datáfono</span>
        </span>
        <span className={`text-muted transition ${abierto ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {abierto && (
        <form ref={formRef} action={accion} className="border-t border-line p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Número de carro">
              <input
                name="carro"
                inputMode="numeric"
                placeholder="144"
                required
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </Campo>
            <Campo label="Monto (USD)">
              <input
                name="monto"
                inputMode="decimal"
                placeholder="60"
                required
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm tabular-nums ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </Campo>
            <Campo label="Método">
              <select
                name="metodo"
                required
                defaultValue=""
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              >
                <option value="" disabled>Elige…</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta (datáfono)</option>
              </select>
            </Campo>
            <Campo label="Fecha">
              <input
                type="date"
                name="fecha"
                defaultValue={HOY}
                className="w-full rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </Campo>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pendiente}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface transition hover:bg-black disabled:opacity-50"
            >
              {pendiente ? "Registrando…" : "Registrar pago"}
            </button>
            {estado && (
              <span className={`text-sm ${estado.ok ? "text-verde" : "text-rojo"}`}>{estado.msg}</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{label}</span>
      {children}
    </label>
  );
}
