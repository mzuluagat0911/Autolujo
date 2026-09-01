"use client";

import { useActionState, useState } from "react";
import { resolverMovimientoExtracto } from "./actions";
import { StatusChip, Money } from "@/components/kit";
import type { ResultadoRevision } from "@/lib/cartera/revision-extracto";

export type MovimientoRevision = {
  id: string;
  fecha: string | null;
  monto: number;
  descripcion: string | null;
  numeroCarro: string | null;
  nombreDetectado: string | null;
  motivo: string | null;
  via: string | null;
  sugeridoCarro: string | null;
  sugeridoCliente: string | null;
  empresa: string | null;
};

function viaChip(via: string | null): { tone: "good" | "warn" | "azul" | "neutral"; label: string } {
  if (via === "carro") return { tone: "azul", label: "por carro" };
  if (via === "nombre") return { tone: "warn", label: "por nombre" };
  return { tone: "neutral", label: "sin pista" };
}

export function ColaRevision({ movimientos }: { movimientos: MovimientoRevision[] }) {
  if (movimientos.length === 0) {
    return (
      <p className="rounded-xl bg-surface px-5 py-10 text-center text-sm text-muted ring-1 ring-line">
        Nada por revisar. Al subir un extracto, lo que no calce perfecto aparece aquí.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {movimientos.map((m) => (
        <FilaRevision key={m.id} m={m} />
      ))}
    </div>
  );
}

function FilaRevision({ m }: { m: MovimientoRevision }) {
  const [aplicar, accionAplicar, aplicando] = useActionState<ResultadoRevision | null, FormData>(
    resolverMovimientoExtracto,
    null,
  );
  const [ignorar, accionIgnorar, ignorando] = useActionState<ResultadoRevision | null, FormData>(
    resolverMovimientoExtracto,
    null,
  );
  const [carro, setCarro] = useState(m.sugeridoCarro ?? m.numeroCarro ?? "");
  const via = viaChip(m.via);
  const busy = aplicando || ignorando;

  if (aplicar?.ok || ignorar?.ok) return null;

  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-lg font-semibold">
              <Money amount={m.monto} />
            </span>
            {m.empresa && <StatusChip tone="neutral">{m.empresa}</StatusChip>}
            <StatusChip tone={via.tone}>{via.label}</StatusChip>
            {m.sugeridoCarro && (
              <StatusChip tone="azul">Carro {m.sugeridoCarro}</StatusChip>
            )}
          </div>
          <p className="mt-2 text-sm text-muted">
            {m.fecha ?? "sin fecha"}
            {m.nombreDetectado ? ` · ${m.nombreDetectado}` : ""}
          </p>
          {m.descripcion && (
            <p className="mt-1 text-sm">{m.descripcion.slice(0, 140)}</p>
          )}
          {m.motivo && <p className="mt-2 text-[12px] text-muted">{m.motivo}</p>}
          {m.sugeridoCliente && (
            <p className="mt-1 text-[12px] text-muted">Sugerido: {m.sugeridoCliente}</p>
          )}
        </div>
      </div>

      {(aplicar?.error || ignorar?.error) && (
        <p className="mt-3 text-sm text-rojo">{aplicar?.error ?? ignorar?.error}</p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <form action={accionAplicar} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="movimiento_id" value={m.id} />
          <input type="hidden" name="accion" value="aplicar" />
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Carro
            </span>
            <input
              name="carro"
              value={carro}
              onChange={(e) => setCarro(e.target.value)}
              placeholder="144"
              required
              className="w-28 rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
            />
          </label>
          <button
            disabled={busy}
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
          >
            {aplicando ? "Aplicando…" : "Aplicar"}
          </button>
        </form>
        <form action={accionIgnorar}>
          <input type="hidden" name="movimiento_id" value={m.id} />
          <input type="hidden" name="accion" value="ignorar" />
          <button
            disabled={busy}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-rojo ring-1 ring-rojo/30 transition hover:bg-rojo-wash disabled:opacity-50"
          >
            {ignorando ? "…" : "Ignorar"}
          </button>
        </form>
      </div>
    </div>
  );
}
