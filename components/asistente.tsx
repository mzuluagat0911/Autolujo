"use client";

import Link from "next/link";
import { useState } from "react";
import { preguntarAsistente } from "@/app/asistente/actions";
import { trozosDeMensaje } from "@/lib/asistente/enlaces";
import type { ModuloId } from "@/lib/equipo/modulos";

type Burbuja = { rol: "user" | "assistant"; texto: string };

const EJEMPLOS = [
  "¿Cuánto debe hoy el carro 92?",
  "¿El domingo se cobra la cuota del acuerdo?",
  "¿Dónde veo el estado de cuenta?",
];

export function Asistente({ modulos }: { modulos: readonly ModuloId[] }) {
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
    const res = await preguntarAsistente(siguiente);
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
          className="fixed bottom-24 right-4 z-50 flex h-[min(36rem,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-xl bg-paper ring-1 ring-line sm:right-6"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Plataforma</p>
              <h2 className="text-sm font-semibold text-ink">Asistente</h2>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-ink"
            >
              Cerrar
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {mensajes.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Pregunta cómo funciona una pantalla o un dato de los módulos que tienes.
                </p>
                <div className="flex flex-col gap-2">
                  {ejemplos.map((ej) => (
                    <button
                      key={ej}
                      type="button"
                      onClick={() => enviar(ej)}
                      className="rounded-lg px-3 py-2 text-left text-sm text-ink ring-1 ring-line hover:bg-surface-2"
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
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.rol === "user"
                    ? "ml-auto bg-ink text-white"
                    : "bg-surface-2 text-ink"
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
            {enviando && <p className="text-xs text-muted">Consultando…</p>}
          </div>

          <form
            className="flex items-end gap-2 border-t border-line p-3"
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
              placeholder="Pregunta algo"
              disabled={enviando}
              className="min-h-11 flex-1 resize-none rounded-lg bg-paper px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="rounded-lg bg-ink px-3 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
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
        className="fixed bottom-5 right-4 z-50 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black sm:right-6"
      >
        {abierto ? "Ocultar" : "Asistente"}
      </button>
    </div>
  );
}
