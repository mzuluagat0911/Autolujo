"use client";

import { useState, useTransition } from "react";
import { EmptyState, StatusChip } from "@/components/kit";
import { fechaConDia } from "@/lib/cartera/fecha";
import { sedePorId } from "@/lib/comercial/sedes";
import type { CitaComercial } from "@/lib/comercial/citas";
import { marcarCitaConfirmadaPorLlamada } from "../actions";

function telefono(n: string): string {
  const d = n.replace(/\D/g, "");
  const local = d.startsWith("507") ? d.slice(3) : d;
  if (local.length === 8) return `${local.slice(0, 4)}-${local.slice(4)}`;
  return n;
}

export function ListaCitas({ citas, error }: { citas: CitaComercial[]; error: string | null }) {
  const [aviso, setAviso] = useState<string | null>(error);
  const [hechas, setHechas] = useState<Record<string, true>>({});
  const [pending, start] = useTransition();

  if (error && citas.length === 0) {
    return <EmptyState title="Las citas no cargaron" hint={error} />;
  }
  if (citas.length === 0) {
    return <EmptyState title="No hay citas" hint="Cuando Lucía agende una visita, aparece aquí." />;
  }

  return (
    <div>
      {aviso && <p className="mb-3 text-sm text-rojo">{aviso}</p>}
      <div className="overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Cuándo</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Sede</th>
              <th className="px-4 py-3 font-medium">Lugar</th>
              <th className="px-4 py-3 font-medium">Campaña</th>
              <th className="px-4 py-3 font-medium">Confirmación</th>
            </tr>
          </thead>
          <tbody>
            {citas.map((c) => {
              const confirmada = c.confirmacion !== "pendiente" || hechas[c.id];
              const porLlamada = c.confirmacion === "llamada" || hechas[c.id];
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <p className="font-medium">{fechaConDia(c.fecha)}</p>
                    <p className="tabular-nums text-muted">{c.hora}</p>
                    {c.estado === "cancelada" && <p className="text-xs text-rojo">Cancelada</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p>{c.nombre}</p>
                    <p className="tabular-nums text-muted">{telefono(c.celular || c.waNumero)}</p>
                  </td>
                  <td className="px-4 py-3">{sedePorId(c.sede)?.nombre ?? c.sede}</td>
                  <td className="px-4 py-3 text-muted">{c.lugar || "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.anuncio || c.campanaId || "—"}</td>
                  <td className="px-4 py-3">
                    {c.estado === "cancelada" ? (
                      <StatusChip tone="neutral">Cancelada</StatusChip>
                    ) : confirmada ? (
                      <StatusChip tone="good">{porLlamada ? "Confirmó por llamada" : "Confirmó por chat"}</StatusChip>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip tone="warn">Sin confirmar</StatusChip>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setAviso(null);
                            start(async () => {
                              const r = await marcarCitaConfirmadaPorLlamada(c.id);
                              if (!r.ok) {
                                setAviso(r.error ?? "No pude marcar la llamada.");
                                return;
                              }
                              setHechas((prev) => ({ ...prev, [c.id]: true }));
                            });
                          }}
                          className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
                        >
                          Confirmó por llamada
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
