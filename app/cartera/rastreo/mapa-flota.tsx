"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { StatusChip } from "@/components/kit";
import { destinoTarifaCercano, etiquetaZona } from "@/lib/cartera/salidas-geo";
import type { FilaRastreo } from "@/lib/gps/vincular";
import {
  colorEstado,
  estadoGps,
  estadoLabel,
  etiquetaHash,
  formatFechaGps,
  formatHoraCarga,
  prefijoFlota,
  tonoEstado,
  type EstadoFiltro,
  type FlotaFiltro,
} from "@/lib/gps/ui";

const PANAMA = { lat: 8.55, lng: -80.1, zoom: 8 };

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function coincideBusqueda(f: FilaRastreo, q: string): boolean {
  if (!q) return true;
  const hay = [f.carro, f.placa, f.nombre, f.direccion, etiquetaHash(f), f.id_dispositivo]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function MapaFlota({
  filas,
  sel,
  onPick,
  cargadoAt,
}: {
  filas: FilaRastreo[];
  sel: string | null;
  onPick: (id: string) => void;
  cargadoAt?: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const fitKeyRef = useRef("");
  const prevSelRef = useRef<string | null>(null);
  const [listo, setListo] = useState(false);
  const [flota, setFlota] = useState<FlotaFiltro>("todas");
  const [estado, setEstado] = useState<EstadoFiltro>("todos");
  const [q, setQ] = useState("");
  const [copiado, setCopiado] = useState(false);

  const conCoords = useMemo(
    () =>
      filas.filter(
        (f) =>
          f.latitud != null &&
          f.longitud != null &&
          Number.isFinite(f.latitud) &&
          Number.isFinite(f.longitud),
      ),
    [filas],
  );

  const visibles = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return conCoords
      .filter((f) => {
        if (!coincideBusqueda(f, qn)) return false;
        if (flota !== "todas" && prefijoFlota(f) !== flota) return false;
        const e = estadoGps(f);
        if (estado === "movimiento" && e !== "movimiento") return false;
        if (estado === "detenido" && e !== "detenido") return false;
        if (estado === "sin_senal" && e !== "sin_senal") return false;
        return true;
      })
      .sort((a, b) =>
        (a.carro ?? etiquetaHash(a)).localeCompare(b.carro ?? etiquetaHash(b), "es", {
          numeric: true,
        }),
      );
  }, [conCoords, flota, estado, q]);

  const stats = useMemo(() => {
    let mov = 0;
    let det = 0;
    let sin = 0;
    for (const f of conCoords) {
      const e = estadoGps(f);
      if (e === "sin_senal") sin += 1;
      else if (e === "movimiento") mov += 1;
      else det += 1;
    }
    return { mov, det, sin, total: conCoords.length };
  }, [conCoords]);

  const destinos = useMemo(() => {
    const rows: { id: string; carro: string; destino: string }[] = [];
    for (const f of conCoords) {
      const d = destinoTarifaCercano(f.latitud!, f.longitud!);
      if (!d) continue;
      rows.push({
        id: f.id_dispositivo,
        carro: f.carro ?? etiquetaHash(f),
        destino: d.nombre,
      });
    }
    return rows.sort((a, b) => a.carro.localeCompare(b.carro, "es"));
  }, [conCoords]);

  const textoInforme = useMemo(() => {
    const ahora = new Date();
    const hora = ahora.toLocaleString("es-PA", {
      timeZone: "America/Panama",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    const lineas = [
      "Buenos días",
      `Actualización GPS — ${hora}`,
      "",
      `En mapa: ${stats.total} · En movimiento: ${stats.mov} · Detenidos: ${stats.det} · Sin señal: ${stats.sin}`,
    ];
    if (destinos.length > 0) {
      lineas.push("", "Destinos (tarifa / interior):");
      for (const d of destinos) lineas.push(`· ${d.carro} — ${d.destino}`);
    }
    lineas.push("", "Detalle:");
    for (const f of [...conCoords].sort((a, b) =>
      (a.carro ?? etiquetaHash(a)).localeCompare(b.carro ?? etiquetaHash(b), "es", { numeric: true }),
    )) {
      const e = estadoGps(f);
      const vel = Math.round(f.velocidad ?? 0);
      const dest = destinoTarifaCercano(f.latitud!, f.longitud!);
      const zona = etiquetaZona(f.latitud, f.longitud);
      const extra = dest ? ` · ${dest.nombre}` : zona ? ` · ${zona}` : "";
      lineas.push(`· ${etiquetaHash(f)} · ${estadoLabel(e)} · ${vel} Km/h${extra}`);
    }
    return lineas.join("\n");
  }, [conCoords, destinos, stats]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!host.current || mapRef.current) return;
      const L = await import("leaflet");
      // @ts-expect-error CSS side-effect
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !host.current) return;

      const map = L.map(host.current, {
        center: [PANAMA.lat, PANAMA.lng],
        zoom: PANAMA.zoom,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setListo(true);
    })();
    return () => {
      cancelled = true;
      setListo(false);
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!listo || !map || !layer) return;
      const L = await import("leaflet");
      if (cancelled) return;

      layer.clearLayers();
      const bounds: [number, number][] = [];

      for (const f of visibles) {
        const lat = f.latitud!;
        const lng = f.longitud!;
        bounds.push([lat, lng]);
        const e = estadoGps(f);
        const color = colorEstado(e);
        const activa = f.id_dispositivo === sel;
        const vel = Math.round(f.velocidad ?? 0);
        const html = `<div class="al-pin${activa ? " al-pin-on" : ""}">
          <div class="al-pin-dot" style="background:${color}"></div>
          <div class="al-pin-label" style="background:${color}">${escapar(etiquetaHash(f))}<span class="al-pin-vel">${vel}</span></div>
        </div>`;
        const icon = L.divIcon({
          className: "al-marker",
          html,
          iconSize: [72, 34],
          iconAnchor: [36, 10],
        });
        const m = L.marker([lat, lng], {
          icon,
          zIndexOffset: activa ? 900 : e === "movimiento" ? 400 : 200,
        });
        m.on("click", () => onPick(f.id_dispositivo));
        m.addTo(layer);
      }

      const fitKey = `${flota}|${estado}|${q}|${visibles.map((v) => v.id_dispositivo).join(",")}`;
      if (fitKey !== fitKeyRef.current) {
        fitKeyRef.current = fitKey;
        if (bounds.length === 1) map.setView(bounds[0]!, 14);
        else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
        else map.setView([PANAMA.lat, PANAMA.lng], PANAMA.zoom);
      } else if (sel && sel !== prevSelRef.current) {
        const selFila = visibles.find((f) => f.id_dispositivo === sel);
        if (selFila?.latitud != null && selFila.longitud != null) {
          map.panTo([selFila.latitud, selFila.longitud], { animate: true });
        }
      }
      prevSelRef.current = sel;
    })();
    return () => {
      cancelled = true;
    };
  }, [listo, visibles, sel, onPick, flota, estado, q]);

  async function copiarInforme() {
    try {
      await navigator.clipboard.writeText(textoInforme);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  function actualizar() {
    startRefresh(() => {
      router.refresh();
    });
  }

  const filaSel = filas.find((f) => f.id_dispositivo === sel) ?? null;
  const estadoSel = filaSel ? estadoGps(filaSel) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-3 ring-1 ring-line sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[12rem] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
            </svg>
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar carro o placa…"
            className="w-full rounded-lg bg-paper py-2 pl-9 pr-3 text-sm ring-1 ring-line placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(["todas", "AL", "KW", "GD"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFlota(k)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${flota === k ? "bg-ink text-white" : "text-muted ring-1 ring-line hover:bg-surface-2 hover:text-ink"}`}
            >
              {k === "todas" ? "Todas" : k}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["todos", "Todos"],
              ["movimiento", "Movimiento"],
              ["detenido", "Detenidos"],
              ["sin_senal", "Sin señal"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setEstado(k)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${estado === k ? "bg-ink text-white" : "text-muted ring-1 ring-line hover:bg-surface-2 hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {cargadoAt && (
            <p className="text-[11px] tabular-nums text-muted">
              Diacor · {formatHoraCarga(cargadoAt)}
            </p>
          )}
          <button
            type="button"
            onClick={actualizar}
            disabled={refreshing}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
          >
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
          <button
            type="button"
            onClick={copiarInforme}
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-black"
          >
            {copiado ? "Copiado" : "Copiar informe"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted">
          Visibles <span className="font-medium tabular-nums text-ink">{visibles.length}</span>
          <span className="text-faint"> / {stats.total}</span>
        </span>
        <span className="text-verde">
          Movimiento <span className="font-medium tabular-nums">{stats.mov}</span>
        </span>
        <span className="text-rojo">
          Detenidos <span className="font-medium tabular-nums">{stats.det}</span>
        </span>
        <span className="text-muted">
          Sin señal <span className="font-medium tabular-nums text-ink">{stats.sin}</span>
        </span>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-verde" /> Movimiento
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rojo" /> Detenido
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gris" /> Sin señal
          </span>
        </span>
      </div>

      {destinos.length > 0 && (
        <div className="rounded-xl bg-ambar-wash px-4 py-3 ring-1 ring-ambar/20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ambar">
            En destino con tarifa · {destinos.length}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {destinos.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onPick(d.id)}
                  className="text-left font-medium text-ink hover:underline"
                >
                  {d.carro}
                </button>
                <span className="text-muted"> — {d.destino}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-xl ring-1 ring-line lg:grid lg:grid-cols-[minmax(240px,280px)_1fr]">
        <div className="max-h-[min(70vh,640px)] overflow-y-auto border-b border-line bg-surface lg:border-b-0 lg:border-r">
          <p className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Flota
          </p>
          {visibles.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Ningún carro con esos filtros.</p>
          ) : (
            <ul>
              {visibles.map((f) => {
                const e = estadoGps(f);
                const activa = f.id_dispositivo === sel;
                return (
                  <li key={f.id_dispositivo}>
                    <button
                      type="button"
                      onClick={() => onPick(f.id_dispositivo)}
                      className={`flex w-full items-start gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 ${activa ? "bg-surface-2" : "hover:bg-surface-2"}`}
                    >
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: colorEstado(e) }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium tabular-nums text-ink">
                            {f.carro ?? etiquetaHash(f)}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">
                            {Math.round(f.velocidad ?? 0)} km/h
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted">
                          {estadoLabel(e)}
                          {f.direccion ? ` · ${f.direccion}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="relative min-h-[420px] bg-surface-2">
          <style>{`
            .al-marker { background: transparent !important; border: none !important; }
            .al-pin { display: flex; flex-direction: column; align-items: center; }
            .al-pin-dot {
              width: 10px; height: 10px; border-radius: 9999px;
              border: 2px solid #fff; box-shadow: 0 1px 2px rgba(0,0,0,.35);
            }
            .al-pin-on .al-pin-dot { outline: 2px solid #0A0A0A; outline-offset: 1px; }
            .al-pin-label {
              margin-top: 2px; padding: 1px 6px; border-radius: 4px;
              font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
              color: #fff; white-space: nowrap; line-height: 1.4;
              box-shadow: 0 1px 2px rgba(0,0,0,.25);
              font-family: ui-sans-serif, system-ui, sans-serif;
            }
            .al-pin-vel {
              margin-left: 4px; font-weight: 500; opacity: 0.9;
            }
            .al-pin-on .al-pin-label { box-shadow: 0 0 0 1px #0A0A0A, 0 1px 2px rgba(0,0,0,.25); }
          `}</style>
          <div ref={host} className="h-[min(70vh,640px)] min-h-[420px] w-full" />
          {!listo && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-2/80 text-sm text-muted">
              Cargando mapa…
            </div>
          )}
        </div>
      </div>

      {filaSel && estadoSel && (
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tabular-nums text-ink">
                {filaSel.carro ?? etiquetaHash(filaSel)}
              </p>
              <StatusChip tone={tonoEstado(estadoSel)}>{estadoLabel(estadoSel)}</StatusChip>
              <span className="text-sm tabular-nums text-muted">
                {Math.round(filaSel.velocidad ?? 0)} km/h
              </span>
              {filaSel.encendido === true && (
                <span className="text-[11px] text-muted">Encendido</span>
              )}
              {filaSel.encendido === false && (
                <span className="text-[11px] text-muted">Apagado</span>
              )}
            </div>
            <p className="text-xs text-muted">
              {filaSel.direccion ?? "Sin dirección"}
              {etiquetaZona(filaSel.latitud, filaSel.longitud)
                ? ` · ${etiquetaZona(filaSel.latitud, filaSel.longitud)}`
                : ""}
            </p>
            <p className="text-[11px] text-faint">
              Última señal {formatFechaGps(filaSel.fecha)}
              {filaSel.placa ? ` · Placa ${filaSel.placa}` : ""}
            </p>
          </div>
          {filaSel.latitud != null && filaSel.longitud != null && (
            <a
              href={`https://www.google.com/maps?q=${filaSel.latitud},${filaSel.longitud}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
            >
              Abrir en Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}
