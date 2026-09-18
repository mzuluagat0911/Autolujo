"use client";

import { useMemo, useState } from "react";
import { FiltersBar, StatusChip, Money, EmptyState } from "@/components/kit";
import {
  money,
  textoSituacionCuotas,
  textoValorCuotas,
  type EstadoCuenta,
} from "@/lib/cartera/estado-cuenta";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

type Filtro = "todas" | "pendiente" | "recargo" | "aldia";

function tonoSituacion(e: EstadoCuenta): "good" | "warn" | "crit" | "azul" {
  if (e.pendiente) return "azul";
  if (e.pagoPuntual || e.totalHoy <= 0.009) return "good";
  if (e.pendienteAnterior > 0.009) return "crit";
  return "warn";
}

export function EstadosTabla({ estados }: { estados: EstadoCuenta[] }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const contadores = useMemo(() => {
    let pendiente = 0;
    let recargo = 0;
    let aldia = 0;
    for (const e of estados) {
      if (e.pagoPuntual || e.totalHoy <= 0.009) aldia++;
      else pendiente++;
      if (e.recargo > 0.009 || e.recargoSiTarda > 0.009) recargo++;
    }
    return { pendiente, recargo, aldia };
  }, [estados]);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return estados.filter((e) => {
      if (filtro === "pendiente" && (e.pagoPuntual || e.totalHoy <= 0.009)) return false;
      if (filtro === "aldia" && !(e.pagoPuntual || e.totalHoy <= 0.009)) return false;
      if (filtro === "recargo" && !(e.recargo > 0.009 || e.recargoSiTarda > 0.009)) return false;
      if (!needle) return true;
      const blob = [
        e.vehiculoNumero,
        e.clienteNombre,
        e.empresa,
        etiquetaCarroUi(e.empresa, e.vehiculoNumero),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [estados, q, filtro]);

  return (
    <div className="mt-6 space-y-4">
      <FiltersBar
        search={{ value: q, onChange: setQ }}
        searchPlaceholder="Buscar carro o cliente…"
        chips={[
          { id: "todas", label: "Todas", count: estados.length },
          { id: "pendiente", label: "Pendiente", count: contadores.pendiente },
          { id: "recargo", label: "Con recargo", count: contadores.recargo },
          { id: "aldia", label: "Al día", count: contadores.aldia },
        ]}
        activeChip={filtro}
        onChip={(id) => setFiltro(id as Filtro)}
        actions={
          <p className="text-sm text-muted">
            <span className="font-medium tabular-nums text-ink">{visibles.length}</span> de{" "}
            {estados.length}
          </p>
        }
      />

      {visibles.length === 0 ? (
        <EmptyState title="Ningún carro coincide" hint="Probá otro filtro o búsqueda." />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium whitespace-nowrap">Carro</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Valor</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Recargo</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Total hoy</th>
                <th className="px-4 py-3 font-medium">Situación</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, 250).map((e) => (
                <tr key={e.contratoId} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5 font-semibold whitespace-nowrap tabular-nums">
                    {etiquetaCarroUi(e.empresa, e.vehiculoNumero)}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{e.clienteNombre}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {e.letra > 0.009 ? <Money amount={e.letra} /> : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ambar">
                    {e.recargo > 0.009 ? (
                      <Money amount={e.recargo} />
                    ) : e.recargoSiTarda > 0.009 ? (
                      <span className="text-xs text-muted" title="Si no completa antes de las 7 p.m.">
                        +<Money amount={e.recargoSiTarda} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium tabular-nums whitespace-nowrap">
                    {textoValorCuotas(e)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusChip tone={tonoSituacion(e)}>{textoSituacionCuotas(e)}</StatusChip>
                    <p className="mt-1 text-[11px] text-muted tabular-nums">
                      A pagar hoy {money(e.totalHoy)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
