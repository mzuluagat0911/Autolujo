"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/kit";
import {
  cargarBandejaComercial,
  cargarHiloComercial,
  enviarRespuestaComercial,
} from "./actions";
import type { ChatComercial, MensajeComercial } from "@/lib/comercial/chats";

const POLL_MS = 6_000;

function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-PA", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });
}

function telefono(n: string): string {
  const d = n.replace(/\D/g, "");
  if (d.startsWith("507") && d.length === 11) return `+507 ${d.slice(3, 7)}-${d.slice(7)}`;
  return n.startsWith("+") ? n : `+${n}`;
}

export function BandejaComercial({
  inicial,
  errorInicial,
}: {
  inicial: ChatComercial[];
  errorInicial: string | null;
}) {
  const [chats, setChats] = useState(inicial);
  const [error, setError] = useState(errorInicial);
  const [sel, setSel] = useState<string | null>(inicial[0]?.id ?? null);
  const [mensajes, setMensajes] = useState<MensajeComercial[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight });
  }, [mensajes]);

  useEffect(() => {
    if (!sel) return;
    start(async () => {
      const hilo = await cargarHiloComercial(sel);
      setMensajes(hilo.mensajes);
    });
  }, [sel]);

  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const lista = await cargarBandejaComercial();
      setChats(lista.chats);
      setError(lista.error);
      if (sel) {
        const hilo = await cargarHiloComercial(sel);
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
      const r = await enviarRespuestaComercial(data);
      if (!r.ok) {
        setAviso(r.error ?? "No se pudo enviar.");
        return;
      }
      setAviso(null);
      form.reset();
      if (sel) {
        const hilo = await cargarHiloComercial(sel);
        setMensajes(hilo.mensajes);
      }
      const lista = await cargarBandejaComercial();
      setChats(lista.chats);
    });
  }

  return (
    <div className="-mx-5 flex h-[calc(100dvh-3rem)] flex-col sm:-mx-8 lg:-mx-12 md:h-dvh">
      <header className="shrink-0 border-b border-line bg-surface px-5 py-4 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Comercial</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Chats de ventas</h1>
          <Link href="/comercial/citas" className="text-sm font-medium text-ink underline-offset-2 hover:underline">
            Citas
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">Número de Lucía. Los chats de cobranza no aparecen aquí.</p>
      </header>

      {error && (
        <p className="shrink-0 border-b border-line bg-ambar-wash px-5 py-2 text-sm text-ambar">{error}</p>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className={`${sel ? "hidden sm:block" : "block"} w-full shrink-0 overflow-y-auto border-r border-line bg-surface sm:w-80`}>
          {chats.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Sin chats de ventas"
                hint="Cuando alguien escriba al número comercial, el hilo queda en esta ventana."
              />
            </div>
          ) : (
            chats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSel(c.id)}
                className={`block w-full border-b border-line px-4 py-3 text-left hover:bg-surface-2 ${
                  c.id === sel ? "bg-surface-2" : "bg-surface"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{telefono(c.waNumero)}</span>
                  {c.noLeidos > 0 && (
                    <span className="rounded-full bg-ink px-1.5 text-[11px] font-medium text-white">{c.noLeidos}</span>
                  )}
                </div>
                <p className="mt-1 truncate text-[12px] text-muted">{c.ultimoTexto || "Sin mensajes"}</p>
                {c.necesitaHumano && (
                  <p className="mt-1 text-[11px] font-medium text-ambar">{c.motivo || "Hay que tomar este chat"}</p>
                )}
              </button>
            ))
          )}
        </aside>

        <section className={`${sel ? "flex" : "hidden"} min-w-0 flex-1 flex-col sm:flex`}>
          {!elegido ? (
            <div className="m-6">
              <EmptyState title="Elige un chat" hint="Cada hilo es del número de ventas." />
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-line px-5 py-3">
                <button type="button" onClick={() => setSel(null)} className="mb-1 text-[12px] text-muted sm:hidden">
                  Volver a los chats
                </button>
                <p className="text-sm font-medium">{telefono(elegido.waNumero)}</p>
                {elegido.anuncio && <p className="mt-1 text-[12px] text-azul">Campaña: {elegido.anuncio}</p>}
                {elegido.campanaId && (
                  <p className="mt-0.5 text-[11px] text-muted">Id Meta {elegido.campanaId}</p>
                )}
              </div>
              <div ref={fondo} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-paper px-5 py-4">
                {mensajes.map((m) => (
                  <div key={m.id} className={`flex ${m.direccion === "out" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[36rem] rounded-lg px-3 py-2 text-sm ${
                        m.direccion === "out" ? "bg-ink text-white" : "bg-surface-2 text-ink"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.texto}</p>
                      <p className={`mt-1 text-[10px] ${m.direccion === "out" ? "text-white/60" : "text-muted"}`}>
                        {m.direccion === "out" ? "Ventas" : "Cliente"} · {hora(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={enviar} className="shrink-0 border-t border-line bg-surface px-4 py-3">
                <input type="hidden" name="conversacion_id" value={elegido.id} />
                {aviso && <p className="mb-2 text-sm text-rojo">{aviso}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    name="texto"
                    required
                    rows={2}
                    placeholder="Escribir desde el número de ventas"
                    className="min-h-[44px] flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint"
                  />
                  <button
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
    </div>
  );
}
