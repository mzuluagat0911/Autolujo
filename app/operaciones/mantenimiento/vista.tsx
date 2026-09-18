"use client";

import { useMemo, useState } from "react";
import { FiltersBar, StatusChip, EmptyState } from "@/components/kit";
import { type MantenimientoItem } from "@/lib/operaciones/alertas";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-PA"));

function nivelDe(i: MantenimientoItem) {
  if (i.estado === "vencido") return "critico";
  if (i.estado === "pronto") return "pronto";
  return "ok";
}

export function MantenimientoVista({ items }: { items: MantenimientoItem[] }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todas");

  const contadores = useMemo(() => {
    let critico = 0,
      pronto = 0,
      ok = 0;
    for (const i of items) {
      const n = nivelDe(i);
      if (n === "critico") critico++;
      else if (n === "pronto") pronto++;
      else ok++;
    }
    return { critico, pronto, ok };
  }, [items]);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (filtro !== "todas" && nivelDe(i) !== filtro) return false;
      if (!needle) return true;
      const blob = `${etiquetaCarroUi(i.empresa, i.vehiculoNumero)} ${i.cliente ?? ""}`.toLowerCase();
      return blob.includes(needle);
    });
  }, [items, q, filtro]);

  return (
    <div className="mt-6 space-y-4">
      <FiltersBar
        search={{ value: q, onChange: setQ }}
        searchPlaceholder="Buscar carro o cliente…"
        chips={[
          { id: "todas", label: "Todas", count: items.length },
          { id: "critico", label: "Crítico", count: contadores.critico },
          { id: "pronto", label: "Pronto", count: contadores.pronto },
          { id: "ok", label: "Al día", count: contadores.ok },
        ]}
        activeChip={filtro}
        onChip={setFiltro}
        actions={
          <p className="text-sm text-muted">
            <span className="font-medium tabular-nums text-ink">{visibles.length}</span> de {items.length}
          </p>
        }
      />
      {visibles.length === 0 ? (
        <EmptyState title="Ningún registro coincide" hint="Probá otro filtro o búsqueda." />
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Último mant.</th>
                <th className="px-4 py-3 font-medium">Km recorridos</th>
                <th className="px-4 py-3 font-medium">Situación</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((i) => (
                <tr
                  key={`${i.empresa}-${i.vehiculoNumero}`}
                  className="border-b border-line last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {etiquetaCarroUi(i.empresa, i.vehiculoNumero)}
                  </td>
                  <td className="px-4 py-3">{i.cliente ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">{i.desde}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{fmt(i.kmDesde)} km</td>
                  <td className="px-4 py-3">
                    {i.estado === "vencido" ? (
                      <StatusChip tone="crit">Citar ya</StatusChip>
                    ) : i.estado === "pronto" ? (
                      <StatusChip tone="warn">Pronto (faltan {fmt(i.faltan)} km)</StatusChip>
                    ) : (
                      <StatusChip tone="good">Al día</StatusChip>
                    )}
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
