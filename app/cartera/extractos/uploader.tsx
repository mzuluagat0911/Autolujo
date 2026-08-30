"use client";

import { useActionState } from "react";
import { conciliarExtracto } from "./actions";
import { StatusChip, Money } from "@/components/kit";
import type { ResultadoConciliacion } from "@/lib/cartera/extracto";

function tone(estado: string): "good" | "warn" | "crit" | "neutral" {
  if (estado === "aplicado") return "good";
  if (estado === "parcial") return "warn";
  if (estado === "revisar") return "crit";
  return "neutral";
}

export function SubirExtracto() {
  const [state, action, pending] = useActionState<ResultadoConciliacion | null, FormData>(
    conciliarExtracto,
    null,
  );

  return (
    <div>
      <form action={action} className="rounded-2xl bg-surface p-6 ring-1 ring-line/60">
        <label className="block text-sm font-medium">Extracto del banco (PDF)</label>
        <p className="mt-1 text-xs text-muted">
          Sube el PDF de “Últimos movimientos” de Banco General. El sistema detecta la empresa,
          cruza por # de carro (y por nombre) y aplica los pagos.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="archivo"
            accept="application/pdf"
            required
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-paper hover:file:opacity-90"
          />
          <button
            disabled={pending}
            className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Conciliando…" : "Conciliar extracto"}
          </button>
        </div>
      </form>

      {state && !state.ok && state.error && (
        <p className="mt-4 rounded-xl bg-crit/5 px-4 py-3 text-sm text-crit ring-1 ring-crit/25">
          {state.error}
        </p>
      )}

      {state && state.ok && (
        <div className="mt-6">
          {/* Resumen */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Resumen label="Movimientos" value={state.total} />
            <Resumen label="Aplicados" value={state.aplicados} tone="good" />
            <Resumen label="Parciales" value={state.parciales} tone="warn" />
            <Resumen label="Por revisar" value={state.revisar} tone={state.revisar > 0 ? "crit" : "neutral"} />
          </div>
          <p className="mt-3 text-sm text-muted">
            Empresa detectada: <b>{state.empresa}</b> · Total aplicado:{" "}
            <b><Money amount={state.montoAplicado} /></b>
          </p>

          {/* Detalle */}
          <div className="mt-4 overflow-x-auto rounded-2xl bg-surface ring-1 ring-line/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3">Carro</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {state.detalle.map((d, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 tabular-nums text-muted">{d.fecha ?? "—"}</td>
                    <td className="px-4 py-2.5">{d.descripcion.slice(0, 60)}</td>
                    <td className="px-4 py-2.5 font-semibold">{d.carro ?? (d.via === "nombre" ? "por nombre" : "—")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums"><Money amount={d.monto} /></td>
                    <td className="px-4 py-2.5"><StatusChip tone={tone(d.estado)}>{d.estado}</StatusChip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Resumen({ label, value, tone: t }: { label: string; value: number; tone?: "good" | "warn" | "crit" | "neutral" }) {
  const color = t === "good" ? "text-good" : t === "warn" ? "text-gold" : t === "crit" ? "text-crit" : "text-ink";
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line/60">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
