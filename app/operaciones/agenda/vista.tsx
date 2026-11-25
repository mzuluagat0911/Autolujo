"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { Band, EmptyState, FiltersBar, StatusChip } from "@/components/kit";
import { Field, Select, Textarea } from "@/components/form";
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

const INPUT =
  "rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none transition placeholder:text-faint focus:ring-2 focus:ring-ink/20";

function tonoEstado(estado: string): "good" | "warn" | "crit" | "neutral" | "azul" {
  if (estado === "llego" || estado === "hecha") return "good";
  if (estado === "programada") return "azul";
  if (estado === "no_llego") return "warn";
  if (estado === "cancelada") return "crit";
  return "neutral";
}

function labelEstado(estado: string): string {
  if (estado === "llego") return "Llegó";
  if (estado === "no_llego") return "No llegó";
  if (estado === "hecha") return "Hecha";
  if (estado === "cancelada") return "Cancelada";
  return "Programada";
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
  const [q, setQ] = useState("");
  const [filtroSede, setFiltroSede] = useState<"todas" | "juan_diaz" | "chorrera">("todas");
  const [sel, setSel] = useState<string | null>(iniciales[0]?.id ?? null);
  const [notas, setNotas] = useState<NotaCitaTaller[]>([]);
  const [aviso, setAviso] = useState<string | null>(errorInicial);
  const [pending, start] = useTransition();
  const [stickerIdx, setStickerIdx] = useState(0);
  const [fotoCount, setFotoCount] = useState(0);

  const elegida = citas.find((c) => c.id === sel) ?? null;

  const contadores = useMemo(() => {
    let jd = 0;
    let ch = 0;
    for (const c of citas) {
      if (c.sucursal === "juan_diaz") jd++;
      if (c.sucursal === "chorrera") ch++;
    }
    return { jd, ch };
  }, [citas]);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return citas.filter((c) => {
      if (filtroSede !== "todas" && c.sucursal !== filtroSede) return false;
      if (!needle) return true;
      const blob = [c.carro, c.clienteNombre, c.sucursalEtiqueta, etiquetaTipoCita(c.tipo), c.estado]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [citas, filtroSede, q]);

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
    <div className="mt-8 space-y-10">
      {aviso && (
        <p className="rounded-lg bg-ambar-wash px-4 py-3 text-sm text-ink ring-1 ring-ambar/40">{aviso}</p>
      )}

      <Band title="Nueva cita">
        <form
          onSubmit={crear}
          className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Carro</span>
            <select
              name="vehiculo_id"
              required
              defaultValue=""
              onChange={(e) => {
                const sede = sedeDefault(e.target.value);
                const selSede = e.currentTarget.form?.elements.namedItem(
                  "sucursal",
                ) as HTMLSelectElement | null;
                if (selSede && sede) selSede.value = sede;
              }}
              className={INPUT}
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
          <Select
            label="Tipo"
            name="tipo"
            required
            defaultValue="revision_mensual"
            options={TIPOS_CITA_TALLER.map((t) => ({ value: t.value, label: t.label }))}
          />
          <Select
            label="Sucursal"
            name="sucursal"
            defaultValue=""
            options={[
              { value: "", label: "Auto (entrega del contrato)" },
              { value: "juan_diaz", label: "Juan Díaz" },
              { value: "chorrera", label: "La Chorrera" },
            ]}
          />
          <Field label="Fecha" name="fecha" type="date" required defaultValue={fechaHoy} />
          <Field label="Hora" name="hora_texto" placeholder="9AM · Entre 9AM a 2PM" />
          <Field label="Trabajo / nota" name="trabajo" placeholder="Opcional" />
          <Field label="Monto cliente (kit)" name="monto_cliente" placeholder="Caso a caso" />
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Agendar"}
            </button>
          </div>
        </form>
      </Band>

      {atendidosHoy.length > 0 && (
        <Band title={`Atendidos hoy · ${fechaCorta(fechaHoy)}`}>
          <div className="overflow-x-auto rounded-xl ring-1 ring-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-3 font-medium">Carro</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Sede</th>
                  <th className="px-4 py-3 font-medium">Km</th>
                  <th className="px-4 py-3 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody>
                {atendidosHoy.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-semibold tabular-nums text-ink">{a.carro}</td>
                    <td className="px-4 py-3 text-muted">{etiquetaTipoCita(a.tipo)}</td>
                    <td className="px-4 py-3 text-muted">{a.sucursal}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">
                      {a.km != null ? `${a.km.toLocaleString("es-PA")}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {a.avisoMulta ? <StatusChip tone="warn">Multa → Cartera</StatusChip> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Band>
      )}

      <Band title="Citas">
        <div className="space-y-4">
          <FiltersBar
            search={{ value: q, onChange: setQ }}
            searchPlaceholder="Carro, cliente, tipo…"
            chips={[
              { id: "todas", label: "Todas", count: citas.length },
              { id: "juan_diaz", label: "Juan Díaz", count: contadores.jd },
              { id: "chorrera", label: "Chorrera", count: contadores.ch },
            ]}
            activeChip={filtroSede}
            onChip={(id) => setFiltroSede(id as "todas" | "juan_diaz" | "chorrera")}
            actions={
              <p className="text-sm text-muted">
                <span className="font-medium tabular-nums text-ink">{visibles.length}</span> de{" "}
                {citas.length}
              </p>
            }
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
            {visibles.length === 0 ? (
              <EmptyState title="Sin citas en esta ventana" hint="Agendá arriba o cambiá el filtro." />
            ) : (
              <div className="overflow-x-auto rounded-xl ring-1 ring-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                      <th className="px-4 py-3 font-medium">Carro</th>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Sede</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSel(c.id)}
                        className={`cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 ${
                          sel === c.id ? "bg-surface-2" : "bg-surface"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold tabular-nums text-ink">{c.carro}</p>
                          {c.clienteNombre && (
                            <p className="mt-0.5 text-xs text-muted">{c.clienteNombre}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-ink">
                          {fechaCorta(c.fecha)}
                          {c.horaTexto ? (
                            <span className="block text-xs text-muted">{c.horaTexto}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted">{etiquetaTipoCita(c.tipo)}</td>
                        <td className="px-4 py-3 text-muted">{c.sucursalEtiqueta}</td>
                        <td className="px-4 py-3">
                          <StatusChip tone={tonoEstado(c.estado)}>{labelEstado(c.estado)}</StatusChip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <aside className="rounded-xl bg-surface p-5 ring-1 ring-line lg:sticky lg:top-4 lg:self-start">
              {!elegida ? (
                <EmptyState title="Elegí una cita" hint="Confirmá llegada, registrá el trabajo y comentá." />
              ) : (
                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                      Detalle
                    </p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink">
                      {elegida.carro}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {etiquetaTipoCita(elegida.tipo)} · {elegida.sucursalEtiqueta}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-ink">
                      {fechaCorta(elegida.fecha)}
                      {elegida.horaTexto ? ` · ${elegida.horaTexto}` : ""}
                    </p>
                    <div className="mt-2">
                      <StatusChip tone={tonoEstado(elegida.estado)}>
                        {labelEstado(elegida.estado)}
                      </StatusChip>
                    </div>
                    {elegida.proximaFecha && (
                      <p className="mt-2 text-sm text-verde">
                        Próxima visita ~ {fechaCorta(elegida.proximaFecha)}
                      </p>
                    )}
                  </div>

                  {elegida.estado !== "hecha" && elegida.estado !== "cancelada" && (
                    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => asistir("llego")}
                        className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                      >
                        Llegó
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => asistir("no_llego", "No asistió a la cita")}
                        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-ambar ring-1 ring-ambar/40 hover:bg-ambar-wash disabled:opacity-50"
                      >
                        No llegó
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => asistir("cancelada", "Cita cancelada")}
                        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {(elegida.estado === "llego" || elegida.estado === "programada") && (
                    <form onSubmit={cerrar} className="space-y-3 border-t border-line pt-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                        Registro · {etiquetaTipoCita(elegida.tipo)}
                      </p>
                      <Field label="Km (GPS / sistema)" name="km" placeholder="Ej. 48200" />

                      {elegida.tipo === "mantenimiento_6000" && (
                        <div className="space-y-2.5 rounded-lg bg-surface-2 p-3 ring-1 ring-line">
                          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                            FULL
                          </p>
                          {ITEMS_FULL.map((it) => (
                            <label key={it.id} className="flex items-center gap-2.5 text-sm text-ink">
                              <input
                                type="checkbox"
                                name={it.campo}
                                className="size-4 rounded border-line text-ink"
                              />
                              {it.label}
                            </label>
                          ))}
                          <label className="flex items-center gap-2.5 text-sm text-ink">
                            <input type="checkbox" name="promo_gratis" className="size-4 rounded border-line" />
                            Promo gratis (en sucursal)
                          </label>
                          <label className="flex items-center gap-2.5 text-sm text-ink">
                            <input type="checkbox" name="sticker_ok" className="size-4 rounded border-line" />
                            Sticker pegado
                          </label>
                          <Field label="Monto cobrado" name="monto_cobrado" placeholder="0 si promo" />
                          <Select
                            label="Carro limpio"
                            name="carro_limpio"
                            defaultValue=""
                            options={[
                              { value: "", label: "—" },
                              { value: "si", label: "Sí" },
                              { value: "no", label: "No" },
                            ]}
                          />
                        </div>
                      )}

                      {elegida.tipo === "kit_tiempos" && (
                        <div className="space-y-2.5 rounded-lg bg-surface-2 p-3 ring-1 ring-line">
                          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                            Kit de tiempos
                          </p>
                          <Select
                            label="Transmisión"
                            name="transmision"
                            required
                            placeholder="Elegí"
                            defaultValue=""
                            options={[
                              { value: "manual", label: `Manual · $${PRECIO_KIT_MANUAL}` },
                              { value: "automatico", label: `Automático · $${PRECIO_KIT_AUTO}` },
                            ]}
                          />
                          <Field
                            label="Monto que asume el cliente"
                            name="monto_cliente_kit"
                            required
                            placeholder="Caso a caso"
                          />
                          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                            Ítems hechos
                          </p>
                          {ITEMS_KIT_DEFAULT.map((it) => (
                            <label key={it} className="flex items-center gap-2.5 text-sm text-ink">
                              <input
                                type="checkbox"
                                name="items_kit"
                                value={it}
                                className="size-4 rounded border-line"
                              />
                              {it}
                            </label>
                          ))}
                        </div>
                      )}

                      {(elegida.tipo === "mecanica" || elegida.tipo === "atf") && (
                        <Field
                          label="Trabajo"
                          name="trabajo"
                          placeholder={elegida.tipo === "atf" ? "ATF + filtro…" : "Trabajo realizado"}
                        />
                      )}

                      {elegida.tipo === "mecanica" && (
                        <Select
                          label="¿Queda operativo?"
                          name="operativo"
                          defaultValue=""
                          options={[
                            { value: "", label: "—" },
                            { value: "si", label: "Sí" },
                            { value: "no", label: "No" },
                          ]}
                        />
                      )}

                      <Field
                        label="Costo interno Edison"
                        name="costo_edison"
                        placeholder="Opcional"
                      />

                      <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                          Fotos (mín. {FOTOS_MINIMAS})
                        </span>
                        <input
                          type="file"
                          name="fotos"
                          accept="image/*"
                          multiple
                          required
                          onChange={(e) => setFotoCount(e.target.files?.length ?? 0)}
                          className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                        />
                      </label>
                      {fotoCount > 0 && elegida.tipo === "mantenimiento_6000" && (
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                            Nº foto del sticker
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={fotoCount}
                            value={stickerIdx + 1}
                            onChange={(e) => setStickerIdx(Math.max(0, Number(e.target.value) - 1))}
                            className={`w-24 ${INPUT}`}
                          />
                          <input type="hidden" name="sticker_idx" value={stickerIdx} />
                        </label>
                      )}
                      {elegida.tipo !== "mantenimiento_6000" && (
                        <input type="hidden" name="sticker_idx" value="-1" />
                      )}

                      <label className="flex items-center gap-2.5 text-sm text-ink">
                        <input
                          type="checkbox"
                          name="aviso_cartera_multa"
                          className="size-4 rounded border-line"
                        />
                        Avisar a Cartera (multa $10)
                      </label>
                      <Field label="Motivo multa" name="motivo_multa" placeholder="Si aplica" />
                      <Textarea label="Observación" name="comentario" rows={2} placeholder="Novedades…" />
                      <button
                        type="submit"
                        disabled={pending}
                        className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                      >
                        {pending ? "Guardando…" : "Guardar registro y cerrar"}
                      </button>
                    </form>
                  )}

                  <form onSubmit={comentar} className="space-y-3 border-t border-line pt-4">
                    <Textarea label="Comentario" name="comentario" required rows={2} placeholder="Nota…" />
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
                    >
                      Guardar comentario
                    </button>
                  </form>

                  <div className="space-y-2 border-t border-line pt-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                      Historial
                    </p>
                    {notas.length === 0 ? (
                      <p className="text-sm text-muted">Sin comentarios aún.</p>
                    ) : (
                      <ul className="space-y-2">
                        {notas.map((n) => (
                          <li key={n.id} className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-ink">
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
        </div>
      </Band>
    </div>
  );
}
