"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiltersBar, StatusChip, EmptyState } from "@/components/kit";
import type { LicenciaItem, NivelSemaforo } from "@/lib/operaciones/alertas";

function tono(n: NivelSemaforo): "crit" | "warn" | "good" {
  if (n === "vencido" || n === "rojo") return "crit";
  if (n === "amarillo") return "warn";
  return "good";
}
function etiqueta(dias: number): string {
  if (dias < 0) return `Vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "Vence HOY";
  return `Vence en ${dias} día${dias === 1 ? "" : "s"}`;
}
function nivelDe(i: LicenciaItem) {
  if (i.nivel === "vencido" || i.nivel === "rojo") return "critico";
  if (i.nivel === "amarillo") return "pronto";
  return "ok";
}

export function LicenciasVista({ items }: { items: LicenciaItem[] }) {
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
      return `${i.nombre} ${i.carro ?? ""} ${i.contacto ?? ""}`.toLowerCase().includes(needle);
    });
  }, [items, q, filtro]);

  return (
    <div className="mt-6 space-y-4">
      <FiltersBar
        search={{ value: q, onChange: setQ }}
        searchPlaceholder="Buscar cliente, carro o contacto…"
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
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Situación</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/cartera/clientes/${i.id}`} className="hover:underline">
                      {i.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {i.vehiculoId && i.carro ? (
                      <Link href={`/operaciones/hoja-vida/${i.vehiculoId}`} className="hover:underline">
                        {i.carro}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">{i.fecha}</td>
                  <td className="px-4 py-3">
                    <StatusChip tone={tono(i.nivel)}>{etiqueta(i.dias)}</StatusChip>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">{i.contacto ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
