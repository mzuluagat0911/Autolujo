"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiltersBar, StatusChip, EmptyState } from "@/components/kit";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

export type FilaHojaVida = {
  id: string;
  numero: string;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  estado: string;
  empresa: { codigo: string } | null;
  eventos: number;
  ultimo: string | null;
  /** Texto de eventos para buscar (fecha + tipo/título/detalle/lugar). */
  historial: { fecha: string; texto: string }[];
};

type Filtro = "todas" | "con" | "sin";

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function matchHistorial(lineas: FilaHojaVida["historial"], needle: string) {
  if (!needle) return [] as { fecha: string; texto: string }[];
  return lineas.filter((l) => l.texto.toLowerCase().includes(needle)).slice(0, 3);
}

export function HojaVidaLista({
  filas,
  error,
}: {
  filas: FilaHojaVida[];
  error: string | null;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const contadores = useMemo(() => {
    let con = 0;
    let sin = 0;
    for (const f of filas) {
      if (f.eventos > 0) con++;
      else sin++;
    }
    return { con, sin };
  }, [filas]);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return filas
      .map((f) => {
        const hits = matchHistorial(f.historial, needle);
        return { f, hits };
      })
      .filter(({ f, hits }) => {
        if (filtro === "con" && f.eventos <= 0) return false;
        if (filtro === "sin" && f.eventos > 0) return false;
        if (!needle) return true;
        const blob = [
          f.numero,
          f.placa,
          f.marca,
          f.modelo,
          f.empresa?.codigo,
          etiquetaCarroUi(f.empresa?.codigo, f.numero),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(needle) || hits.length > 0;
      });
  }, [filas, q, filtro]);

  const needle = q.trim().toLowerCase();

  return (
    <div className="mt-6 space-y-4">
      <FiltersBar
        search={{ value: q, onChange: setQ }}
        searchPlaceholder="Carro, placa o palabra del historial (ventilador…)"
        chips={[
          { id: "todas", label: "Todas", count: filas.length },
          { id: "con", label: "Con historial", count: contadores.con },
          { id: "sin", label: "Sin eventos", count: contadores.sin },
        ]}
        activeChip={filtro}
        onChip={(id) => setFiltro(id as Filtro)}
        actions={
          <p className="text-sm text-muted">
            <span className="font-medium tabular-nums text-ink">{visibles.length}</span> de{" "}
            {filas.length}
          </p>
        }
      />

      {error ? (
        <EmptyState title="No se pudo cargar la flota" hint={error} />
      ) : visibles.length === 0 ? (
        <EmptyState
          title="Ningún carro coincide"
          hint={
            needle
              ? `No hay eventos ni carros con “${q.trim()}”. Probá otra palabra.`
              : "Probá otro filtro o búsqueda."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Placa</th>
                <th className="px-4 py-3 font-medium">Ficha</th>
                <th className="px-4 py-3 font-medium">Eventos</th>
                <th className="px-4 py-3 font-medium">Último</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visibles.map(({ f, hits }) => {
                const href =
                  needle && hits.length > 0
                    ? `/operaciones/hoja-vida/${f.id}?q=${encodeURIComponent(q.trim())}`
                    : `/operaciones/hoja-vida/${f.id}`;
                return (
                  <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold tabular-nums">
                        {etiquetaCarroUi(f.empresa?.codigo, f.numero)}
                      </p>
                      {hits.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {hits.map((h, i) => (
                            <li key={`${h.fecha}-${i}`} className="text-xs text-muted">
                              <span className="tabular-nums text-faint">{fmtFecha(h.fecha)}</span>
                              {" · "}
                              <span className="line-clamp-2">{h.texto}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-muted">
                      {f.placa ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-muted">
                      {[f.marca, f.modelo, f.anio].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {f.eventos > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusChip tone="azul">{f.eventos}</StatusChip>
                          {hits.length > 0 && <StatusChip tone="warn">En historial</StatusChip>}
                        </div>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-muted">
                      {f.ultimo ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <Link
                        href={href}
                        className="text-sm font-medium underline-offset-2 hover:underline"
                      >
                        Abrir
                      </Link>
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
