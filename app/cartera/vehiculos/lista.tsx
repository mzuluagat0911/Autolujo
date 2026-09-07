"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/kit";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import { guardarEdicionMasiva, completarPlacasDesdeDiacor } from "./actions";

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
  ultimoVistoAt: string | null;
  ultimoVistoZona: string | null;
  ultimoVistoDir: string | null;
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

function fmtVisto(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-PA", {
      timeZone: "America/Panama",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

type Filtro = "todos" | "alerta" | "sin_gps" | "salida" | "sin_contrato" | "exceso_km";

type Draft = { placa: string; gps_id: string; marca: string; modelo: string; anio: string };

export function ListaVehiculos({
  filas,
  topeKmMes,
}: {
  filas: FilaVehiculo[];
  topeKmMes: number;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editando, setEditando] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
        v.ultimoVistoZona,
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
    {
      id: "exceso_km",
      label: `+${topeKmMes.toLocaleString("es-PA")} km`,
      n: filas.filter((v) => v.kmMes != null && v.kmMes > topeKmMes).length,
    },
    { id: "sin_gps", label: "Sin GPS", n: filas.filter((v) => !v.gps_id).length },
    { id: "sin_contrato", label: "Sin contrato", n: filas.filter((v) => !v.contratoId).length },
  ];

  function entrarEdicion() {
    const d: Record<string, Draft> = {};
    for (const v of filas) {
      d[v.id] = {
        placa: v.placa ?? "",
        gps_id: v.gps_id ?? "",
        marca: v.marca ?? "",
        modelo: v.modelo ?? "",
        anio: v.anio != null ? String(v.anio) : "",
      };
    }
    setDrafts(d);
    setEditando(true);
    setMsg(null);
  }

  function guardar() {
    start(async () => {
      const cambios = filas
        .map((v) => {
          const d = drafts[v.id];
          if (!d) return null;
          const placa = d.placa.trim().toUpperCase() || null;
          const gps = d.gps_id.trim() || null;
          const marca = d.marca.trim() || null;
          const modelo = d.modelo.trim() || null;
          const anioRaw = d.anio.trim();
          const anio = anioRaw === "" ? null : Number(anioRaw);
          const anioOk = anio != null && Number.isFinite(anio) ? anio : null;
          if (
            placa === (v.placa ?? null) &&
            gps === (v.gps_id ?? null) &&
            marca === (v.marca ?? null) &&
            modelo === (v.modelo ?? null) &&
            anioOk === (v.anio ?? null)
          ) {
            return null;
          }
          return { id: v.id, placa, gps_id: gps, marca, modelo, anio: anioOk };
        })
        .filter(Boolean) as {
        id: string;
        placa: string | null;
        gps_id: string | null;
        marca: string | null;
        modelo: string | null;
        anio: number | null;
      }[];

      if (cambios.length === 0) {
        setMsg("No hay cambios.");
        setEditando(false);
        return;
      }
      const r = await guardarEdicionMasiva(cambios);
      setMsg(r.msg);
      if (r.ok) setEditando(false);
    });
  }

  function placasDiacor() {
    start(async () => {
      const r = await completarPlacasDesdeDiacor();
      setMsg(r.msg);
    });
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar carro, placa, cliente, zona…"
          className="w-full max-w-md rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
        />
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted">
            {visibles.length} de {filas.length}
          </p>
          {!editando ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={placasDiacor}
                className="rounded-lg px-3 py-2 text-sm text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
              >
                {pending ? "…" : "Placas desde Diacor"}
              </button>
              <button
                type="button"
                onClick={entrarEdicion}
                className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface hover:bg-black"
              >
                Editar ficha
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={guardar}
                className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface hover:bg-black disabled:opacity-50"
              >
                {pending ? "Guardando…" : "Guardar cambios"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditando(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted ring-1 ring-line hover:bg-surface-2"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      {msg && <p className="text-sm text-muted">{msg}</p>}

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
              <th className="px-5 py-3">Último visto</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Hoy</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((v) => {
              const nombre = [v.marca, v.modelo].filter(Boolean).join(" ");
              const exceso = v.kmMes != null && v.kmMes > topeKmMes;
              const d = drafts[v.id] ?? {
                placa: v.placa ?? "",
                gps_id: v.gps_id ?? "",
                marca: v.marca ?? "",
                modelo: v.modelo ?? "",
                anio: v.anio != null ? String(v.anio) : "",
              };
              return (
                <tr key={v.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                  <td className="px-5 py-3 font-medium tabular-nums">
                    {v.empresa ? `${siglaEmpresa(v.empresa)} · ` : ""}
                    {v.numero}
                  </td>
                  <td className="px-5 py-3">
                    {editando ? (
                      <input
                        value={d.placa}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [v.id]: { ...d, placa: e.target.value },
                          }))
                        }
                        className="w-24 rounded-md bg-paper px-2 py-1 font-mono text-xs ring-1 ring-line"
                        placeholder="AB1234"
                      />
                    ) : (
                      <span className="font-mono text-xs text-muted">{v.placa ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {editando ? (
                      <div className="flex flex-wrap gap-1">
                        <input
                          value={d.marca}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [v.id]: { ...d, marca: e.target.value } }))
                          }
                          className="w-20 rounded-md bg-paper px-2 py-1 text-xs ring-1 ring-line"
                          placeholder="Marca"
                        />
                        <input
                          value={d.modelo}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [v.id]: { ...d, modelo: e.target.value } }))
                          }
                          className="w-24 rounded-md bg-paper px-2 py-1 text-xs ring-1 ring-line"
                          placeholder="Modelo"
                        />
                        <input
                          value={d.anio}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [v.id]: { ...d, anio: e.target.value } }))
                          }
                          className="w-14 rounded-md bg-paper px-2 py-1 text-xs ring-1 ring-line"
                          placeholder="Año"
                        />
                      </div>
                    ) : (
                      <>
                        {nombre || "—"}
                        {v.anio != null ? <span className="text-faint"> · {v.anio}</span> : null}
                      </>
                    )}
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
                    {editando ? (
                      <input
                        value={d.gps_id}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [v.id]: { ...d, gps_id: e.target.value },
                          }))
                        }
                        className="w-28 rounded-md bg-paper px-2 py-1 font-mono text-xs ring-1 ring-line"
                        placeholder="ID Diacor"
                      />
                    ) : !v.gps_id ? (
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
                    {v.ultimoVistoAt ? (
                      <div>
                        <p className="tabular-nums text-xs text-ink">{fmtVisto(v.ultimoVistoAt)}</p>
                        <p className="text-xs text-muted">{v.ultimoVistoZona ?? "—"}</p>
                        {v.ultimoVistoDir && (
                          <p className="max-w-[12rem] truncate text-[11px] text-faint" title={v.ultimoVistoDir}>
                            {v.ultimoVistoDir}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
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
                <td colSpan={10} className="px-5 py-10 text-center text-muted">
                  Nada calza con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Carros no llama a Diacor en cada visita: el histórico y el amarre viven acá; el mapa en vivo en{" "}
        <Link href="/cartera/rastreo" className="underline-offset-2 hover:underline">
          Rastreo
        </Link>
        . Marca/modelo/año se cargan desde la Hoja de vida (script) o con «Editar ficha».
      </p>
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
