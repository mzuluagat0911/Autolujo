"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/kit";

export type FilaVehiculo = {
  id: string;
  numero: string;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  km_actual: number | null;
  gps_id: string | null;
  panapass: string | null;
  estado: string;
  empresa: string | null;
  cliente: string | null;
  letra: number | null;
  contratoId: string | null;
  kmMes: number | null;
  kmHoy: number | null;
  alertaGps: string | null;
  salida: {
    destino: string;
    fecha: string | null;
    fechaHasta: string | null;
    fueraTabla: boolean;
    estadoAval: string;
    estadoPago: string | null;
    gpsEstado: string | null;
  } | null;
};

const ESTADOS: Record<string, string> = {
  activo: "Activo",
  mantenimiento: "Mantenimiento",
  chapisteria: "Chapistería",
  por_entregar: "Por entregar",
  improductivo: "Improductivo",
  entregado: "Entregado",
};

function estadoTone(e: string): "good" | "warn" | "crit" | "neutral" {
  if (e === "activo") return "good";
  if (e === "mantenimiento" || e === "chapisteria") return "warn";
  if (e === "improductivo") return "crit";
  return "neutral";
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("es-PA")}`;
}

type Filtro = "todos" | "alerta" | "sin_gps" | "salida" | "sin_contrato" | "exceso_km";

export function ListaVehiculos({
  filas,
  topeKmMes,
}: {
  filas: FilaVehiculo[];
  topeKmMes: number;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return filas.filter((v) => {
      if (filtro === "sin_gps" && v.gps_id) return false;
      if (filtro === "sin_contrato" && v.contratoId) return false;
      if (filtro === "salida" && !v.salida) return false;
      if (filtro === "exceso_km" && !(v.kmMes != null && v.kmMes > topeKmMes)) return false;
      if (filtro === "alerta") {
        const mala =
          Boolean(v.alertaGps) ||
          v.salida?.gpsEstado === "desvio" ||
          v.salida?.gpsEstado === "sin_aval" ||
          (v.kmMes != null && v.kmMes > topeKmMes);
        if (!mala) return false;
      }
      if (!needle) return true;
      const hay = [
        v.numero,
        v.placa,
        v.marca,
        v.modelo,
        v.empresa,
        v.cliente,
        v.gps_id,
        v.panapass,
        v.salida?.destino,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [filas, q, filtro, topeKmMes]);

  const chips: { id: Filtro; label: string; n: number }[] = [
    { id: "todos", label: "Todos", n: filas.length },
    {
      id: "alerta",
      label: "Con alerta",
      n: filas.filter(
        (v) =>
          Boolean(v.alertaGps) ||
          v.salida?.gpsEstado === "desvio" ||
          v.salida?.gpsEstado === "sin_aval" ||
          (v.kmMes != null && v.kmMes > topeKmMes),
      ).length,
    },
    { id: "salida", label: "Salida hoy", n: filas.filter((v) => v.salida).length },
    { id: "exceso_km", label: `+${topeKmMes.toLocaleString("es-PA")} km`, n: filas.filter((v) => v.kmMes != null && v.kmMes > topeKmMes).length },
    { id: "sin_gps", label: "Sin GPS", n: filas.filter((v) => !v.gps_id).length },
    { id: "sin_contrato", label: "Sin contrato", n: filas.filter((v) => !v.contratoId).length },
  ];

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar carro, placa, cliente…"
          className="w-full max-w-md rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
        />
        <p className="text-sm text-muted">
          {visibles.length} de {filas.length}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFiltro(c.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filtro === c.id
                ? "bg-ink font-medium text-surface"
                : "text-muted ring-1 ring-line hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {c.label}
            <span className="ml-1.5 tabular-nums opacity-70">{c.n}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-wide text-muted">
              <th className="px-5 py-3">Carro</th>
              <th className="px-5 py-3">Placa</th>
              <th className="px-5 py-3">Vehículo</th>
              <th className="px-5 py-3">Arrendatario</th>
              <th className="px-5 py-3">Km</th>
              <th className="px-5 py-3">Km mes</th>
              <th className="px-5 py-3">GPS</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Hoy</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((v) => {
              const nombre = [v.marca, v.modelo].filter(Boolean).join(" ");
              const exceso = v.kmMes != null && v.kmMes > topeKmMes;
              return (
                <tr key={v.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                  <td className="px-5 py-3 font-medium tabular-nums">
                    {v.empresa ? `${v.empresa} · ` : ""}
                    {v.numero}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted">{v.placa ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">
                    {nombre || "—"}
                    {v.anio != null ? <span className="text-faint"> · {v.anio}</span> : null}
                  </td>
                  <td className="px-5 py-3">
                    {v.cliente ? (
                      <div>
                        <p className="font-medium">{v.cliente}</p>
                        {v.letra != null && (
                          <p className="text-xs text-muted">Letra {money(v.letra)}/día</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">Libre</span>
                    )}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-muted">
                    {v.km_actual != null ? v.km_actual.toLocaleString("es-PA") : "—"}
                  </td>
                  <td className={`px-5 py-3 tabular-nums ${exceso ? "font-medium text-rojo" : "text-muted"}`}>
                    {v.kmMes != null ? Math.round(v.kmMes).toLocaleString("es-PA") : "—"}
                    {exceso ? (
                      <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-rojo">
                        sobre {topeKmMes.toLocaleString("es-PA")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    {!v.gps_id ? (
                      <StatusChip tone="neutral">Sin amarre</StatusChip>
                    ) : (
                      <div className="space-y-1">
                        <Link
                          href="/cartera/rastreo"
                          className="font-mono text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                        >
                          {v.gps_id}
                        </Link>
                        {v.alertaGps === "exceso_km_dia" && (
                          <StatusChip tone="crit">+350 km hoy</StatusChip>
                        )}
                        {v.alertaGps === "sin_recorrido" && (
                          <StatusChip tone="warn">Sin recorrido</StatusChip>
                        )}
                        {v.kmHoy != null && !v.alertaGps && (
                          <p className="text-[11px] text-muted">{Math.round(v.kmHoy)} km hoy</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusChip tone={estadoTone(v.estado)}>{ESTADOS[v.estado] ?? v.estado}</StatusChip>
                  </td>
                  <td className="px-5 py-3">
                    <HoyChip v={v} />
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-muted">
                  Nada calza con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HoyChip({ v }: { v: FilaVehiculo }) {
  const s = v.salida;
  if (!s) return <span className="text-muted">—</span>;

  const tone =
    s.gpsEstado === "desvio" || s.gpsEstado === "sin_aval"
      ? "crit"
      : s.fueraTabla || s.estadoPago === "pendiente" || (s.fechaHasta && s.fecha && s.fechaHasta > s.fecha)
        ? "warn"
        : "azul";

  const bits = [
    `Salida ${s.destino}`,
    s.fechaHasta && s.fecha && s.fechaHasta > s.fecha ? `${s.fecha.slice(5)}–${s.fechaHasta.slice(5)}` : null,
    s.fueraTabla ? "fuera de tabla" : null,
    s.estadoAval !== "autorizada" ? "sin aval" : null,
    s.estadoPago === "pendiente" ? "por conciliar" : null,
    s.gpsEstado === "ok" ? "GPS ok" : null,
    s.gpsEstado === "desvio" ? "GPS no calza" : null,
    s.gpsEstado === "sin_aval" ? "interior sin aval" : null,
  ].filter(Boolean);

  return <StatusChip tone={tone}>{bits.join(" · ")}</StatusChip>;
}
