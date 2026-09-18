"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Select } from "@/components/form";
import { StatusChip } from "@/components/kit";
import {
  TIPOS_EVENTO,
  etiquetaTipo,
  tonoTipo,
  type EventoHv,
} from "@/lib/operaciones/hoja-vida";
import { actualizarEvento, borrarEvento, crearEvento } from "./actions";

const INPUT =
  "rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none transition placeholder:text-faint focus:ring-2 focus:ring-ink/20";

function fmtKm(n: number | null) {
  return n == null ? null : n.toLocaleString("es-PA");
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function fmtValor(n: number | null) {
  if (n == null) return null;
  return new Intl.NumberFormat("es-PA", { style: "currency", currency: "USD" }).format(n);
}

export function FormNuevoEvento({
  vehiculoId,
  fechaHoy,
}: {
  vehiculoId: string;
  fechaHoy: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    setOk(null);
    start(async () => {
      const r = await crearEvento(fd);
      if (!r.ok) {
        setErr(r.error ?? "No se pudo guardar.");
        return;
      }
      setOk("Evento agregado.");
      e.currentTarget.reset();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-5 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3"
    >
      <input type="hidden" name="vehiculo_id" value={vehiculoId} />
      <Field label="Fecha *" name="fecha" type="date" required defaultValue={fechaHoy} />
      <Select
        label="Tipo *"
        name="tipo"
        required
        defaultValue="mantenimiento"
        options={TIPOS_EVENTO.map((t) => ({ value: t.value, label: t.label }))}
      />
      <Field label="Km" name="km" type="number" placeholder="45200" min={0} />
      <Field
        label="Título"
        name="titulo"
        placeholder="Mantenimiento FULL"
        hint="Corto. Si vacío, se usa el detalle."
      />
      <Field label="Lugar" name="lugar" placeholder="Taller interno" />
      <Field label="Valor (USD)" name="valor" type="number" step="0.01" min={0} />
      <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Detalle
        </span>
        <textarea
          name="detalle"
          rows={3}
          placeholder="Aceite 10w30, próximo a 58.000 km…"
          className={INPUT}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Agregar evento"}
        </button>
        {err && <p className="text-sm text-rojo">{err}</p>}
        {ok && <p className="text-sm text-verde">{ok}</p>}
      </div>
    </form>
  );
}

export function TimelineEventos({
  vehiculoId,
  eventos,
}: {
  vehiculoId: string;
  eventos: EventoHv[];
}) {
  const [editId, setEditId] = useState<string | null>(null);

  if (eventos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
        <p className="text-base font-semibold">Sin eventos aún</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Agregá el primer mantenimiento, revisión o novedad con el formulario de arriba.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-line">
      <ul className="divide-y divide-line">
        {eventos.map((ev) =>
          editId === ev.id ? (
            <li key={ev.id} className="bg-surface-2 p-4">
              <FormEditarEvento
                evento={ev}
                onCancel={() => setEditId(null)}
                onSaved={() => setEditId(null)}
              />
            </li>
          ) : (
            <li key={ev.id} className="bg-surface px-4 py-4 hover:bg-surface-2/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{fmtFecha(ev.fecha)}</span>
                    <StatusChip tone={tonoTipo(ev.tipo)}>{etiquetaTipo(ev.tipo)}</StatusChip>
                    {ev.km != null && (
                      <span className="text-xs tabular-nums text-muted">{fmtKm(ev.km)} km</span>
                    )}
                    {ev.valor != null && (
                      <span className="text-xs tabular-nums text-muted">{fmtValor(ev.valor)}</span>
                    )}
                    {ev.origen === "hv_excel" && (
                      <span className="text-[10px] uppercase tracking-[0.12em] text-faint">
                        Importado
                      </span>
                    )}
                  </div>
                  {ev.titulo && <p className="mt-1.5 text-sm font-medium">{ev.titulo}</p>}
                  {ev.detalle && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{ev.detalle}</p>
                  )}
                  {ev.lugar && <p className="mt-1 text-xs text-faint">{ev.lugar}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditId(ev.id)}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface-2"
                  >
                    Editar
                  </button>
                  <BorrarBoton id={ev.id} vehiculoId={vehiculoId} />
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function FormEditarEvento({
  evento,
  onCancel,
  onSaved,
}: {
  evento: EventoHv;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    start(async () => {
      const r = await actualizarEvento(fd);
      if (!r.ok) {
        setErr(r.error ?? "No se pudo guardar.");
        return;
      }
      onSaved();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="id" value={evento.id} />
      <input type="hidden" name="vehiculo_id" value={evento.vehiculo_id} />
      <Field label="Fecha *" name="fecha" type="date" required defaultValue={evento.fecha} />
      <Select
        label="Tipo *"
        name="tipo"
        required
        defaultValue={evento.tipo}
        options={TIPOS_EVENTO.map((t) => ({ value: t.value, label: t.label }))}
      />
      <Field
        label="Km"
        name="km"
        type="number"
        min={0}
        defaultValue={evento.km ?? undefined}
      />
      <Field label="Título" name="titulo" defaultValue={evento.titulo ?? ""} />
      <Field label="Lugar" name="lugar" defaultValue={evento.lugar ?? ""} />
      <Field
        label="Valor (USD)"
        name="valor"
        type="number"
        step="0.01"
        min={0}
        defaultValue={evento.valor ?? undefined}
      />
      <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Detalle
        </span>
        <textarea
          name="detalle"
          rows={3}
          defaultValue={evento.detalle ?? ""}
          className={INPUT}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
        >
          Cancelar
        </button>
        {err && <p className="text-sm text-rojo">{err}</p>}
      </div>
    </form>
  );
}

function BorrarBoton({ id, vehiculoId }: { id: string; vehiculoId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    if (!confirm("¿Borrar este evento de la hoja de vida?")) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("vehiculo_id", vehiculoId);
    start(async () => {
      await borrarEvento(fd);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-lg px-3 py-1.5 text-xs font-medium text-rojo ring-1 ring-rojo/30 hover:bg-rojo-wash disabled:opacity-50"
    >
      {pending ? "…" : "Borrar"}
    </button>
  );
}
