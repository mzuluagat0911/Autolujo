"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusChip, FiltersBar, EmptyState } from "@/components/kit";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import {
  guardarEdicionMasiva,
  guardarIdentidadCarro,
  completarPlacasDesdeDiacor,
  actualizarKmHoy,
  rellenarKmDelMes,
} from "./actions";

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
  clienteId: string | null;
  celular: string | null;
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
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editando, setEditando] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [elegido, setElegido] = useState<FilaVehiculo | null>(null);
  const [pending, start] = useTransition();

  const sinKmMes = useMemo(
    () => filas.filter((v) => v.gps_id && (v.kmMes == null || v.kmMes === 0)).length,
    [filas],
  );

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
      if (r.ok) router.refresh();
    });
  }

  function syncKmHoy() {
    start(async () => {
      const r = await actualizarKmHoy();
      setMsg(r.msg);
      if (r.ok) router.refresh();
    });
  }

  function syncKmMes() {
    start(async () => {
      setMsg("Rellenando el mes desde Diacor… puede tardar un minuto.");
      const r = await rellenarKmDelMes();
      setMsg(r.msg);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="mt-8 space-y-4">
      <FiltersBar
        search={{ value: q, onChange: setQ }}
        searchPlaceholder="Buscar carro, placa, cliente, zona…"
        chips={chips.map((c) => ({ id: c.id, label: c.label, count: c.n }))}
        activeChip={filtro}
        onChip={(id) => setFiltro(id as typeof filtro)}
        actions={
          <>
            <p className="text-sm text-muted">
              <span className="font-medium tabular-nums text-ink">{visibles.length}</span> de {filas.length}
            </p>
            {!editando ? (
              <>
                <button
                  type="button"
                  onClick={entrarEdicion}
                  className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface hover:bg-black"
                >
                  Editar ficha
                </button>
                {/* Desktop: todas las acciones secundarias visibles */}
                <div className="hidden flex-wrap items-center gap-2 sm:flex">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={syncKmHoy}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
                    title="Guarda el km de hoy; el mes es la suma de los días"
                  >
                    {pending ? "…" : "Actualizar km"}
                  </button>
                  {sinKmMes > 40 && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={syncKmMes}
                      className="rounded-lg px-3 py-2 text-sm text-muted ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
                      title="Solo si faltan días del mes en gps_dias"
                    >
                      Rellenar mes
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={placasDiacor}
                    className="rounded-lg px-3 py-2 text-sm text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
                  >
                    {pending ? "…" : "Placas Diacor"}
                  </button>
                  <a
                    href="/cartera/rastreo"
                    className="rounded-lg px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
                  >
                    Mapa flota
                  </a>
                </div>
                {/* Móvil: secundarias detrás de «Más» */}
                <MasAccionesMovil
                  pending={pending}
                  sinKmMes={sinKmMes}
                  onKmHoy={syncKmHoy}
                  onKmMes={syncKmMes}
                  onPlacas={placasDiacor}
                />
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
          </>
        }
      />

      {msg && <p className="text-sm text-muted">{msg}</p>}

      {elegido && (
        <PanelEditarCarro
          carro={elegido}
          onClose={() => setElegido(null)}
          onSaved={(texto) => {
            setElegido(null);
            setMsg(texto);
            // Carga limpia: un refresh RSC con el modal a medio cerrar
            // tiraba la página en blanco (client-side exception).
            window.location.assign(
              `/cartera/vehiculos?aviso=${encodeURIComponent(texto)}`,
            );
          }}
        />
      )}

      {visibles.length === 0 ? (
        <EmptyState title="Nada calza con ese filtro" hint="Probá otro chip o búsqueda." />
      ) : (
      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-wide text-muted">
              <th className="px-5 py-3">Carro</th>
              <th className="px-5 py-3">Placa</th>
              <th className="px-5 py-3">Vehículo</th>
              <th className="px-5 py-3">Arrendatario</th>
              <th className="px-5 py-3">Km</th>
              <th className="px-5 py-3">Km hoy</th>
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
                    <button
                      type="button"
                      onClick={() => setElegido(v)}
                      className="text-left hover:underline"
                      title="Editar ficha: número, nombre y celular"
                    >
                      {v.empresa ? `${siglaEmpresa(v.empresa)} · ` : ""}
                      {v.numero}
                    </button>
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
                        {v.celular ? (
                          <p className="font-mono text-xs text-muted">{v.celular}</p>
                        ) : (
                          <p className="text-xs text-ambar">Sin celular</p>
                        )}
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
                  <td
                    className={`px-5 py-3 tabular-nums ${
                      v.alertaGps === "exceso_km_dia"
                        ? "font-medium text-rojo"
                        : v.alertaGps === "sin_recorrido"
                          ? "text-ambar"
                          : "text-ink"
                    }`}
                  >
                    {v.kmHoy != null ? Math.round(v.kmHoy).toLocaleString("es-PA") : "—"}
                    {v.alertaGps === "exceso_km_dia" && (
                      <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-rojo">
                        +350
                      </span>
                    )}
                    {v.alertaGps === "sin_recorrido" && (
                      <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-ambar">
                        sin recorrido
                      </span>
                    )}
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
                      <Link
                        href="/cartera/rastreo"
                        className="font-mono text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        {v.gps_id}
                      </Link>
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
          </tbody>
        </table>
      </div>
      )}
      <p className="text-xs text-muted">
        Carros no llama a Diacor en cada visita: el histórico y el amarre viven acá; el mapa en vivo en{" "}
        <Link href="/cartera/rastreo" className="underline-offset-2 hover:underline">
          Rastreo
        </Link>
        . El número abre la ficha para corregir número del carro, nombre o celular del arrendatario. La hoja de vida sigue en Operaciones.
      </p>
    </div>
  );
}

function PanelEditarCarro({
  carro,
  onClose,
  onSaved,
}: {
  carro: FilaVehiculo;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [numero, setNumero] = useState(carro.numero);
  const [nombre, setNombre] = useState(carro.cliente ?? "");
  const [celular, setCelular] = useState(carro.celular ?? "");
  const [genero, setGenero] = useState("");
  const [letra, setLetra] = useState(carro.letra != null ? String(carro.letra) : "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titulo = `${carro.empresa ? `${siglaEmpresa(carro.empresa)} · ` : ""}${carro.numero}`;

  function guardar(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      try {
        const r = await guardarIdentidadCarro({
          vehiculoId: carro.id,
          numero,
          clienteId: carro.clienteId,
          nombre: nombre.trim() || null,
          celular: celular.trim() || null,
          genero: genero || null,
          letra: Number(String(letra).replace(",", ".")) || null,
        });
        if (!r.ok) {
          setErr(r.msg);
          return;
        }
        onSaved(r.msg);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "No pude guardar. Probá de nuevo.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <form
        onSubmit={guardar}
        className="relative z-10 m-4 w-full max-w-md rounded-xl bg-surface p-5 ring-1 ring-line"
      >
        <h2 className="text-lg font-semibold tracking-tight">Editar {titulo}</h2>
        <p className="mt-1 text-sm text-muted">
          {carro.clienteId
            ? "Corregí nombre o celular si hay error. El próximo extracto y recordatorio salen con esos datos."
            : "Si es cliente nuevo, dejanos nombre, género, WhatsApp y letra. Quedan el contrato y el chat enlazados."}
        </p>
        <div className="mt-5 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Número del carro *
            </span>
            <input
              required
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
          </label>
          {carro.clienteId ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  Nombre del arrendatario *
                </span>
                <input
                  required
                  minLength={2}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  Celular / WhatsApp *
                </span>
                <input
                  required
                  inputMode="tel"
                  placeholder="+50761234567"
                  value={celular}
                  onChange={(e) => setCelular(e.target.value)}
                  className="rounded-lg bg-surface px-3 py-2.5 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                />
              </label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  Nombre del arrendatario
                </span>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Si es cliente nuevo"
                  className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Género</span>
                <select
                  value={genero}
                  onChange={(e) => setGenero(e.target.value)}
                  className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                >
                  <option value="">Elegí…</option>
                  <option value="m">Masculino — Sr.</option>
                  <option value="f">Femenino — Sra.</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  Celular / WhatsApp
                </span>
                <input
                  inputMode="tel"
                  placeholder="+50761234567"
                  value={celular}
                  onChange={(e) => setCelular(e.target.value)}
                  className="rounded-lg bg-surface px-3 py-2.5 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  Letra diaria
                </span>
                <input
                  inputMode="decimal"
                  placeholder="35"
                  value={letra}
                  onChange={(e) => setLetra(e.target.value)}
                  className="rounded-lg bg-surface px-3 py-2.5 text-sm tabular-nums ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                />
              </label>
            </>
          )}
        </div>
        {err && <p className="mt-3 text-sm text-rojo">{err}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Cancelar
          </button>
          <Link
            href={`/operaciones/hoja-vida/${carro.id}`}
            className="ml-auto text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Hoja de vida
          </Link>
        </div>
      </form>
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

/** En móvil, las acciones secundarias van detrás de «Más» para no pelear con el search. */
function MasAccionesMovil({
  pending,
  sinKmMes,
  onKmHoy,
  onKmMes,
  onPlacas,
}: {
  pending: boolean;
  sinKmMes: number;
  onKmHoy: () => void;
  onKmMes: () => void;
  onPlacas: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="rounded-lg px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
      >
        Más{abierto ? " ·" : ""}
      </button>
      {abierto && (
        <>
          <button
            type="button"
            aria-label="Cerrar menú"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAbierto(false)}
          />
          <div className="absolute right-0 z-20 mt-1 min-w-[11rem] overflow-hidden rounded-lg bg-surface py-1 shadow-lg ring-1 ring-line">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setAbierto(false);
                onKmHoy();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-2 disabled:opacity-50"
            >
              Actualizar km
            </button>
            {sinKmMes > 40 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setAbierto(false);
                  onKmMes();
                }}
                className="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 disabled:opacity-50"
              >
                Rellenar mes
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setAbierto(false);
                onPlacas();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-2 disabled:opacity-50"
            >
              Placas Diacor
            </button>
            <a
              href="/cartera/rastreo"
              className="block w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-surface-2"
              onClick={() => setAbierto(false)}
            >
              Mapa flota
            </a>
          </div>
        </>
      )}
    </div>
  );
}
