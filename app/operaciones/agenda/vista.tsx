"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { EmptyState, FiltersBar, StatusChip } from "@/components/kit";
import {
  TIPOS_CITA_TALLER,
  etiquetaTipoCita,
  type CarroAgenda,
  type CitaTaller,
  type NotaCitaTaller,
} from "@/lib/operaciones/agenda";
import {
  FOTOS_MINIMAS,
  ITEMS_FULL,
  ITEMS_KIT_DEFAULT,
  PRECIO_KIT_AUTO,
  PRECIO_KIT_MANUAL,
} from "@/lib/operaciones/registro-taller";
import {
  cargarNotasCita,
  cerrarCitaAction,
  crearCitaAction,
  marcarAsistenciaAction,
  notaCitaAction,
} from "./actions";

function tonoEstado(estado: string): "good" | "warn" | "crit" | "neutral" | "azul" {
  if (estado === "llego" || estado === "hecha") return "good";
  if (estado === "programada") return "azul";
  if (estado === "no_llego") return "warn";
  if (estado === "cancelada") return "crit";
  return "neutral";
}

function fechaCorta(f: string): string {
  const [y, m, d] = f.split("-");
  return y && m && d ? `${d}/${m}/${y}` : f;
}

export function AgendaVista({
  iniciales,
  carros,
  fechaHoy,
  errorInicial,
  atendidosHoy = [],
}: {
  iniciales: CitaTaller[];
  carros: CarroAgenda[];
  fechaHoy: string;
  errorInicial: string | null;
  atendidosHoy?: {
    id: string;
    tipo: string;
    carro: string;
    sucursal: string;
    km: number | null;
    avisoMulta: boolean;
  }[];
}) {
  const [citas, setCitas] = useState(iniciales);
  const [filtroSede, setFiltroSede] = useState<"todas" | "juan_diaz" | "chorrera">("todas");
  const [sel, setSel] = useState<string | null>(iniciales[0]?.id ?? null);
  const [notas, setNotas] = useState<NotaCitaTaller[]>([]);
  const [aviso, setAviso] = useState<string | null>(errorInicial);
  const [pending, start] = useTransition();
  const [stickerIdx, setStickerIdx] = useState(0);
  const [fotoCount, setFotoCount] = useState(0);

  const elegida = citas.find((c) => c.id === sel) ?? null;
  const visibles =
    filtroSede === "todas" ? citas : citas.filter((c) => c.sucursal === filtroSede);

  useEffect(() => {
    if (!sel) {
      setNotas([]);
      return;
    }
    start(async () => setNotas(await cargarNotasCita(sel)));
  }, [sel]);

  function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const r = await crearCitaAction(fd);
      setAviso(r.msg);
      if (!r.ok) return;
      form.reset();
      window.location.reload();
    });
  }

  function asistir(estado: "llego" | "no_llego" | "cancelada", comentario?: string) {
    if (!sel) return;
    const fd = new FormData();
    fd.set("cita_id", sel);
    fd.set("estado", estado);
    if (comentario) fd.set("comentario", comentario);
    start(async () => {
      const r = await marcarAsistenciaAction(fd);
      setAviso(r.msg);
      if (!r.ok) return;
      setCitas((prev) => prev.map((c) => (c.id === sel ? { ...c, estado } : c)));
      setNotas(await cargarNotasCita(sel));
    });
  }

  function cerrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sel) return;
    const fd = new FormData(e.currentTarget);
    fd.set("cita_id", sel);
    start(async () => {
      const r = await cerrarCitaAction(fd);
      setAviso(r.msg);
      if (!r.ok) return;
      setCitas((prev) =>
        prev.map((c) =>
          c.id === sel
            ? {
                ...c,
                estado: "hecha",
                proximaFecha: r.ok ? r.proximaFecha : c.proximaFecha,
              }
            : c,
        ),
      );
      setNotas(await cargarNotasCita(sel));
    });
  }

  function comentar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sel) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("cita_id", sel);
    start(async () => {
      const r = await notaCitaAction(fd);
      setAviso(r.msg);
      if (!r.ok) return;
      form.reset();
      setNotas(await cargarNotasCita(sel));
    });
  }

  const sedeDefault = (vehiculoId: string) =>
    carros.find((c) => c.vehiculoId === vehiculoId)?.sede ?? "";

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="space-y-6">
        <form
          onSubmit={crear}
          className="grid gap-3 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2"
        >
          <h2 className="text-sm font-semibold text-ink sm:col-span-2">Nueva cita</h2>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Carro</span>
            <select
              name="vehiculo_id"
              required
              defaultValue=""
              onChange={(e) => {
                const sede = sedeDefault(e.target.value);
                const selSede = e.currentTarget.form?.elements.namedItem("sucursal") as HTMLSelectElement | null;
                if (selSede && sede) selSede.value = sede;
              }}
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            >
              <option value="" disabled>
                Elegí el carro
              </option>
              {carros.map((c) => (
                <option key={c.vehiculoId} value={c.vehiculoId}>
                  {c.label}
                  {c.sede ? ` · ${c.sede === "chorrera" ? "Chorrera" : "Juan Díaz"}` : " · sin sede"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Tipo</span>
            <select
              name="tipo"
              required
              defaultValue="revision_mensual"
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            >
              {TIPOS_CITA_TALLER.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Sucursal</span>
            <select
              name="sucursal"
              defaultValue=""
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            >
              <option value="">Auto (entrega del contrato)</option>
              <option value="juan_diaz">Juan Díaz</option>
              <option value="chorrera">La Chorrera</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Fecha</span>
            <input
              type="date"
              name="fecha"
              required
              defaultValue={fechaHoy}
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Hora</span>
            <input
              name="hora_texto"
              placeholder="9AM · Entre 9AM a 2PM"
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Trabajo / nota
            </span>
            <input
              name="trabajo"
              placeholder="Opcional"
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Monto cliente (kit)
            </span>
            <input
              name="monto_cliente"
              inputMode="decimal"
              placeholder="73"
              className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Agendar"}
            </button>
          </div>
        </form>

        <FiltersBar
          chips={[
            { id: "todas", label: "Todas" },
            { id: "juan_diaz", label: "Juan Díaz" },
            { id: "chorrera", label: "Chorrera" },
          ]}
          activeChip={filtroSede}
          onChip={(id) => setFiltroSede(id as "todas" | "juan_diaz" | "chorrera")}
        />

        {aviso && (
          <p className="rounded-lg bg-ambar-wash px-4 py-3 text-sm text-ink ring-1 ring-ambar/40">{aviso}</p>
        )}

        {atendidosHoy.length > 0 && (
          <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Atendidos hoy · {fechaCorta(fechaHoy)}
            </p>
            <ul className="mt-2 space-y-1">
              {atendidosHoy.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <span className="font-medium">{a.carro}</span>
                  <span className="text-muted">{etiquetaTipoCita(a.tipo)}</span>
                  <span className="text-muted">{a.sucursal}</span>
                  {a.km != null && <span className="tabular-nums text-muted">{a.km} km</span>}
                  {a.avisoMulta && <StatusChip tone="warn">Multa → Cartera</StatusChip>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {visibles.length === 0 ? (
          <EmptyState title="Sin citas en esta ventana" hint="Agendá arriba o ampliá el rango." />
        ) : (
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {visibles.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSel(c.id)}
                  className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-2 ${
                    sel === c.id ? "bg-surface-2" : "bg-surface"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{c.carro}</span>
                    <StatusChip tone={tonoEstado(c.estado)}>{c.estado.replace("_", " ")}</StatusChip>
                    <span className="text-xs text-muted">{c.sucursalEtiqueta}</span>
                  </div>
                  <p className="text-sm text-muted">
                    {fechaCorta(c.fecha)}
                    {c.horaTexto ? ` · ${c.horaTexto}` : ""} · {etiquetaTipoCita(c.tipo)}
                    {c.clienteNombre ? ` · ${c.clienteNombre}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="rounded-xl bg-surface p-5 ring-1 ring-line lg:sticky lg:top-4 lg:self-start">
        {!elegida ? (
          <p className="text-sm text-muted">Elegí una cita para confirmar llegada y comentar.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Detalle</p>
              <h3 className="mt-1 text-lg font-semibold text-ink">{elegida.carro}</h3>
              <p className="mt-1 text-sm text-muted">
                {etiquetaTipoCita(elegida.tipo)} · {elegida.sucursalEtiqueta}
              </p>
              <p className="mt-1 text-sm text-ink">
                {fechaCorta(elegida.fecha)}
                {elegida.horaTexto ? ` · ${elegida.horaTexto}` : ""}
              </p>
              {elegida.proximaFecha && (
                <p className="mt-2 text-sm text-verde">
                  Próxima visita ~ {fechaCorta(elegida.proximaFecha)}
                </p>
              )}
            </div>

            {elegida.estado !== "hecha" && elegida.estado !== "cancelada" && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => asistir("llego")}
                  className="rounded-lg bg-verde px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Llegó
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => asistir("no_llego", "No asistió a la cita")}
                  className="rounded-lg bg-ambar px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  No llegó
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => asistir("cancelada", "Cita cancelada")}
                  className="rounded-lg bg-surface px-3 py-2 text-sm font-medium text-ink ring-1 ring-line disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            )}

            {(elegida.estado === "llego" || elegida.estado === "programada") && (
              <form onSubmit={cerrar} className="space-y-3 border-t border-line pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Registro de visita ({etiquetaTipoCita(elegida.tipo)})
                </p>
                <input
                  name="km"
                  inputMode="numeric"
                  placeholder="Km (GPS / sistema)"
                  className="w-full rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                />

                {elegida.tipo === "mantenimiento_6000" && (
                  <div className="space-y-2 rounded-lg bg-surface-2 p-3">
                    <p className="text-xs font-medium text-ink">FULL — marcar todo</p>
                    {ITEMS_FULL.map((it) => (
                      <label key={it.id} className="flex items-center gap-2 text-sm text-ink">
                        <input type="checkbox" name={it.campo} className="rounded border-line" />
                        {it.label}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" name="promo_gratis" className="rounded border-line" />
                      Promo gratis (se confirma en sucursal)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" name="sticker_ok" className="rounded border-line" />
                      Sticker pegado
                    </label>
                    <input
                      name="monto_cobrado"
                      inputMode="decimal"
                      placeholder="Monto cobrado (0 si promo)"
                      className="w-full rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                    />
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-muted">Carro limpio</span>
                      <select
                        name="carro_limpio"
                        className="rounded-lg bg-surface px-3 py-2 ring-1 ring-line outline-none"
                      >
                        <option value="">—</option>
                        <option value="si">Sí</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                  </div>
                )}

                {elegida.tipo === "kit_tiempos" && (
                  <div className="space-y-2 rounded-lg bg-surface-2 p-3">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-muted">Transmisión</span>
                      <select
                        name="transmision"
                        required
                        defaultValue=""
                        className="rounded-lg bg-surface px-3 py-2 ring-1 ring-line outline-none"
                      >
                        <option value="" disabled>
                          Elegí
                        </option>
                        <option value="manual">Manual · ${PRECIO_KIT_MANUAL}</option>
                        <option value="automatico">Automático · ${PRECIO_KIT_AUTO}</option>
                      </select>
                    </label>
                    <input
                      name="monto_cliente_kit"
                      required
                      inputMode="decimal"
                      placeholder="Monto que asume el cliente"
                      className="w-full rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                    />
                    <p className="text-xs text-muted">Ítems hechos</p>
                    {ITEMS_KIT_DEFAULT.map((it) => (
                      <label key={it} className="flex items-center gap-2 text-sm text-ink">
                        <input type="checkbox" name="items_kit" value={it} className="rounded border-line" />
                        {it}
                      </label>
                    ))}
                  </div>
                )}

                {(elegida.tipo === "mecanica" || elegida.tipo === "atf") && (
                  <input
                    name="trabajo"
                    placeholder={elegida.tipo === "atf" ? "ATF + filtro…" : "Trabajo realizado"}
                    className="w-full rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                  />
                )}

                {elegida.tipo === "mecanica" && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted">¿Queda operativo?</span>
                    <select name="operativo" className="rounded-lg bg-surface px-3 py-2 ring-1 ring-line">
                      <option value="">—</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                )}

                <input
                  name="costo_edison"
                  inputMode="decimal"
                  placeholder="Costo interno Edison (opcional)"
                  className="w-full rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                />

                <div className="space-y-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted">Fotos (mín. {FOTOS_MINIMAS})</span>
                    <input
                      type="file"
                      name="fotos"
                      accept="image/*"
                      multiple
                      required
                      onChange={(e) => setFotoCount(e.target.files?.length ?? 0)}
                      className="text-sm"
                    />
                  </label>
                  {fotoCount > 0 && elegida.tipo === "mantenimiento_6000" && (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-muted">¿Cuál es la foto del sticker? (nº 1…)</span>
                      <input
                        type="number"
                        name="sticker_idx_ui"
                        min={1}
                        max={fotoCount}
                        value={stickerIdx + 1}
                        onChange={(e) => setStickerIdx(Math.max(0, Number(e.target.value) - 1))}
                        className="w-24 rounded-lg bg-surface px-3 py-2 ring-1 ring-line"
                      />
                      <input type="hidden" name="sticker_idx" value={stickerIdx} />
                    </label>
                  )}
                  {elegida.tipo !== "mantenimiento_6000" && (
                    <input type="hidden" name="sticker_idx" value="-1" />
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="aviso_cartera_multa" className="rounded border-line" />
                  Avisar a Cartera (multa $10 inasistencia / sucio)
                </label>
                <input
                  name="motivo_multa"
                  placeholder="Motivo multa (si aplica)"
                  className="w-full rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                />

                <textarea
                  name="comentario"
                  rows={2}
                  placeholder="Observación / novedades"
                  className="w-full rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                >
                  {pending ? "Guardando…" : "Guardar registro y cerrar"}
                </button>
              </form>
            )}

            <form onSubmit={comentar} className="space-y-2 border-t border-line pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Comentario</p>
              <textarea
                name="comentario"
                required
                rows={2}
                placeholder="Nota de Néstor…"
                className="w-full rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-surface px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
              >
                Guardar comentario
              </button>
            </form>

            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Historial</p>
              {notas.length === 0 ? (
                <p className="text-sm text-muted">Sin comentarios aún.</p>
              ) : (
                <ul className="space-y-2">
                  {notas.map((n) => (
                    <li key={n.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink">
                      <p>{n.texto}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {n.autorNombre ?? "Equipo"} ·{" "}
                        {new Date(n.createdAt).toLocaleString("es-PA", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
