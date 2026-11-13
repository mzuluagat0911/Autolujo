"use client";

import { useMemo, useState } from "react";
import type { CarroParaCaso } from "@/lib/seguros/datos";
import { pathVehiculo } from "@/lib/seguros/datos";

export function ListaRegistros({ carros, urls }: { carros: CarroParaCaso[]; urls: Record<string, string> }) {
  const [q, setQ] = useState("");

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lista = t
      ? carros.filter((c) => `${c.etiqueta} ${c.placa} ${c.cliente}`.toLowerCase().includes(t))
      : carros;
    return [...lista].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true }));
  }, [carros, q]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por número, placa o cliente"
        className="mb-4 w-full max-w-sm rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
      />
      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Carro</th>
              <th className="px-4 py-3 font-medium">Placa</th>
              <th className="px-4 py-3 font-medium">Registro</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => {
              const url = urls[pathVehiculo(c.id, "registro")];
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{c.etiqueta}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">{c.placa || "—"}</td>
                  <td className="px-4 py-3">
                    {url ? (
                      <span className="flex flex-wrap gap-3">
                        <a href={url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                          Ver
                        </a>
                        <a
                          href={`/seguros/registros/${c.id}/imprimir`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium hover:underline"
                        >
                          Imprimir
                        </a>
                      </span>
                    ) : (
                      <span className="text-muted">Sin archivo</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">
                  Ningún carro coincide.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
