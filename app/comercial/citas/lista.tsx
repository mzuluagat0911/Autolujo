"use client";

import { useState, useTransition } from "react";
import { EmptyState, FiltersBar, StatusChip } from "@/components/kit";
import { fechaConDia } from "@/lib/cartera/fecha";
import { sedePorId } from "@/lib/comercial/sedes";
import type { CitaComercial } from "@/lib/comercial/citas";
import { marcarAsistencia, marcarCitaConfirmadaPorLlamada } from "../actions";

function telefono(n: string): string {
  const d = n.replace(/\D/g, "");
  const local = d.startsWith("507") ? d.slice(3) : d;
  if (local.length === 8) return `${local.slice(0, 4)}-${local.slice(4)}`;
  return n;
}

export function ListaCitas({
  citas,
  error,
  fechaHoy,
  manana,
}: {
  citas: CitaComercial[];
  error: string | null;
  fechaHoy: string;
  manana: string;
}) {
  const [aviso, setAviso] = useState<string | null>(error);
  const [hechas, setHechas] = useState<Record<string, true>>({});
  const [visitas, setVisitas] = useState<Record<string, "asistio" | "no_asistio" | "cancelada">>({});
  const [pending, start] = useTransition();
  const [sede, setSede] = useState("todas");
  const [cuando, setCuando] = useState("todas");

  function marcar(id: string, asistencia: "asistio" | "no_asistio" | "cancelada") {
    setAviso(null);
    start(async () => {
      const r = await marcarAsistencia(id, asistencia);
      if (!r.ok) {
        setAviso(r.error ?? "No pude actualizar la visita.");
        return;
      }
      setVisitas((prev) => ({ ...prev, [id]: asistencia }));
    });
  }

  const visibles = citas.filter((cita) => {
    if (sede !== "todas" && cita.sede !== sede) return false;
    if (cuando === "hoy" && cita.fecha !== fechaHoy) return false;
    if (cuando === "manana" && cita.fecha !== manana) return false;
    return true;
  });
  const excel = `/comercial/citas/excel?sede=${sede}&cuando=${cuando}`;

  if (error && citas.length === 0) {
    return <EmptyState title="Las citas no cargaron" hint={error} />;
  }
  if (citas.length === 0) {
    return <EmptyState title="No hay citas" hint="Cuando Lucía agende una visita, aparece aquí." />;
  }

  return (
    <div>
      <FiltersBar
        chipGroups={[
          {
            active: sede,
            onChip: setSede,
            chips: [
              { id: "todas", label: "Todas las sedes" },
              { id: "juan_diaz", label: "Juan Díaz", count: citas.filter((c) => c.sede === "juan_diaz").length },
              { id: "chorrera", label: "La Chorrera", count: citas.filter((c) => c.sede === "chorrera").length },
            ],
          },
          {
            active: cuando,
            onChip: setCuando,
            chips: [
              { id: "todas", label: "Todas las fechas" },
              { id: "hoy", label: "Hoy", count: citas.filter((c) => c.fecha === fechaHoy).length },
              { id: "manana", label: "Mañana", count: citas.filter((c) => c.fecha === manana).length },
            ],
          },
        ]}
        actions={
          <a
            href={excel}
            className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white"
          >
            Excel
          </a>
        }
      />
      {aviso && <p className="mb-3 mt-4 text-sm text-rojo">{aviso}</p>}
      {visibles.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No hay citas en este filtro" hint="Cambie la sede o el día, o baje el Excel de lo que está viendo." />
        </div>
      ) : null}
      {visibles.length > 0 && (
      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Cuándo</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Sede</th>
              <th className="px-4 py-3 font-medium">Lugar</th>
              <th className="px-4 py-3 font-medium">Campaña</th>
              <th className="px-4 py-3 font-medium">Confirmación</th>
              <th className="px-4 py-3 font-medium">Visita</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => {
              const visita = visitas[c.id] ?? (c.estado === "cancelada" ? "cancelada" : c.asistencia);
              const confirmada = c.confirmacion !== "pendiente" || hechas[c.id];
              const porLlamada = c.confirmacion === "llamada" || hechas[c.id];
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <p className="font-medium">{fechaConDia(c.fecha)}</p>
                    <p className="tabular-nums text-muted">{c.hora}</p>
                    {visita === "cancelada" && <p className="text-xs text-rojo">Cancelada</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p>{c.nombre}</p>
                    <p className="tabular-nums text-muted">{telefono(c.celular || c.waNumero)}</p>
                  </td>
                  <td className="px-4 py-3">{sedePorId(c.sede)?.nombre ?? c.sede}</td>
                  <td className="px-4 py-3 text-muted">{c.lugar || "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.anuncio || c.campanaId || "—"}</td>
                  <td className="px-4 py-3">
                    {visita === "cancelada" ? (
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
                  <td className="px-4 py-3">
                    {visita === "cancelada" ? (
                      <StatusChip tone="neutral">Cancelada</StatusChip>
                    ) : visita === "asistio" ? (
                      <StatusChip tone="good">Asistió</StatusChip>
                    ) : visita === "no_asistio" ? (
                      <StatusChip tone="crit">No asistió</StatusChip>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => marcar(c.id, "asistio")}
                          className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
                        >
                          Asistió
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => marcar(c.id, "no_asistio")}
                          className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
                        >
                          No asistió
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => marcar(c.id, "cancelada")}
                          className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-rojo ring-1 ring-rojo/30 disabled:opacity-50"
                        >
                          Cancelar
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
      )}
    </div>
  );
}
