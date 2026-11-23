"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Money } from "@/components/kit";
import type { CarroParaCaso } from "@/lib/seguros/datos";
import { pathVehiculo } from "@/lib/seguros/datos";
import { fechaCorta } from "@/lib/seguros/modelo";

export type PagoChoque = {
  id: string;
  vehiculoId: string;
  cliente: string;
  fechaPago: string;
  fechaChoque: string;
  monto: number | null;
};

export function ListaRegistros({
  carros,
  urls,
  pagos,
}: {
  carros: CarroParaCaso[];
  urls: Record<string, string>;
  pagos: PagoChoque[];
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const pagosPorCarro = useMemo(() => {
    const map = new Map<string, PagoChoque[]>();
    for (const p of pagos) {
      const lista = map.get(p.vehiculoId) ?? [];
      lista.push(p);
      map.set(p.vehiculoId, lista);
    }
    for (const lista of map.values()) {
      lista.sort((a, b) => b.fechaPago.localeCompare(a.fechaPago));
    }
    return map;
  }, [pagos]);

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
              <th className="px-4 py-3 font-medium">Pagos choque</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => {
              const url = urls[pathVehiculo(c.id, "registro")];
              const delCarro = pagosPorCarro.get(c.id) ?? [];
              const expandido = abierto === c.id;
              return (
                <FilaRegistro
                  key={c.id}
                  carro={c}
                  url={url}
                  pagos={delCarro}
                  expandido={expandido}
                  onToggle={() => setAbierto(expandido ? null : c.id)}
                />
              );
            })}
            {filas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
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

function FilaRegistro({
  carro,
  url,
  pagos,
  expandido,
  onToggle,
}: {
  carro: CarroParaCaso;
  url?: string;
  pagos: PagoChoque[];
  expandido: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-line">
        <td className="px-4 py-3 font-medium">{carro.etiqueta}</td>
        <td className="px-4 py-3 tabular-nums text-muted">{carro.placa || "—"}</td>
        <td className="px-4 py-3">
          {url ? (
            <span className="flex flex-wrap gap-3">
              <a href={url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                Ver
              </a>
              <a
                href={`/seguros/registros/${carro.id}/imprimir`}
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
        <td className="px-4 py-3">
          {pagos.length === 0 ? (
            <span className="text-muted">Sin pagos</span>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              className="font-medium text-ink hover:underline"
              aria-expanded={expandido}
            >
              {pagos.length} {pagos.length === 1 ? "pago" : "pagos"}
              {expandido ? " · Cerrar" : " · Ver lista"}
            </button>
          )}
        </td>
      </tr>
      {expandido && pagos.length > 0 && (
        <tr className="border-t border-line bg-surface-2/60">
          <td colSpan={4} className="px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Quién cobró finiquito en {carro.etiqueta}
            </p>
            <ul className="divide-y divide-line rounded-lg bg-paper ring-1 ring-line">
              {pagos.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/seguros/${p.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-2"
                  >
                    <span>
                      <span className="font-medium">{p.cliente || "Sin cliente"}</span>
                      <span className="text-muted">
                        {" "}
                        · pago {fechaCorta(p.fechaPago)} · choque {fechaCorta(p.fechaChoque)}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {p.monto != null ? <Money amount={p.monto} /> : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
