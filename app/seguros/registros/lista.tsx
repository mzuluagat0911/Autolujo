"use client";

import { useMemo, useState, useTransition } from "react";
import { Toast } from "@/components/kit";
import type { CarroParaCaso } from "@/lib/seguros/datos";
import { pathVehiculo } from "@/lib/seguros/datos";
import { subirRegistroVehiculo } from "../actions";

export function ListaRegistros({ carros, urls }: { carros: CarroParaCaso[]; urls: Record<string, string> }) {
  const [q, setQ] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lista = t
      ? carros.filter((c) => `${c.etiqueta} ${c.placa} ${c.cliente}`.toLowerCase().includes(t))
      : carros;
    return [...lista].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true }));
  }, [carros, q]);

  function subir(vehiculoId: string, archivo: File) {
    const fd = new FormData();
    fd.set("vehiculo_id", vehiculoId);
    fd.set("archivo", archivo);
    setError(null);
    start(async () => {
      const r = await subirRegistroVehiculo(fd);
      if (!r.ok) {
        setError(r.error ?? "No se pudo guardar.");
        return;
      }
      setAviso(r.msg ?? "Registro guardado.");
    });
  }

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
                    <div className="flex flex-wrap items-center gap-3">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                          Ver
                        </a>
                      ) : (
                        <span className="text-muted">Sin archivo</span>
                      )}
                      <label className="cursor-pointer text-sm font-medium hover:underline">
                        {url ? "Cambiar" : "Subir"}
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="sr-only"
                          disabled={pending}
                          onChange={(e) => {
                            const archivo = e.currentTarget.files?.[0];
                            e.currentTarget.value = "";
                            if (archivo) subir(c.id, archivo);
                          }}
                        />
                      </label>
                    </div>
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
      {aviso && <Toast message={aviso} tone="good" onDismiss={() => setAviso(null)} />}
      {error && <p className="mt-3 text-sm text-rojo">{error}</p>}
    </div>
  );
}
