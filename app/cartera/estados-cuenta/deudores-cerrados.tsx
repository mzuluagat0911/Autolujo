"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Money } from "@/components/kit";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import type { DeudaCerrada } from "@/lib/cartera/deudas-cerradas";

export function DeudoresCerrados({ deudas }: { deudas: DeudaCerrada[] }) {
  const [min, setMin] = useState("");

  const { filtradas, total } = useMemo(() => {
    const m = Number(min) || 0;
    const filtradas = deudas.filter((d) => d.saldo >= m);
    const total = filtradas.reduce((a, d) => a + d.saldo, 0);
    return { filtradas, total };
  }, [deudas, min]);

  if (deudas.length === 0) {
    return (
      <p className="mt-3 rounded-xl bg-surface px-5 py-8 text-center text-sm text-muted ring-1 ring-line/60">
        No hay ex-clientes con deuda. 🎉
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
            Deben al menos (USD)
          </span>
          <input
            value={min}
            onChange={(e) => setMin(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            className="w-40 rounded-lg bg-paper px-3 py-2 text-sm tabular-nums ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Deuda ex-clientes {min ? `(≥ $${min})` : ""}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rojo">
            <Money amount={total} />
          </p>
          <p className="mt-0.5 text-xs text-muted">{filtradas.length} contrato{filtradas.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line/60">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-4 py-3 whitespace-nowrap">Carro</th>
              <th className="px-4 py-3">Ex-cliente</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Deuda</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtradas.map((d) => (
              <tr key={d.contratoId} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="px-4 py-2.5 font-semibold whitespace-nowrap tabular-nums">
                  {etiquetaCarroUi(d.empresa, d.vehiculoNumero)}
                </td>
                <td className="px-4 py-2.5">{d.clienteNombre}</td>
                <td className="px-4 py-2.5 text-xs text-muted">{d.estado}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-rojo">
                  <Money amount={d.saldo} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  {d.clienteId ? (
                    <Link href={`/cartera/clientes/${d.clienteId}`} className="text-xs text-muted hover:text-ink">
                      ver →
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Ninguno debe ${min} o más.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
