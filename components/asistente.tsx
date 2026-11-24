"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { preguntarAsistente } from "@/app/asistente/actions";
import { trozosDeMensaje } from "@/lib/asistente/enlaces";
import type { ModuloId } from "@/lib/equipo/modulos";

type Burbuja = { rol: "user" | "assistant"; texto: string };

const EJEMPLOS = [
  "¿Cuánto debe hoy el 92?",
  "¿Dónde bajo INFORMES?",
  "¿Cuántos seguimientos vencidos hay?",
];

function IconoBurbuja({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function Asistente({ modulos }: { modulos: readonly ModuloId[] }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [mensajes, setMensajes] = useState<Burbuja[]>([]);
  const [enviando, setEnviando] = useState(false);
  const puedeCobrar = modulos.includes("cartera") || modulos.includes("resumen");
  const ejemplos = puedeCobrar ? EJEMPLOS : EJEMPLOS.slice(1);

  async function enviar(pregunta?: string) {
    const limpio = (pregunta ?? texto).trim();
    if (!limpio || enviando) return;
    const siguiente = [...mensajes, { rol: "user" as const, texto: limpio }];
    setMensajes(siguiente);
    setTexto("");
    setEnviando(true);
    const res = await preguntarAsistente(siguiente, pathname);
    setMensajes((prev) => [
      ...prev,
      {
        rol: "assistant",
        texto: res.ok ? res.texto : res.error,
      },
    ]);
    setEnviando(false);
  }

  return (
    <div className="print:hidden">
      {abierto && (
        <section
          role="dialog"
          aria-label="Asistente de la plataforma"
          className="fixed bottom-28 right-4 z-50 flex h-[min(36rem,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-paper shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-line sm:right-6"
        >
          <header className="flex items-center justify-between border-b border-line bg-surface-2/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white">
                <IconoBurbuja />
              </span>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted">AutoLujo</p>
                <h2 className="text-sm font-semibold text-ink">¿En qué te ayudo?</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-full px-2.5 py-1 text-sm text-muted hover:bg-paper hover:text-ink"
            >
              Cerrar
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {mensajes.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted">
                  Pregúntame por un carro, un cobro, un reporte o dónde está una pantalla. Te respondo con lo que hay en la base.
                </p>
                <div className="flex flex-col gap-2">
                  {ejemplos.map((ej) => (
                    <button
                      key={ej}
                      type="button"
                      onClick={() => enviar(ej)}
                      className="rounded-xl px-3 py-2.5 text-left text-sm text-ink ring-1 ring-line transition hover:bg-surface-2"
                    >
                      {ej}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((m, i) => (
              <p
                key={`${m.rol}-${i}`}
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.rol === "user"
                    ? "ml-auto rounded-br-md bg-ink text-white"
                    : "rounded-bl-md bg-surface-2 text-ink"
                }`}
              >
                {m.rol === "assistant" ? (
                  trozosDeMensaje(m.texto, modulos).map((t, j) =>
                    t.tipo === "link" ? (
                      <Link
                        key={j}
                        href={t.href}
                        onClick={() => setAbierto(false)}
                        className="font-medium underline underline-offset-2"
                      >
                        {t.texto}
                      </Link>
                    ) : (
                      <span key={j}>{t.texto}</span>
                    ),
                  )
                ) : (
                  m.texto
                )}
              </p>
            ))}
            {enviando && <p className="text-xs text-muted">Un momento…</p>}
          </div>

          <form
            className="flex items-end gap-2 border-t border-line bg-surface-2/40 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              rows={2}
              placeholder="Escribe tu pregunta…"
              disabled={enviando}
              className="min-h-11 flex-1 resize-none rounded-xl bg-paper px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="rounded-xl bg-ink px-3.5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={abierto ? "Ocultar asistente" : "Abrir asistente"}
        className="fixed bottom-16 right-4 z-50 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:bg-black hover:shadow-[0_10px_28px_rgba(0,0,0,0.22)] sm:right-6"
      >
        <IconoBurbuja />
        <span>{abierto ? "Ocultar" : "Asistente"}</span>
      </button>
    </div>
  );
}
