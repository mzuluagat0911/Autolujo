"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  accionDevolverAgente,
  accionMarcarLeida,
  accionTomarChat,
  cargarBandeja,
  cargarDetalle,
  enviarRespuestaHumana,
} from "./actions";
import type { ConversacionDetalle, ConversacionLista, FiltroBandeja, Mensaje } from "./types";
import {
  formatSaldo,
  horaMensaje,
  placaConv,
  telefonoBonito,
  tiempoRelativo,
  tituloConv,
} from "./utils";

const RESPUESTAS_RAPIDAS = [
  "Recibí tu mensaje, te confirmo en un momento.",
  "¿Me puedes enviar el comprobante de pago, por favor?",
  "Tu pago ya quedó registrado. ¡Gracias!",
  "¿A qué número de carro corresponde el pago?",
];

const POLL_MS = 8_000;

type Props = {
  inicial: ConversacionLista[];
  errorInicial?: string | null;
  seleccionInicial?: ConversacionDetalle | null;
};

export function InboxConversaciones({ inicial, errorInicial, seleccionInicial }: Props) {
  const [convs, setConvs] = useState(inicial);
  const [filtro, setFiltro] = useState<FiltroBandeja>("todas");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(seleccionInicial?.id ?? null);
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(seleccionInicial ?? null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState<string | null>(errorInicial ?? null);
  const [flash, setFlash] = useState<string | null>(null);

  // Sync URL without full navigation friction on desktop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = selectedId
      ? `/cartera/conversaciones/${selectedId}`
      : "/cartera/conversaciones";
    if (window.location.pathname !== url) {
      window.history.replaceState(null, "", url);
    }
  }, [selectedId]);

  // Marcar leída al abrir.
  useEffect(() => {
    if (!selectedId) return;
    void accionMarcarLeida(selectedId).then(() => {
      setConvs((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, no_leidos: 0 } : c)),
      );
    });
  }, [selectedId]);

  // Polling suave de bandeja + detalle abierto.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const { convs: next, error: err } = await cargarBandeja();
      if (cancelled) return;
      if (err) return;
      setConvs(next);
      if (selectedId) {
        const { detalle: d } = await cargarDetalle(selectedId);
        if (cancelled || !d) return;
        setDetalle(d);
        setConvs((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, no_leidos: 0 } : c)),
        );
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selectedId]);

  async function abrir(id: string) {
    if (id === selectedId && detalle) return;
    setSelectedId(id);
    setCargandoDetalle(true);
    setError(null);
    const { detalle: d, error: err } = await cargarDetalle(id);
    setCargandoDetalle(false);
    if (err) {
      setError(err);
      return;
    }
    setDetalle(d);
  }

  function cerrarDetalle() {
    setSelectedId(null);
    setDetalle(null);
  }

  const filtradas = filtrar(convs, filtro, q);
  const contadores = {
    todas: convs.length,
    responder: convs.filter((c) => c.necesita_humano).length,
    humano: convs.filter((c) => c.modo === "humano").length,
    agente: convs.filter((c) => c.modo === "agente").length,
  };

  return (
    <div className="-mx-5 flex h-[calc(100dvh-3rem)] flex-col sm:-mx-8 lg:-mx-12 md:h-dvh">
      <header className="shrink-0 border-b border-line bg-ink px-5 py-4 text-surface sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-gold">Cartera</p>
            <h1 className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              Conversaciones
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-white/55">
            {contadores.responder > 0 && (
              <span className="rounded-md bg-gold/20 px-2.5 py-1 text-xs font-medium text-gold ring-1 ring-gold/30">
                {contadores.responder} por responder
              </span>
            )}
            <span className="hidden text-xs sm:inline">{contadores.todas} chats</span>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <aside
          className={`flex w-full shrink-0 flex-col border-r border-line bg-surface md:w-[22rem] lg:w-[26rem] ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="shrink-0 space-y-3 border-b border-line p-3">
            <label className="relative block">
              <span className="sr-only">Buscar</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar carro, cliente o teléfono…"
                className="w-full rounded-md bg-paper py-2.5 pl-9 pr-3 text-sm ring-1 ring-line placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            </label>
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {(
                [
                  ["todas", "Todas"],
                  ["responder", "Responder"],
                  ["humano", "En humano"],
                  ["agente", "Agente"],
                ] as const
              ).map(([key, label]) => {
                const active = filtro === key;
                const n = contadores[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFiltro(key)}
                    className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] transition ${
                      active
                        ? "bg-ink text-surface"
                        : "bg-paper text-muted ring-1 ring-line hover:text-ink"
                    }`}
                  >
                    {label}
                    {n > 0 && key !== "todas" ? ` · ${n}` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtradas.map((c) => (
              <ConvRow
                key={c.id}
                c={c}
                active={c.id === selectedId}
                onSelect={() => void abrir(c.id)}
              />
            ))}
            {filtradas.length === 0 && (
              <p className="px-5 py-12 text-center text-sm text-muted">
                {convs.length === 0
                  ? "Aún no hay conversaciones. Cuando un cliente escriba al WhatsApp, aparecerá aquí."
                  : "Nada coincide con este filtro."}
              </p>
            )}
          </div>
        </aside>

        {/* Chat */}
        <section
          className={`min-w-0 flex-1 flex-col bg-paper ${selectedId ? "flex" : "hidden md:flex"}`}
        >
          {!selectedId && (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 h-[2px] w-12 bg-gold" />
              <p className="font-serif text-xl font-bold">Elige un chat</p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Responde a clientes, toma el control del agente y envía mensajes por el mismo
                WhatsApp.
              </p>
            </div>
          )}

          {selectedId && cargandoDetalle && !detalle && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Cargando conversación…
            </div>
          )}

          {selectedId && detalle && (
            <ChatPanel
              detalle={detalle}
              onBack={cerrarDetalle}
              onRefresh={async () => {
                const [{ detalle: d }, { convs: next }] = await Promise.all([
                  cargarDetalle(detalle.id),
                  cargarBandeja(),
                ]);
                if (d) setDetalle(d);
                setConvs(next);
              }}
              onFlash={(msg) => {
                setFlash(msg);
                window.setTimeout(() => setFlash(null), 3200);
              }}
              onLocalPatch={(patch) => {
                setDetalle((prev) => (prev ? { ...prev, ...patch } : prev));
                setConvs((prev) =>
                  prev.map((c) =>
                    c.id === detalle.id
                      ? {
                          ...c,
                          modo: patch.modo ?? c.modo,
                          necesita_humano: patch.necesita_humano ?? c.necesita_humano,
                          no_leidos: patch.no_leidos ?? c.no_leidos,
                          ultimo_texto: patch.ultimo_texto ?? c.ultimo_texto,
                          ultimo_mensaje_at: patch.ultimo_mensaje_at ?? c.ultimo_mensaje_at,
                        }
                      : c,
                  ),
                );
              }}
            />
          )}
        </section>
      </div>

      {(error || flash) && (
        <div
          className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2.5 text-sm shadow-lg ${
            error ? "bg-crit text-white" : "bg-ink text-surface"
          }`}
        >
          {error ?? flash}
        </div>
      )}
    </div>
  );
}

function filtrar(convs: ConversacionLista[], filtro: FiltroBandeja, q: string) {
  const needle = q.trim().toLowerCase();
  return convs.filter((c) => {
    if (filtro === "responder" && !c.necesita_humano) return false;
    if (filtro === "humano" && c.modo !== "humano") return false;
    if (filtro === "agente" && c.modo !== "agente") return false;
    if (!needle) return true;
    const hay = [
      tituloConv(c),
      c.cliente?.nombre ?? "",
      c.wa_numero,
      c.etiqueta ?? "",
      c.ultimo_texto ?? "",
      c.vehiculo?.numero ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  });
}

function ConvRow({
  c,
  active,
  onSelect,
}: {
  c: ConversacionLista;
  active: boolean;
  onSelect: () => void;
}) {
  const unread = c.no_leidos > 0 || c.necesita_humano;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-3 border-b border-line px-4 py-3.5 text-left transition ${
        active ? "bg-gold-wash/60" : "hover:bg-surface-2"
      }`}
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-md font-serif text-[13px] font-bold ${
          c.necesita_humano ? "bg-gold text-ink" : "bg-ink text-gold"
        }`}
      >
        {placaConv(c)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>
            {tituloConv(c)}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-faint">
            {tiempoRelativo(c.ultimo_mensaje_at)}
          </span>
        </div>
        <p className="truncate text-[13px] text-muted">
          {c.cliente?.nombre ? `${c.cliente.nombre} · ` : ""}
          {c.ultimo_texto ?? "Sin mensajes"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {c.necesita_humano && <MiniChip tone="warn">Responder</MiniChip>}
          {c.modo === "humano" && !c.necesita_humano && <MiniChip tone="neutral">Humano</MiniChip>}
          {c.modo === "agente" && !c.necesita_humano && <MiniChip tone="good">Agente</MiniChip>}
          {c.no_leidos > 0 && (
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-ink px-1.5 text-[10px] font-semibold text-gold">
              {c.no_leidos}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ChatPanel({
  detalle,
  onBack,
  onRefresh,
  onFlash,
  onLocalPatch,
}: {
  detalle: ConversacionDetalle;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onFlash: (msg: string) => void;
  onLocalPatch: (patch: Partial<ConversacionDetalle> & Partial<ConversacionLista>) => void;
}) {
  const esHumano = detalle.modo === "humano";
  const [pending, startTransition] = useTransition();
  const [accionError, setAccionError] = useState<string | null>(null);

  function runAccion(fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, labelOk: string) {
    const fd = new FormData();
    fd.set("conversacion_id", detalle.id);
    setAccionError(null);
    startTransition(async () => {
      const r = await fn(fd);
      if (!r.ok) {
        setAccionError(r.error ?? "Algo falló.");
        return;
      }
      onFlash(labelOk);
      await onRefresh();
    });
  }

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-md p-1.5 text-muted hover:bg-paper hover:text-ink md:hidden"
              aria-label="Volver a la lista"
            >
              ←
            </button>
            <h2 className="truncate font-serif text-lg font-bold">{tituloConv(detalle)}</h2>
            {esHumano ? (
              <MiniChip tone="warn">Lo llevas tú</MiniChip>
            ) : (
              <MiniChip tone="good">Agente activo</MiniChip>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {detalle.cliente?.nombre ?? "Cliente sin vincular"}
            {detalle.cliente?.cedula ? ` · ${detalle.cliente.cedula}` : ""}
            {" · "}
            {telefonoBonito(detalle.wa_numero)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Saldo</p>
            <p className="font-serif text-lg font-bold tabular-nums">{formatSaldo(detalle.saldo)}</p>
          </div>
          {esHumano ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => runAccion(accionDevolverAgente, "Devuelto al agente")}
              className="rounded-md bg-surface px-3 py-2 text-xs font-medium ring-1 ring-line transition hover:bg-paper disabled:opacity-50"
            >
              Devolver al agente
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => runAccion(accionTomarChat, "Chat tomado")}
              className="rounded-md bg-ink px-3 py-2 text-xs font-medium text-surface transition hover:bg-black disabled:opacity-50"
            >
              Tomar chat
            </button>
          )}
        </div>
      </div>

      {detalle.necesita_humano && (
        <div className="shrink-0 bg-gold-wash px-4 py-2.5 text-sm ring-1 ring-inset ring-gold/20 sm:px-5">
          <b className="font-medium">Necesita respuesta.</b>{" "}
          {detalle.motivo_escalada
            ? `Motivo: ${detalle.motivo_escalada}`
            : "Hay un mensaje del cliente esperando."}
        </div>
      )}

      {accionError && (
        <div className="shrink-0 bg-crit/10 px-4 py-2 text-sm text-crit sm:px-5">{accionError}</div>
      )}

      <Thread mensajes={detalle.mensajes} />

      <Composer
        conversacionId={detalle.id}
        esHumano={esHumano}
        ventanaAbierta={detalle.ventana_abierta}
        onSent={async (texto) => {
          const ahora = new Date().toISOString();
          const optimistic: Mensaje = {
            id: `tmp-${Date.now()}`,
            direccion: "out",
            tipo: "text",
            texto,
            media_url: null,
            enviado_por: "Equipo",
            created_at: ahora,
          };
          onLocalPatch({
            mensajes: [...detalle.mensajes, optimistic],
            necesita_humano: false,
            no_leidos: 0,
            ultimo_texto: texto.slice(0, 140),
            ultimo_mensaje_at: ahora,
          });
          await onRefresh();
        }}
        onError={setAccionError}
      />
    </>
  );
}

function Thread({ mensajes }: { mensajes: Mensaje[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes.length, mensajes.at(-1)?.id]);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
      {mensajes.map((m) => {
        const out = m.direccion === "out";
        const system = m.tipo === "system";
        return (
          <div key={m.id} className={`flex ${system ? "justify-center" : out ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[min(78%,28rem)] rounded-lg px-3.5 py-2.5 text-sm ${
                system
                  ? "bg-crit/5 text-crit ring-1 ring-crit/20"
                  : out
                    ? "bg-ink text-surface"
                    : "bg-surface text-ink ring-1 ring-line"
              }`}
            >
              {m.signedUrl && (
                <a href={m.signedUrl} target="_blank" rel="noreferrer" className="mb-2 block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.signedUrl}
                    alt="Comprobante"
                    className="max-h-64 rounded-md object-contain"
                  />
                </a>
              )}
              {m.texto && <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p>}
              <p
                className={`mt-1 text-right text-[10px] tabular-nums ${
                  out && !system ? "text-surface/55" : "text-muted"
                }`}
              >
                {out && m.enviado_por ? `${m.enviado_por} · ` : ""}
                {horaMensaje(m.created_at)}
              </p>
            </div>
          </div>
        );
      })}
      {mensajes.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">Sin mensajes todavía.</p>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function Composer({
  conversacionId,
  esHumano,
  ventanaAbierta,
  onSent,
  onError,
}: {
  conversacionId: string;
  esHumano: boolean;
  ventanaAbierta: boolean;
  onSent: (texto: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [pending, startTransition] = useTransition();
  const puede = esHumano && ventanaAbierta && !pending;

  function enviar(raw?: string) {
    const body = (raw ?? texto).trim();
    if (!body || !puede) return;
    onError(null);
    const fd = new FormData();
    fd.set("conversacion_id", conversacionId);
    fd.set("texto", body);
    startTransition(async () => {
      const r = await enviarRespuestaHumana(fd);
      if (!r.ok) {
        onError(r.error ?? "No se pudo enviar.");
        return;
      }
      setTexto("");
      await onSent(body);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    enviar();
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface px-3 py-3 sm:px-5">
      {!esHumano && (
        <p className="mb-2 text-xs text-muted">
          El agente está manejando este chat. Pulsa <b className="font-medium">Tomar chat</b> para
          escribir tú.
        </p>
      )}
      {esHumano && !ventanaAbierta && (
        <p className="mb-2 rounded-md bg-gold-wash px-3 py-2 text-xs text-muted ring-1 ring-gold/25">
          Ventana de 24h cerrada. El cliente debe escribir primero para poder responder por texto.
        </p>
      )}

      {esHumano && ventanaAbierta && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {RESPUESTAS_RAPIDAS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={pending}
              onClick={() => enviar(r)}
              className="shrink-0 rounded-md bg-paper px-2.5 py-1.5 text-[11px] text-muted ring-1 ring-line transition hover:text-ink disabled:opacity-40"
            >
              {r.length > 42 ? r.slice(0, 40) + "…" : r}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={
            !esHumano
              ? "Toma el chat para escribir…"
              : !ventanaAbierta
                ? "Ventana de 24h cerrada"
                : "Escribe tu respuesta… (Enter envía)"
          }
          disabled={!esHumano || !ventanaAbierta || pending}
          className="flex-1 resize-none rounded-md bg-paper px-3.5 py-2.5 text-sm ring-1 ring-line placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!puede || !texto.trim()}
          className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-surface transition hover:bg-black disabled:opacity-40"
        >
          {pending ? "…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}

function MiniChip({
  tone,
  children,
}: {
  tone: "good" | "warn" | "neutral";
  children: ReactNode;
}) {
  const map = {
    good: "text-good border-good/35",
    warn: "text-warn border-warn/35",
    neutral: "text-muted border-line",
  };
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" strokeLinecap="round" />
    </svg>
  );
}
