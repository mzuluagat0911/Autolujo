"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, FiltersBar } from "@/components/kit";
import type { Abierto, GrupoActividad, Movimiento, PersonaActividad } from "@/lib/comercial/actividad";

const PERIODOS = [
  { id: "1", label: "Hoy" },
  { id: "7", label: "7 días" },
  { id: "30", label: "30 días" },
];

const TIPOS = [
  { id: "todas", label: "Todo" },
  { id: "mensaje", label: "Escribió" },
  { id: "ficha", label: "Fichas" },
  { id: "cita", label: "Citas" },
  { id: "asignacion", label: "Tomó o devolvió" },
];

const GRUPO: Record<GrupoActividad, string> = {
  mensaje: "Mensaje",
  ficha: "Ficha",
  cita: "Cita",
  asignacion: "Chat",
  otro: "Otro",
};

export function ActividadPanel({
  personas,
  abiertos,
  movimientos,
}: {
  personas: PersonaActividad[];
  abiertos: Abierto[];
  movimientos: Movimiento[];
}) {
  const [periodo, setPeriodo] = useState("7");
  const [tipo, setTipo] = useState("todas");
  const [persona, setPersona] = useState("todas");
  const [q, setQ] = useState("");

  const desde = useMemo(() => inicioDe(Number(periodo)), [periodo]);
  const busqueda = q.trim().toLowerCase();

  const visibles = useMemo(() => {
    return movimientos.filter((m) => {
      const t = Date.parse(m.cuando);
      if (!Number.isFinite(t) || t < desde) return false;
      if (persona !== "todas" && m.asesorId !== persona) return false;
      if (tipo !== "todas" && m.grupo !== tipo) return false;
      if (!busqueda) return true;
      return `${m.asesor} ${m.lead} ${m.texto}`.toLowerCase().includes(busqueda);
    });
  }, [movimientos, desde, persona, tipo, busqueda]);

  const conteo = useMemo(() => {
    const map = new Map<string, { mensajes: number; fichas: number; citas: number; asignaciones: number }>();
    for (const p of personas) map.set(p.id, { mensajes: 0, fichas: 0, citas: 0, asignaciones: 0 });
    for (const m of visibles) {
      const fila = map.get(m.asesorId);
      if (!fila) continue;
      if (m.grupo === "mensaje") fila.mensajes += 1;
      else if (m.grupo === "ficha") fila.fichas += 1;
      else if (m.grupo === "cita") fila.citas += 1;
      else if (m.grupo === "asignacion") fila.asignaciones += 1;
    }
    return map;
  }, [visibles, personas]);

  const personasVista = personas.filter((p) => persona === "todas" || p.id === persona);
  const chats =
    persona === "todas" ? [] : abiertos.filter((a) => a.asesorId === persona);
  const dias = agrupar(visibles);

  return (
    <div className="mt-8 flex flex-col gap-6">
      <FiltersBar
        search={{ value: q, onChange: setQ }}
        searchPlaceholder="Buscar persona o lead"
        chipGroups={[
          { chips: PERIODOS, active: periodo, onChip: setPeriodo },
          { chips: TIPOS, active: tipo, onChip: setTipo },
          {
            chips: [{ id: "todas", label: "Todo el equipo" }, ...personas.map((p) => ({ id: p.id, label: p.nombre }))],
            active: persona,
            onChip: setPersona,
          },
        ]}
      />

      <div className="overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Persona</th>
              <th className="px-4 py-3 text-right font-medium">Abiertos</th>
              <th className="px-4 py-3 text-right font-medium">Escribió</th>
              <th className="px-4 py-3 text-right font-medium">Fichas</th>
              <th className="px-4 py-3 text-right font-medium">Citas</th>
              <th className="px-4 py-3 text-right font-medium">Tomó</th>
            </tr>
          </thead>
          <tbody>
            {personasVista.map((p) => {
              const c = conteo.get(p.id);
              const activo = persona === p.id;
              return (
                <tr
                  key={p.id}
                  className={`border-t border-line ${activo ? "bg-surface-2" : "hover:bg-surface-2"}`}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setPersona(activo ? "todas" : p.id)}
                      className="font-medium hover:underline"
                    >
                      {p.nombre}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.abiertos}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c?.mensajes ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c?.fichas ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c?.citas ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c?.asignaciones ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {chats.length > 0 && (
        <section className="rounded-xl bg-surface p-4 ring-1 ring-line">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Chats abiertos</p>
          <ul className="mt-2 divide-y divide-line">
            {chats.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link href={`/comercial?chat=${c.id}`} className="text-sm font-medium hover:underline">
                  {c.nombre}
                </Link>
                <span className="text-xs text-muted">{c.etapa}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dias.length === 0 ? (
        <EmptyState title="Nada en este filtro" hint="Cambia la persona, el tipo o el periodo." />
      ) : (
        <div className="flex flex-col gap-6">
          {dias.map((dia) => (
            <section key={dia.clave}>
              <h2 className="text-sm font-semibold">{dia.titulo}</h2>
              <ul className="mt-2 overflow-hidden rounded-xl ring-1 ring-line">
                {dia.items.map((m) => (
                  <li key={m.id} className="grid grid-cols-[4.5rem_7rem_1fr] gap-3 border-t border-line px-4 py-3 first:border-0 sm:grid-cols-[5rem_9rem_8rem_1fr]">
                    <span className="text-xs tabular-nums text-muted">{hora(m.cuando)}</span>
                    <span className="truncate text-sm font-medium">{m.asesor}</span>
                    <span className="hidden text-xs text-muted sm:block">{GRUPO[m.grupo]}</span>
                    <p className="min-w-0 text-sm">
                      {m.chatId ? (
                        <Link href={`/comercial?chat=${m.chatId}`} className="font-medium hover:underline">
                          {m.lead}
                        </Link>
                      ) : (
                        <span className="font-medium">{m.lead}</span>
                      )}
                      <span className="text-muted"> · {m.texto}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function agrupar(items: Movimiento[]): { clave: string; titulo: string; items: Movimiento[] }[] {
  const grupos: { clave: string; titulo: string; items: Movimiento[] }[] = [];
  for (const item of items) {
    const clave = diaClave(item.cuando);
    const ultimo = grupos[grupos.length - 1];
    if (!ultimo || ultimo.clave !== clave) grupos.push({ clave, titulo: tituloDia(item.cuando), items: [item] });
    else ultimo.items.push(item);
  }
  return grupos;
}

function inicioDe(dias: number): number {
  if (dias === 1) {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Panama",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .split("-")
      .map(Number);
    return Date.UTC(partes[0] ?? 2026, (partes[1] ?? 1) - 1, partes[2] ?? 1, 5, 0, 0);
  }
  return Date.now() - dias * 24 * 60 * 60 * 1000;
}

function diaClave(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Panama",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function tituloDia(iso: string): string {
  const clave = diaClave(iso);
  const hoy = diaClave(new Date().toISOString());
  const ayer = diaClave(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (clave === hoy) return "Hoy";
  if (clave === ayer) return "Ayer";
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
