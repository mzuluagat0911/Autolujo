"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/kit";
import {
  cargarHistorialFecha,
  cargarSerieGps,
  vincularPorPlaca,
  type TableroRastreo,
} from "./actions";
import type { FilaHistorialGps, PuntoSerie } from "@/lib/gps/historico";
import type { FilaRastreo } from "@/lib/gps/vincular";
import {
  estadoGps,
  estadoLabel,
  etiquetaHash,
  formatFechaGps,
  formatHoraCarga,
  tonoEstado,
} from "@/lib/gps/ui";
import { MapaFlota } from "./mapa-flota";

function osmEmbed(lat: number, lng: number): string {
  const d = 0.018;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

const TABS = [
  { id: "mapa" as const, label: "Mapa flota" },
  { id: "ahora" as const, label: "Lista" },
  { id: "historico" as const, label: "Histórico" },
];

export function TableroRastreo({
  inicial,
  resaltarCarro,
}: {
  inicial: TableroRastreo;
  resaltarCarro?: string | null;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<"mapa" | "ahora" | "historico">("mapa");
  const selInicial = useMemo(() => {
    if (resaltarCarro) {
      const key = resaltarCarro.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const hit = inicial.filas.find((f) => {
        const carro = (f.carro ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        return carro === key || carro.endsWith(key) || carro.includes(key);
      });
      if (hit) return hit.id_dispositivo;
    }
    return inicial.filas[0]?.id_dispositivo ?? null;
  }, [inicial.filas, resaltarCarro]);
  const [sel, setSel] = useState<string | null>(selInicial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [fechaH, setFechaH] = useState(inicial.fechaHistorial);
  const [hist, setHist] = useState<FilaHistorialGps[]>(inicial.historial);
  const [selH, setSelH] = useState<string | null>(inicial.historial[0]?.id_dispositivo ?? null);
  const [serie, setSerie] = useState<PuntoSerie[]>([]);
  const [qLista, setQLista] = useState("");

  const fila = useMemo(
    () => inicial.filas.find((f) => f.id_dispositivo === sel) ?? inicial.filas[0] ?? null,
    [inicial.filas, sel],
  );

  const filasLista = useMemo(() => {
    const qn = qLista.trim().toLowerCase();
    const rows = [...inicial.filas].sort((a, b) =>
      (a.carro ?? etiquetaHash(a)).localeCompare(b.carro ?? etiquetaHash(b), "es", { numeric: true }),
    );
    if (!qn) return rows;
    return rows.filter((f) =>
      [f.carro, f.placa, f.nombre, f.direccion, etiquetaHash(f), f.id_dispositivo]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(qn),
    );
  }, [inicial.filas, qLista]);

  function vincular() {
    start(async () => {
      const r = await vincularPorPlaca();
      if (!r.ok) setMsg(r.error);
      else if (r.vinculados === 0) setMsg("Ninguna placa nueva para amarrar.");
      else {
        setMsg(`Amarré ${r.vinculados} carro${r.vinculados === 1 ? "" : "s"} (placa, etiqueta Diacor o histórico).`);
        router.refresh();
      }
    });
  }

  function cambiarFecha(f: string) {
    setFechaH(f);
    start(async () => {
      const rows = await cargarHistorialFecha(f);
      setHist(rows);
      setSelH(rows[0]?.id_dispositivo ?? null);
      setSerie([]);
    });
  }

  function pickHist(id: string) {
    setSelH(id);
    start(async () => {
      setSerie(await cargarSerieGps(id, fechaH));
    });
  }

  const filaH = hist.find((x) => x.id_dispositivo === selH) ?? hist[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Vistas de rastreo"
          className="inline-flex rounded-lg bg-surface-2 p-1 ring-1 ring-line"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={vista === t.id}
              onClick={() => setVista(t.id)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                vista === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {inicial.cargadoAt && (
          <p className="text-[11px] tabular-nums text-muted">
            Datos Diacor · {formatHoraCarga(inicial.cargadoAt)}
          </p>
        )}
      </div>

      {inicial.alertas.length > 0 && vista !== "historico" && (
        <div className="rounded-xl bg-ambar-wash px-4 py-3 ring-1 ring-ambar/20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ambar">
            Alertas de uso · {inicial.alertas.length}
          </p>
          <ul className="mt-2 space-y-1.5">
            {inicial.alertas.map((a) => (
              <li key={a.id} className="text-sm text-ink">
                <span className="font-medium">{a.titulo}</span>
                <span className="text-muted"> — {a.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {vista === "historico" ? (
        <Historico
          fecha={fechaH}
          filas={hist}
          fila={filaH}
          serie={serie}
          pending={pending}
          onFecha={cambiarFecha}
          onPick={pickHist}
        />
      ) : vista === "mapa" ? (
        <MapaFlota
          filas={inicial.filas}
          sel={sel}
          onPick={setSel}
          cargadoAt={inicial.cargadoAt}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl bg-surface p-3 ring-1 ring-line sm:flex-row sm:items-center">
            <div className="relative min-w-[12rem] flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3-3" />
                </svg>
              </span>
              <input
                value={qLista}
                onChange={(e) => setQLista(e.target.value)}
                placeholder="Buscar carro, placa o dirección…"
                className="w-full rounded-lg bg-paper py-2 pl-9 pr-3 text-sm ring-1 ring-line placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ink/20"
              />
            </div>
            <p className="text-sm text-muted sm:mr-auto">
              <span className="font-medium tabular-nums text-ink">{filasLista.length}</span> de{" "}
              {inicial.filas.length}
            </p>
            <button
              type="button"
              onClick={vincular}
              disabled={pending}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
            >
              {pending ? "Amarrando…" : "Amarrar GPS"}
            </button>
            <button
              type="button"
              onClick={() => {
                setVista("mapa");
              }}
              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Ver en mapa
            </button>
          </div>

          {msg && <p className="text-sm text-muted">{msg}</p>}
          {inicial.porVincular > 0 && (
            <p className="text-xs text-ambar">
              {inicial.porVincular} dispositivo{inicial.porVincular === 1 ? "" : "s"} calzan con la flota y
              aún no tienen gps_id. Usá “Amarrar GPS”.
            </p>
          )}

          {fila?.latitud != null && fila.longitud != null && (
            <MapaDetalle
              titulo={fila.carro ?? fila.nombre ?? fila.placa ?? fila.id_dispositivo}
              lat={fila.latitud}
              lng={fila.longitud}
              direccion={fila.direccion}
              estado={estadoGps(fila)}
              velocidad={fila.velocidad}
            />
          )}

          <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-3">Carro</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Vel.</th>
                  <th className="px-4 py-3">Última</th>
                  <th className="px-4 py-3">Dónde</th>
                  <th className="px-4 py-3">Diacor</th>
                </tr>
              </thead>
              <tbody>
                {filasLista.map((f) => (
                  <Fila
                    key={f.id_dispositivo}
                    f={f}
                    activa={f.id_dispositivo === (fila?.id_dispositivo ?? sel)}
                    onPick={() => setSel(f.id_dispositivo)}
                  />
                ))}
                {filasLista.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted">
                      {inicial.filas.length === 0
                        ? "Diacor no devolvió dispositivos en esta cuenta."
                        : "Ningún carro coincide con la búsqueda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Historico({
  fecha,
  filas,
  fila,
  serie,
  pending,
  onFecha,
  onPick,
}: {
  fecha: string;
  filas: FilaHistorialGps[];
  fila: FilaHistorialGps | null;
  serie: PuntoSerie[];
  pending: boolean;
  onFecha: (f: string) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-3 ring-1 ring-line sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Día</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => onFecha(e.target.value)}
            className="rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <p className="pb-1 text-sm text-muted sm:ml-2">
          {pending ? (
            "Cargando…"
          ) : (
            <>
              <span className="font-medium tabular-nums text-ink">{filas.length}</span> carros ese día.
              El mes suma km (tope 8.000).
            </>
          )}
        </p>
      </div>

      {fila?.latitud != null && fila.longitud != null && (
        <MapaDetalle
          titulo={fila.etiqueta}
          lat={fila.latitud}
          lng={fila.longitud}
          direccion={fila.direccion}
        />
      )}

      {serie.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
          <p className="border-b border-line px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Últimos 14 días · {fila?.etiqueta}
          </p>
          <div className="flex gap-1 overflow-x-auto px-3 py-3">
            {serie.map((s) => (
              <div
                key={s.fecha}
                className={`min-w-[3.25rem] rounded-lg px-2 py-2 text-center ${
                  s.alerta === "exceso_km_dia"
                    ? "bg-rojo-wash"
                    : s.alerta === "sin_recorrido"
                      ? "bg-ambar-wash"
                      : "bg-surface-2"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide text-faint">{s.fecha.slice(8)}</p>
                <p
                  className={`mt-0.5 text-sm font-medium tabular-nums ${
                    s.alerta === "exceso_km_dia"
                      ? "text-rojo"
                      : s.alerta === "sin_recorrido"
                        ? "text-ambar"
                        : "text-ink"
                  }`}
                >
                  {s.km == null ? "—" : Math.round(s.km)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-4 py-3">Carro</th>
              <th className="px-4 py-3">Km día</th>
              <th className="px-4 py-3">Km mes</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Dónde quedó</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={f.id_dispositivo}
                onClick={() => onPick(f.id_dispositivo)}
                className={`cursor-pointer border-b border-line last:border-0 ${
                  f.id_dispositivo === fila?.id_dispositivo ? "bg-surface-2" : "hover:bg-surface-2"
                }`}
              >
                <td className="px-4 py-3 font-medium">{f.etiqueta}</td>
                <td className="px-4 py-3 tabular-nums">
                  {f.km == null ? "—" : `${Math.round(f.km)} km`}
                </td>
                <td
                  className={`px-4 py-3 tabular-nums ${f.kmMes > 8000 ? "font-medium text-rojo" : "text-muted"}`}
                >
                  {Math.round(f.kmMes).toLocaleString("es-PA")}
                </td>
                <td className="px-4 py-3">
                  {f.alerta === "exceso_km_dia" && <StatusChip tone="crit">+350 km</StatusChip>}
                  {f.alerta === "sin_recorrido" && <StatusChip tone="warn">Sin recorrido</StatusChip>}
                  {!f.alerta && <StatusChip tone="neutral">Ok</StatusChip>}
                </td>
                <td className="max-w-[18rem] px-4 py-3 text-xs text-muted">
                  <span className="line-clamp-2">{f.direccion ?? "—"}</span>
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  Aún no hay histórico de ese día. El cron de GPS lo va llenando; en Carros podés forzar
                  “Actualizar km”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MapaDetalle({
  titulo,
  lat,
  lng,
  direccion,
  estado,
  velocidad,
}: {
  titulo: string;
  lat: number;
  lng: number;
  direccion: string | null;
  estado?: ReturnType<typeof estadoGps>;
  velocidad?: number | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
      <iframe title={`Mapa ${titulo}`} src={osmEmbed(lat, lng)} className="h-56 w-full border-0 sm:h-64" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink">{titulo}</p>
            {estado && <StatusChip tone={tonoEstado(estado)}>{estadoLabel(estado)}</StatusChip>}
            {velocidad != null && (
              <span className="text-xs tabular-nums text-muted">{Math.round(velocidad)} km/h</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">{direccion ?? "Sin dirección"}</p>
        </div>
        <a
          href={mapsUrl(lat, lng)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
        >
          Maps
        </a>
      </div>
    </div>
  );
}

function Fila({ f, activa, onPick }: { f: FilaRastreo; activa: boolean; onPick: () => void }) {
  const e = estadoGps(f);
  return (
    <tr
      onClick={onPick}
      className={`cursor-pointer border-b border-line last:border-0 ${activa ? "bg-surface-2" : "hover:bg-surface-2"}`}
    >
      <td className="px-4 py-3">
        <p className="font-medium tabular-nums">{f.carro ?? "Sin vincular"}</p>
        <p className="text-xs text-muted">{f.placa ?? "sin placa"}</p>
      </td>
      <td className="px-4 py-3">
        <StatusChip tone={tonoEstado(e)}>{estadoLabel(e)}</StatusChip>
        {f.encendido === true && <p className="mt-1 text-[11px] text-muted">Encendido</p>}
        {f.encendido === false && <p className="mt-1 text-[11px] text-muted">Apagado</p>}
      </td>
      <td className="px-4 py-3 tabular-nums text-muted">
        {f.velocidad != null ? `${Math.round(f.velocidad)}` : "—"}
      </td>
      <td className="px-4 py-3 text-xs tabular-nums text-muted">{formatFechaGps(f.fecha)}</td>
      <td className="max-w-[16rem] px-4 py-3 text-xs text-muted">
        <span className="line-clamp-2">{f.direccion ?? "—"}</span>
      </td>
      <td className="px-4 py-3 text-muted">
        <p className="text-xs">{f.nombre ?? "—"}</p>
        <p className="font-mono text-[10px] text-faint">{f.id_dispositivo}</p>
      </td>
    </tr>
  );
}
