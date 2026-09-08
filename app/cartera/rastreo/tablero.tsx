"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/kit";
import {
  cargarHistorialFecha,
  cargarSerieGps,
  cargarKmDelMes,
  revisarRecorridoHoy,
  vincularPorPlaca,
  type TableroRastreo,
} from "./actions";
import type { FilaHistorialGps, PuntoSerie } from "@/lib/gps/historico";
import type { FilaRastreo } from "@/lib/gps/vincular";

function osmEmbed(lat: number, lng: number): string {
  const d = 0.018;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function TableroRastreo({
  inicial,
  resaltarCarro,
}: {
  inicial: TableroRastreo;
  resaltarCarro?: string | null;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<"ahora" | "historico">("ahora");
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

  const fila = useMemo(
    () => inicial.filas.find((f) => f.id_dispositivo === sel) ?? inicial.filas[0] ?? null,
    [inicial.filas, sel],
  );

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
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setVista("ahora")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${vista === "ahora" ? "bg-ink text-white" : "text-ink ring-1 ring-line hover:bg-surface-2"}`}
        >
          Ahora
        </button>
        <button
          type="button"
          onClick={() => setVista("historico")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${vista === "historico" ? "bg-ink text-white" : "text-ink ring-1 ring-line hover:bg-surface-2"}`}
        >
          Histórico
        </button>
      </div>

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
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={vincular}
              disabled={pending}
              className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {pending ? "Vinculando…" : "Amarrar GPS"}
            </button>
            <button
              type="button"
              onClick={() => {
                start(async () => {
                  const r = await revisarRecorridoHoy();
                  if (!r.ok) setMsg(r.error);
                  else {
                    setMsg(
                      `Revisé el día: ${r.excesos} con más de 350 km, ${r.parados} sin recorrido (${r.porOdometro} por odómetro, ${r.porRecorrido} pedí a Diacor).`,
                    );
                    router.refresh();
                  }
                });
              }}
              disabled={pending}
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
            >
              {pending ? "Revisando…" : "Revisar km de hoy"}
            </button>
            <button
              type="button"
              onClick={() => {
                start(async () => {
                  setMsg("Pedí a Diacor el km de todo septiembre… puede tardar un par de minutos.");
                  const r = await cargarKmDelMes();
                  if (!r.ok) setMsg(r.error);
                  else {
                    setMsg(
                      `Cargué ${r.desde} → ${r.hasta}: ${r.guardados} lecturas, ${Math.round(r.kmTotal).toLocaleString("es-PA")} km en total (${r.errores} errores).`,
                    );
                    router.refresh();
                  }
                });
              }}
              disabled={pending}
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
            >
              {pending ? "Cargando mes…" : "Cargar km del mes"}
            </button>
            <p className="text-xs text-muted">
              “Del mes” pide a Diacor el recorrido día por día (1 → hoy) y llena la columna Km mes.
            </p>
          </div>
          {msg && <p className="text-sm text-muted">{msg}</p>}

          {inicial.alertas.length > 0 && (
            <div className="rounded-xl bg-ambar-wash px-4 py-3 ring-1 ring-ambar/20">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ambar">Alertas de uso</p>
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

          {fila?.latitud != null && fila.longitud != null ? (
            <Mapa
              titulo={fila.carro ?? fila.nombre ?? fila.placa ?? fila.id_dispositivo}
              lat={fila.latitud}
              lng={fila.longitud}
              direccion={fila.direccion}
            />
          ) : (
            <p className="rounded-xl bg-surface px-4 py-8 text-center text-sm text-muted ring-1 ring-line">
              Seleccione un carro con coordenadas para ver el mapa.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl ring-1 ring-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-3">Carro</th>
                  <th className="px-4 py-3">Diacor</th>
                  <th className="px-4 py-3">Señal</th>
                  <th className="px-4 py-3">Vel.</th>
                  <th className="px-4 py-3">Última</th>
                  <th className="px-4 py-3">Dónde</th>
                </tr>
              </thead>
              <tbody>
                {inicial.filas.map((f) => (
                  <Fila
                    key={f.id_dispositivo}
                    f={f}
                    activa={f.id_dispositivo === (fila?.id_dispositivo ?? sel)}
                    onPick={() => setSel(f.id_dispositivo)}
                  />
                ))}
                {inicial.filas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      Diacor no devolvió dispositivos en esta cuenta.
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Día</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => onFecha(e.target.value)}
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <p className="text-xs text-muted">
          {pending ? "Cargando…" : `${filas.length} carros ese día. El mes suma el km para el tope de 8.000.`}
        </p>
      </div>

      {fila?.latitud != null && fila.longitud != null && (
        <Mapa titulo={fila.etiqueta} lat={fila.latitud} lng={fila.longitud} direccion={fila.direccion} />
      )}

      {serie.length > 0 && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <p className="border-b border-line px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Últimos días · {fila?.etiqueta}
          </p>
          <div className="flex gap-2 overflow-x-auto px-4 py-3">
            {serie.map((s) => (
              <div key={s.fecha} className="min-w-[4.5rem] text-center">
                <p className="text-[10px] uppercase tracking-wide text-faint">{s.fecha.slice(8)}</p>
                <p className={`text-sm tabular-nums ${s.alerta === "exceso_km_dia" ? "text-rojo" : s.alerta === "sin_recorrido" ? "text-ambar" : "text-ink"}`}>
                  {s.km == null ? "—" : Math.round(s.km)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl ring-1 ring-line">
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
                className={`cursor-pointer border-b border-line last:border-0 ${f.id_dispositivo === fila?.id_dispositivo ? "bg-surface-2" : "hover:bg-surface-2"}`}
              >
                <td className="px-4 py-3 font-medium">{f.etiqueta}</td>
                <td className="px-4 py-3 tabular-nums">{f.km == null ? "—" : `${Math.round(f.km)} km`}</td>
                <td className={`px-4 py-3 tabular-nums ${f.kmMes > 8000 ? "text-rojo" : "text-muted"}`}>
                  {Math.round(f.kmMes)}
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
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Aún no hay histórico de ese día. Pulse “Revisar km de hoy” o espere el cron.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Mapa({ titulo, lat, lng, direccion }: { titulo: string; lat: number; lng: number; direccion: string | null }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-line">
      <iframe title={`Mapa ${titulo}`} src={osmEmbed(lat, lng)} className="h-72 w-full border-0" />
      <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
        <p className="min-w-0 truncate text-sm text-muted">{direccion ?? "Sin dirección"}</p>
        <a
          href={mapsUrl(lat, lng)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-sm font-medium text-ink underline-offset-2 hover:underline"
        >
          Abrir mapa
        </a>
      </div>
    </div>
  );
}

function Fila({ f, activa, onPick }: { f: FilaRastreo; activa: boolean; onPick: () => void }) {
  return (
    <tr
      onClick={onPick}
      className={`cursor-pointer border-b border-line last:border-0 ${activa ? "bg-surface-2" : "hover:bg-surface-2"}`}
    >
      <td className="px-4 py-3">
        <p className="font-medium tabular-nums">{f.carro ?? "Sin vincular"}</p>
        <p className="text-xs text-muted">{f.placa ?? "sin placa"}</p>
      </td>
      <td className="px-4 py-3 text-muted">
        <p>{f.nombre ?? "—"}</p>
        <p className="font-mono text-[11px]">{f.id_dispositivo}</p>
      </td>
      <td className="px-4 py-3">
        <StatusChip tone={f.gps_en_linea ? "good" : "neutral"}>{f.gps_en_linea ? "En línea" : "Sin señal"}</StatusChip>
        {f.encendido === true && <p className="mt-1 text-[11px] text-muted">Encendido</p>}
        {f.encendido === false && <p className="mt-1 text-[11px] text-muted">Apagado</p>}
      </td>
      <td className="px-4 py-3 tabular-nums text-muted">
        {f.velocidad != null ? `${Math.round(f.velocidad)} km/h` : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted">{f.fecha ?? "—"}</td>
      <td className="max-w-[16rem] px-4 py-3 text-xs text-muted">
        <span className="line-clamp-2">{f.direccion ?? "—"}</span>
      </td>
    </tr>
  );
}
