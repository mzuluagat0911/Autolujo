"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { EmptyState, FiltersBar, Toast } from "@/components/kit";
import type { ChatMantenimiento, MensajeMantenimiento } from "@/lib/operaciones/chats";
import {
  cargarBandejaMantenimiento,
  cargarHiloMantenimiento,
  enviarRespuestaMantenimiento,
} from "./actions";

const POLL_MS = 12_000;

function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-PA", {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

function telefono(n: string): string {
  const d = n.replace(/\D/g, "");
  if (d.startsWith("507") && d.length === 11) return `+507 ${d.slice(3, 7)}-${d.slice(7)}`;
  return n.startsWith("+") ? n : `+${n}`;
}

export function BandejaMantenimiento({
  inicial,
  errorInicial,
}: {
  inicial: ChatMantenimiento[];
  errorInicial: string | null;
}) {
  const [chats, setChats] = useState(inicial);
  const [error, setError] = useState(errorInicial);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeMantenimiento[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fondo = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return chats;
    return chats.filter((c) => {
      const blob = [c.nombre, c.waNumero, c.ultimoTexto].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(needle);
    });
  }, [chats, q]);

  useEffect(() => {
    if (!stickBottom.current) return;
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight });
  }, [mensajes]);

  useEffect(() => {
    if (!sel) {
      setMensajes([]);
      return;
    }
    stickBottom.current = true;
    start(async () => {
      const hilo = await cargarHiloMantenimiento(sel);
      setMensajes(hilo.mensajes);
      if (hilo.error) setError(hilo.error);
      setChats((prev) => prev.map((c) => (c.id === sel ? { ...c, noLeidos: 0 } : c)));
    });
  }, [sel]);

  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const lista = await cargarBandejaMantenimiento();
      setChats(lista.chats);
      setError(lista.error);
      if (sel) {
        const hilo = await cargarHiloMantenimiento(sel);
        setMensajes(hilo.mensajes);
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [sel]);

  const elegido = chats.find((c) => c.id === sel) ?? null;
  const noLeidos = chats.reduce((n, c) => n + (c.noLeidos || 0), 0);

  function onScrollHilo() {
    const el = fondo.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function irAbajo() {
    stickBottom.current = true;
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: "smooth" });
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    start(async () => {
      const r = await enviarRespuestaMantenimiento(data);
      if (!r.ok) {
        setAviso(r.error ?? "No se pudo enviar.");
        return;
      }
      setAviso(null);
      form.reset();
      stickBottom.current = true;
      if (sel) {
        const hilo = await cargarHiloMantenimiento(sel);
        setMensajes(hilo.mensajes);
      }
      const lista = await cargarBandejaMantenimiento();
      setChats(lista.chats);
    });
  }

  return (
    <div className="-mx-5 flex h-[calc(100dvh-3rem)] flex-col sm:-mx-8 lg:-mx-12 md:h-dvh">
      <header className="shrink-0 border-b border-line bg-surface px-5 py-4 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Operaciones</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Conversaciones</h1>
            <p className="mt-1 text-sm text-muted">
              WhatsApp +507 6623-6501
              {noLeidos > 0 ? (
                <>
                  {" "}
                  · <span className="font-medium tabular-nums text-ink">{noLeidos}</span> sin leer
                </>
              ) : null}
            </p>
          </div>
          <Link
            href="/operaciones/agenda"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Agenda
          </Link>
        </div>
      </header>

      {error && (
        <p className="shrink-0 border-b border-line bg-ambar-wash px-5 py-2.5 text-sm text-ink">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${sel ? "hidden sm:flex" : "flex"} w-full shrink-0 flex-col border-r border-line bg-surface sm:w-80`}
        >
          <div className="shrink-0 border-b border-line p-3">
            <FiltersBar
              variant="bare"
              search={{ value: q, onChange: setQ }}
              searchPlaceholder="Nombre o número…"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibles.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={chats.length === 0 ? "Sin chats aún" : "Sin coincidencias"}
                  hint={
                    chats.length === 0
                      ? "Cuando escriban al número de mantenimiento, aparecen acá."
                      : "Probá otro texto de búsqueda."
                  }
                />
              </div>
            ) : (
              visibles.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSel(c.id)}
                  className={`block w-full border-b border-line px-4 py-3 text-left transition hover:bg-surface-2 ${
                    c.id === sel ? "bg-surface-2" : "bg-surface"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                      {c.nombre || telefono(c.waNumero)}
                    </span>
                    {c.noLeidos > 0 && (
                      <span className="rounded-full bg-ink px-1.5 text-[11px] font-medium tabular-nums text-white">
                        {c.noLeidos}
                      </span>
                    )}
                  </div>
                  {c.nombre && (
                    <p className="mt-0.5 truncate text-[11px] text-muted">{telefono(c.waNumero)}</p>
                  )}
                  <p className="mt-1 truncate text-[12px] text-muted">{c.ultimoTexto || "Sin mensajes"}</p>
                  <p className="mt-0.5 text-[10px] text-faint">{hora(c.ultimoMensajeAt)}</p>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className={`${sel ? "flex" : "hidden"} min-w-0 flex-1 flex-col sm:flex`}>
          {!elegido ? (
            <div className="m-6">
              <EmptyState
                title="Elegí un chat"
                hint="Respondé desde el número de mantenimiento. El cliente solo confirma o mueve citas."
              />
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-line bg-surface px-5 py-3">
                <button
                  type="button"
                  onClick={() => setSel(null)}
                  className="mb-1 text-[12px] text-muted hover:text-ink sm:hidden"
                >
                  ← Chats
                </button>
                <p className="text-sm font-semibold text-ink">
                  {elegido.nombre || telefono(elegido.waNumero)}
                </p>
                <p className="mt-0.5 text-xs text-muted">{telefono(elegido.waNumero)}</p>
              </div>

              <div
                ref={fondo}
                onScroll={onScrollHilo}
                className="relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-paper px-5 py-4"
              >
                {mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direccion === "out" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[36rem] rounded-2xl px-3 py-2 text-sm ${
                        m.direccion === "out" ? "bg-ink text-white" : "bg-gris-wash text-ink"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.texto || "—"}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          m.direccion === "out" ? "text-white/60" : "text-muted"
                        }`}
                      >
                        {m.direccion === "out" ? m.autorNombre || "Taller" : "Cliente"} ·{" "}
                        {hora(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
                {!stickBottom.current && mensajes.length > 0 && (
                  <button
                    type="button"
                    onClick={irAbajo}
                    className="sticky bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white shadow-sm"
                  >
                    Ir abajo
                  </button>
                )}
              </div>

              <form
                onSubmit={enviar}
                className="shrink-0 border-t border-line bg-surface px-4 py-3"
              >
                <input type="hidden" name="conversacion_id" value={elegido.id} />
                {aviso && <p className="mb-2 text-sm text-rojo">{aviso}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    name="texto"
                    required
                    rows={2}
                    placeholder="Escribí desde el número de mantenimiento…"
                    className="min-h-[44px] flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                  >
                    {pending ? "Enviando…" : "Enviar"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      {aviso ? (
        <Toast message={aviso} tone="crit" onDismiss={() => setAviso(null)} />
      ) : null}
    </div>
  );
}
