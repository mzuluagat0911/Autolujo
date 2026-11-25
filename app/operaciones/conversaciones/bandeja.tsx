"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/kit";
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
  const [sel, setSel] = useState<string | null>(inicial[0]?.id ?? null);
  const [mensajes, setMensajes] = useState<MensajeMantenimiento[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight });
  }, [mensajes]);

  useEffect(() => {
    if (!sel) return;
    start(async () => {
      const hilo = await cargarHiloMantenimiento(sel);
      setMensajes(hilo.mensajes);
      if (hilo.error) setError(hilo.error);
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
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Operaciones</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Mantenimiento</h1>
          <Link
            href="/operaciones/agenda"
            className="text-sm font-medium text-ink underline-offset-2 hover:underline"
          >
            Agenda
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">WhatsApp +507 6623-6501 · citas de taller</p>
      </header>

      {error && (
        <p className="border-b border-ambar/40 bg-ambar-wash px-5 py-3 text-sm text-ink">{error}</p>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-full max-w-[320px] shrink-0 overflow-y-auto border-r border-line bg-surface">
          {chats.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sin chats aún" hint="Cuando un cliente escriba al número de mantenimiento, aparece acá." />
            </div>
          ) : (
            <ul>
              {chats.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSel(c.id)}
                    className={`flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left hover:bg-surface-2 ${
                      sel === c.id ? "bg-surface-2" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">
                        {c.nombre || telefono(c.waNumero)}
                      </span>
                      {c.noLeidos > 0 && (
                        <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">
                          {c.noLeidos}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted">{c.ultimoTexto || "—"}</p>
                    <p className="text-[10px] text-faint">{hora(c.ultimoMensajeAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-paper">
          {!elegido ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState title="Elegí un chat" hint="Respondé desde el número de mantenimiento." />
            </div>
          ) : (
            <>
              <div className="border-b border-line px-5 py-3">
                <p className="text-sm font-semibold text-ink">
                  {elegido.nombre || telefono(elegido.waNumero)}
                </p>
                <p className="text-xs text-muted">{telefono(elegido.waNumero)}</p>
              </div>
              <div ref={fondo} className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
                {mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.direccion === "out"
                        ? "ml-auto bg-ink text-white"
                        : "bg-gris-wash text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.texto || "—"}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        m.direccion === "out" ? "text-white/60" : "text-muted"
                      }`}
                    >
                      {hora(m.createdAt)}
                      {m.autorNombre ? ` · ${m.autorNombre}` : ""}
                    </p>
                  </div>
                ))}
              </div>
              {aviso && <p className="px-5 pb-2 text-sm text-rojo">{aviso}</p>}
              <form onSubmit={enviar} className="flex gap-2 border-t border-line p-4">
                <input type="hidden" name="conversacion_id" value={elegido.id} />
                <textarea
                  name="texto"
                  required
                  rows={1}
                  placeholder="Escribí el mensaje…"
                  className="min-h-[42px] flex-1 resize-none rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
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
                  Enviar
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
