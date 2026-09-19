"use client";

import { StatusChip, EmptyState } from "@/components/kit";
import type { KitTiempoItem } from "@/lib/operaciones/alertas";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

const fmt = (n: number) => n.toLocaleString("es-PA");

export function KitTiempoVista({ items }: { items: KitTiempoItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nadie en ventana de kit de tiempo"
        hint="Aparecen carros cerca o pasados de cada marca de 60.000 km (55–65 mil del ciclo)."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Carro</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Km actual</th>
            <th className="px-4 py-3 font-medium">Marca</th>
            <th className="px-4 py-3 font-medium">Situación</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr
              key={`${i.empresa}-${i.vehiculoNumero}`}
              className="border-b border-line last:border-0 hover:bg-surface-2"
            >
              <td className="px-4 py-3 font-semibold tabular-nums">
                {etiquetaCarroUi(i.empresa, i.vehiculoNumero)}
              </td>
              <td className="px-4 py-3">{i.cliente ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums font-medium">{fmt(i.kmActual)}</td>
              <td className="px-4 py-3 tabular-nums text-muted">{fmt(i.marcaKm)}</td>
              <td className="px-4 py-3">
                {i.estado === "vencido" ? (
                  <StatusChip tone="crit">Citar kit</StatusChip>
                ) : (
                  <StatusChip tone="warn">Pronto (faltan {fmt(i.faltan)} km)</StatusChip>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
