"use client";

import {
  useEffect,
  useLayoutEffect,
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
  enviarAudioHumano,
  enviarRespuestaHumana,
} from "./actions";
import type { ConversacionDetalle, ConversacionLista, FiltroBandeja, Mensaje } from "./types";
import { NOMBRE_AGENTE } from "@/lib/ai/identidad";
import {
  demoDetalle,
  demoRespuestaAgente,
} from "./demo-data";
import {
  formatSaldo,
  horaMensaje,
  placaConv,
  telefonoBonito,
  tiempoRelativo,
  tituloConv,
} from "./utils";
import { FiltersBar, Toast } from "@/components/kit";

const RESPUESTAS_RAPIDAS = [
  "Recibí su mensaje, le confirmo en un momento.",
  "¿Me puede enviar el comprobante de pago, por favor?",
  "Su pago ya quedó registrado. Gracias.",
  "¿A qué número de carro corresponde el pago?",
];

/** Lista: cada 6s. Chat abierto: cada 2.5s. Pausa si la pestaña está oculta. */
const POLL_LISTA_MS = 6_000;
const POLL_CHAT_MS = 2_500;

function esNotaDeVoz(m: Mensaje): boolean {
  if (m.tipo === "audio") return true;
  const p = (m.media_url ?? "").toLowerCase();
  return /chat-audio\/|\.(ogg|opus|wav|mp3|m4a|webm|aac)(\?|$)/i.test(p);
}

function conservarSignedUrls(prev: Mensaje[] | undefined, next: Mensaje[]): Mensaje[] {
  if (!prev?.length) return next;
  const map = new Map(prev.filter((m) => m.signedUrl && m.media_url).map((m) => [m.id, m]));
  return next.map((m) => {
    const old = map.get(m.id);
    if (old && old.media_url === m.media_url && old.signedUrl) {
      return m.signedUrl ? m : { ...m, signedUrl: old.signedUrl };
    }
    return m;
  });
}

function aplicarDetalle(
  prev: ConversacionDetalle | null,
  next: ConversacionDetalle,
): ConversacionDetalle {
  if (!prev || prev.id !== next.id) return next;
  return {
    ...next,
    mensajes: conservarSignedUrls(prev.mensajes, next.mensajes),
  };
}

type Props = {
  inicial: ConversacionLista[];
  errorInicial?: string | null;
  seleccionInicial?: ConversacionDetalle | null;
  demo?: boolean;
};

export function InboxConversaciones({
  inicial,
  errorInicial,
  seleccionInicial,
  demo = false,
}: Props) {
  const [convs, setConvs] = useState(inicial);
  const [filtro, setFiltro] = useState<FiltroBandeja>("todas");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(seleccionInicial?.id ?? null);
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(seleccionInicial ?? null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [configError] = useState<string | null>(errorInicial ?? null);
  const [toast, setToast] = useState<{ tone: "good" | "crit"; text: string } | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const listaScrollRef = useRef(0);
  /** Si el usuario bajó en la lista, no reordenamos filas en el poll (como WhatsApp). */
  const listaOrdenFijoRef = useRef<string[] | null>(null);
  const selectedIdRef = useRef(selectedId);
  const detalleRef = useRef(detalle);
  selectedIdRef.current = selectedId;
  detalleRef.current = detalle;

  function guardarScrollLista() {
    const el = listaRef.current;
    if (el) listaScrollRef.current = el.scrollTop;
  }

  function aplicarBandeja(prev: ConversacionLista[], next: ConversacionLista[]): ConversacionLista[] {
    if (mismaBandeja(prev, next)) return prev;
    const el = listaRef.current;
    const abajo = (el?.scrollTop ?? listaScrollRef.current) > 64;
    if (!abajo) {
      listaOrdenFijoRef.current = null;
      return next;
    }
    // Mantén el orden que el usuario está viendo; solo actualiza datos y agrega chats nuevos al final.
    const byId = new Map(next.map((c) => [c.id, c]));
    const orden = listaOrdenFijoRef.current ?? prev.map((c) => c.id);
    listaOrdenFijoRef.current = orden;
    const out: ConversacionLista[] = [];
    const vistos = new Set<string>();
    for (const id of orden) {
      const row = byId.get(id);
      if (!row) continue;
      out.push(row);
      vistos.add(id);
    }
    for (const c of next) {
      if (!vistos.has(c.id)) out.push(c);
    }
    return out;
  }

  // Sync URL (preserva ?demo=1).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const base = selectedId
      ? `/cartera/conversaciones/${selectedId}`
      : "/cartera/conversaciones";
    const url = demo ? `${base}?demo=1` : base;
    if (window.location.pathname + window.location.search !== url) {
      window.history.replaceState(null, "", url);
    }
  }, [selectedId, demo]);

  // Marcar leída al abrir (solo datos reales).
  useEffect(() => {
    if (!selectedId || demo) return;
    void accionMarcarLeida(selectedId).then(() => {
      setConvs((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, no_leidos: 0 } : c)),
      );
    });
  }, [selectedId, demo]);

  // Polling: lista cada 6s; chat abierto cada 2.5s. Pausa si la pestaña está oculta.
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    let timer: number | null = null;

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      const ms = selectedIdRef.current ? POLL_CHAT_MS : POLL_LISTA_MS;
      timer = window.setTimeout(() => {
        void tick();
      }, ms);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }
      const { convs: next, error: err } = await cargarBandeja();
      if (cancelled || err) {
        schedule();
        return;
      }
      guardarScrollLista();
      setConvs((prev) => aplicarBandeja(prev, next));

      const sid = selectedIdRef.current;
      if (sid) {
        const row = next.find((c) => c.id === sid);
        const cur = detalleRef.current;
        const sinCambio =
          cur?.id === sid &&
          row &&
          cur.ultimo_mensaje_at === row.ultimo_mensaje_at &&
          cur.necesita_humano === row.necesita_humano &&
          cur.modo === row.modo &&
          (cur.ultimo_texto ?? "") === (row.ultimo_texto ?? "");
        if (!sinCambio) {
          const { detalle: d } = await cargarDetalle(sid);
          if (!cancelled && d && selectedIdRef.current === sid) {
            setDetalle((prev) => aplicarDetalle(prev, d));
            setConvs((prev) => prev.map((c) => (c.id === sid ? { ...c, no_leidos: 0 } : c)));
          }
        }
      }
      schedule();
    };

    const onVis = () => {
      if (!document.hidden) void tick();
      else if (timer) window.clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", onVis);
    schedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [demo]);

  // Restaura el scroll de la lista antes del paint, sin animación.
  useLayoutEffect(() => {
    const el = listaRef.current;
    if (!el) return;
    if (Math.abs(el.scrollTop - listaScrollRef.current) > 1) {
      el.scrollTop = listaScrollRef.current;
    }
  }, [convs]);

  function showToast(tone: "good" | "crit", text: string) {
    setToast({ tone, text });
    window.setTimeout(() => setToast(null), 3200);
  }

  async function abrir(id: string) {
    if (id === selectedId && detalle?.id === id && !cargandoDetalle) return;
    guardarScrollLista();
    setSelectedId(id);
    if (demo) {
      const d = demoDetalle(id);
      setDetalle(d);
      setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, no_leidos: 0 } : c)));
      return;
    }
    // No dejes el chat anterior en pantalla: evita el salto/parpadeo al cambiar.
    if (detalle?.id !== id) setDetalle(null);
    setCargandoDetalle(true);
    const { detalle: d, error: err } = await cargarDetalle(id);
    if (selectedIdRef.current !== id) return;
    setCargandoDetalle(false);
    if (err) {
      showToast("crit", err);
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
      <header className="shrink-0 border-b border-line bg-surface px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Cartera</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Conversaciones</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            {contadores.responder > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ambar-wash px-2.5 py-1 text-xs font-medium text-ambar">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {contadores.responder} por responder
              </span>
            )}
            <span className="hidden text-xs sm:inline">{contadores.todas} chats</span>
          </div>
        </div>
      </header>

      {demo && (
        <div className="shrink-0 border-b border-line bg-surface-2 px-5 py-2 text-center text-xs text-muted sm:px-6">
          <span className="font-medium text-ink">Modo demo</span> — conversaciones de ejemplo. En
          producción los mensajes llegan en vivo desde WhatsApp y el agente responde automáticamente.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <aside
          className={`flex w-full shrink-0 flex-col border-r border-line bg-surface md:w-[22rem] lg:w-[26rem] ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="shrink-0 space-y-3 border-b border-line p-3">
            <FiltersBar
              variant="bare"
              search={{ value: q, onChange: setQ }}
              searchPlaceholder="Buscar carro, cliente o teléfono…"
              chips={[
                { id: "todas", label: "Todas", count: contadores.todas },
                { id: "responder", label: "Responder", count: contadores.responder },
                { id: "humano", label: "En humano", count: contadores.humano },
                { id: "agente", label: "Agente", count: contadores.agente },
              ]}
              activeChip={filtro}
              onChip={(id) => setFiltro(id as FiltroBandeja)}
            />
          </div>

          <div
            ref={listaRef}
            onScroll={() => {
              const el = listaRef.current;
              if (!el) return;
              listaScrollRef.current = el.scrollTop;
              // Volvió arriba: el próximo poll puede reordenar con normalidad.
              if (el.scrollTop <= 64) listaOrdenFijoRef.current = null;
            }}
            className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
          >
            {configError && (
              <div className="m-3 rounded-md bg-crit/10 px-3 py-2.5 text-xs text-crit ring-1 ring-crit/20">
                {configError}
              </div>
            )}
            {filtradas.map((c) => (
              <ConvRow
                key={c.id}
                c={c}
                active={c.id === selectedId}
                onSelect={() => void abrir(c.id)}
              />
            ))}
            {filtradas.length === 0 && !configError && (
              <p className="px-5 py-12 text-center text-sm text-muted">
                {convs.length === 0 ? (
                  <>
                    Aún no hay conversaciones. Cuando un cliente escriba al WhatsApp, aparecerá aquí.
                    <br />
                    <a
                      href="/cartera/conversaciones?demo=1"
                      className="mt-3 inline-block text-azul underline-offset-2 hover:underline"
                    >
                      Ver demo con conversaciones de ejemplo →
                    </a>
                  </>
                ) : (
                  "Nada coincide con este filtro."
                )}
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
              <div className="mb-4 h-[2px] w-12 bg-line-strong" />
              <p className="text-xl font-bold">Elige un chat</p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Responde a clientes, toma el control del agente y envía mensajes por el mismo
                WhatsApp.
              </p>
            </div>
          )}

          {selectedId && (cargandoDetalle || !detalle || detalle.id !== selectedId) && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Cargando conversación…
            </div>
          )}

          {selectedId && detalle && detalle.id === selectedId && (
            <ChatPanel
              key={detalle.id}
              detalle={detalle}
              demo={demo}
              onBack={cerrarDetalle}
              onRefresh={async () => {
                if (demo) {
                  const d = demoDetalle(detalle.id);
                  if (d) setDetalle(d);
                  return;
                }
                const [{ detalle: d }, { convs: next }] = await Promise.all([
                  cargarDetalle(detalle.id),
                  cargarBandeja(),
                ]);
                if (d) setDetalle((prev) => (prev ? aplicarDetalle(prev, d) : d));
                guardarScrollLista();
                setConvs((prev) => aplicarBandeja(prev, next));
              }}
              onFlash={(msg) => showToast("good", msg)}
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
              onDemoAgentReply={(msgs, ultimo) => {
                setDetalle((prev) =>
                  prev ? { ...prev, mensajes: msgs, ultimo_texto: ultimo, ultimo_mensaje_at: new Date().toISOString() } : prev,
                );
                setConvs((prev) =>
                  prev.map((c) =>
                    c.id === detalle.id ? { ...c, ultimo_texto: ultimo, ultimo_mensaje_at: new Date().toISOString() } : c,
                  ),
                );
              }}
            />
          )}
        </section>
      </div>

      {toast && (
        <Toast
          message={toast.text}
          tone={toast.tone}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

function mismaBandeja(a: ConversacionLista[], b: ConversacionLista[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (
      x.id !== y.id ||
      x.ultimo_mensaje_at !== y.ultimo_mensaje_at ||
      x.ultimo_texto !== y.ultimo_texto ||
      x.no_leidos !== y.no_leidos ||
      x.necesita_humano !== y.necesita_humano ||
      x.modo !== y.modo
    ) {
      return false;
    }
  }
  return true;
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
  const unread = c.no_leidos > 0;
  const rowBg = active
    ? "bg-gris-wash"
    : unread
      ? "bg-azul-wash/70 hover:bg-azul-wash"
      : "hover:bg-surface-2";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-3 border-b border-line px-4 py-3.5 text-left transition ${rowBg} ${
        unread && !active ? "border-l-2 border-l-azul pl-[14px]" : ""
      }`}
    >
      <div
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[13px] font-bold ${
          c.necesita_humano ? "bg-ambar text-white" : unread ? "bg-azul text-white" : "bg-ink text-white"
        }`}
      >
        {placaConv(c)}
        {unread && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-azul ring-2 ring-surface" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${unread || c.necesita_humano ? "font-semibold text-ink" : "font-medium"}`}>
            {tituloConv(c)}
          </span>
          <span
            className={`shrink-0 text-[10px] tabular-nums ${
              unread ? "font-semibold text-azul" : "text-faint"
            }`}
          >
            {tiempoRelativo(c.ultimo_mensaje_at)}
          </span>
        </div>
        <p className={`truncate text-[13px] ${unread ? "font-medium text-ink" : "text-muted"}`}>
          {c.cliente?.nombre ? `${c.cliente.nombre} · ` : ""}
          {c.ultimo_texto ?? "Sin mensajes"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {c.necesita_humano && c.modo === "agente" && (
            <MiniChip tone="warn">Ayuda pedida</MiniChip>
          )}
          {c.necesita_humano && c.modo === "humano" && (
            <MiniChip tone="warn">Responder</MiniChip>
          )}
          {c.modo === "humano" && !c.necesita_humano && <MiniChip tone="neutral">Humano</MiniChip>}
          {c.modo === "agente" && !c.necesita_humano && <MiniChip tone="good">Agente</MiniChip>}
          {unread && (
            <span className="inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-azul px-1.5 py-0.5 text-[10px] font-bold text-white">
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
  demo,
  onBack,
  onRefresh,
  onFlash,
  onLocalPatch,
  onDemoAgentReply,
}: {
  detalle: ConversacionDetalle;
  demo?: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onFlash: (msg: string) => void;
  onLocalPatch: (patch: Partial<ConversacionDetalle> & Partial<ConversacionLista>) => void;
  onDemoAgentReply?: (msgs: Mensaje[], ultimo: string) => void;
}) {
  const esHumano = detalle.modo === "humano";
  const [pending, startTransition] = useTransition();
  const [accionError, setAccionError] = useState<string | null>(null);
  const [agenteEscribiendo, setAgenteEscribiendo] = useState(false);

  function runAccion(fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, labelOk: string) {
    if (demo) {
      setAccionError(null);
      const tomar = fn === accionTomarChat;
      onLocalPatch({
        modo: tomar ? "humano" : "agente",
        necesita_humano: false,
        motivo_escalada: tomar ? detalle.motivo_escalada : null,
      });
      onFlash(labelOk);
      return;
    }
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

  function simularCliente(texto: string) {
    if (!demo || esHumano) return;
    const ahora = new Date().toISOString();
    const msgIn: Mensaje = {
      id: `demo-in-${Date.now()}`,
      direccion: "in",
      tipo: "text",
      texto,
      media_url: null,
      enviado_por: null,
      created_at: ahora,
    };
    const msgs = [...detalle.mensajes, msgIn];
    onLocalPatch({
      mensajes: msgs,
      ultimo_texto: texto.slice(0, 140),
      ultimo_mensaje_at: ahora,
      ultimo_entrante_at: ahora,
    });
    setAgenteEscribiendo(true);
    window.setTimeout(() => {
      const respuesta = demoRespuestaAgente(texto);
      const msgOut: Mensaje = {
        id: `demo-out-${Date.now()}`,
        direccion: "out",
        tipo: "text",
        texto: respuesta,
        media_url: null,
        enviado_por: null,
        created_at: new Date().toISOString(),
      };
      setAgenteEscribiendo(false);
      onDemoAgentReply?.([...msgs, msgOut], respuesta.slice(0, 140));
    }, 1400);
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
            <h2 className="truncate text-lg font-bold">{tituloConv(detalle)}</h2>
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
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Hoy</p>
            <p className="text-lg font-bold tabular-nums">{formatSaldo(detalle.saldo)}</p>
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
              onClick={() => runAccion(accionTomarChat, "Chat tomado — el agente ya no responde")}
              className={`rounded-md px-3 py-2 text-xs font-medium text-surface transition hover:bg-black disabled:opacity-50 ${
                detalle.necesita_humano ? "bg-ambar" : "bg-ink"
              }`}
            >
              {detalle.necesita_humano ? "Tomar control" : "Tomar chat"}
            </button>
          )}
        </div>
      </div>

      {detalle.necesita_humano && !esHumano && (
        <div className="shrink-0 bg-ambar-wash px-4 py-2.5 text-sm text-ambar ring-1 ring-inset ring-ambar/25 sm:px-5">
          <b className="font-semibold">El agente pidió ayuda</b>
          {detalle.motivo_escalada ? ` — ${detalle.motivo_escalada}` : "."}{" "}
          Sigue respondiendo lo que puede. Pulsá <b className="font-semibold">Tomar control</b> para
          callarlo y escribir vos (texto o audio).
        </div>
      )}

      {detalle.necesita_humano && esHumano && (
        <div className="shrink-0 bg-ambar-wash px-4 py-2.5 text-sm text-ambar ring-1 ring-inset ring-ambar/25 sm:px-5">
          <b className="font-semibold">Lo llevás vos.</b>{" "}
          {detalle.motivo_escalada
            ? `Motivo: ${detalle.motivo_escalada}`
            : "Hay un mensaje del cliente esperando."}
        </div>
      )}

      {accionError && (
        <div className="shrink-0 bg-crit/10 px-4 py-2 text-sm text-crit sm:px-5">{accionError}</div>
      )}

      <Thread
        conversacionId={detalle.id}
        mensajes={detalle.mensajes}
        agenteEscribiendo={agenteEscribiendo}
      />

      {demo && !esHumano && (
        <div className="shrink-0 border-t border-line bg-paper px-4 py-2 sm:px-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Simular cliente (demo)
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              "¿Cuánto debo hoy?",
              "Te mando el comprobante en un rato",
              "Gracias por la info",
            ].map((t) => (
              <button
                key={t}
                type="button"
                disabled={agenteEscribiendo}
                onClick={() => simularCliente(t)}
                className="rounded-md bg-surface px-2.5 py-1.5 text-xs text-muted ring-1 ring-line transition hover:text-ink disabled:opacity-40"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <Composer
        conversacionId={detalle.id}
        esHumano={esHumano}
        ventanaAbierta={detalle.ventana_abierta}
        demo={demo}
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
          if (!demo) await onRefresh();
        }}
        onError={setAccionError}
      />
    </>
  );
}

function Thread({
  conversacionId,
  mensajes,
  agenteEscribiendo = false,
}: {
  conversacionId: string;
  mensajes: Mensaje[];
  agenteEscribiendo?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prevLastIdRef = useRef<string | null>(null);
  const prevConvRef = useRef<string | null>(null);
  const [mostrarIrAbajo, setMostrarIrAbajo] = useState(false);
  const lastId = mensajes.at(-1)?.id ?? null;

  // flex-col-reverse: scrollTop ≈ 0 = abajo (último mensaje).
  function syncNearBottom() {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollTop < 80;
    nearBottomRef.current = near;
    setMostrarIrAbajo(!near && mensajes.length > 0);
  }

  function pegarAbajoSiCorresponde() {
    if (!nearBottomRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }

  function irAlFinal() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = 0;
    nearBottomRef.current = true;
    setMostrarIrAbajo(false);
  }

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const switched = prevConvRef.current !== conversacionId;
    if (switched) {
      prevConvRef.current = conversacionId;
      prevLastIdRef.current = null;
      nearBottomRef.current = true;
      setMostrarIrAbajo(false);
      el.scrollTop = 0;
    }

    const prev = prevLastIdRef.current;
    const newTail = lastId != null && lastId !== prev;
    prevLastIdRef.current = lastId;

    if (switched) return;

    if (newTail || agenteEscribiendo) {
      if (nearBottomRef.current || agenteEscribiendo) {
        el.scrollTop = 0;
        nearBottomRef.current = true;
        setMostrarIrAbajo(false);
      } else if (newTail) {
        setMostrarIrAbajo(true);
      }
    }
  }, [conversacionId, lastId, agenteEscribiendo, mensajes.length]);

  // Si una foto termina de cargar y el alto cambia, re-ancla solo si ya estabas abajo.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onLoad = (ev: Event) => {
      const t = ev.target;
      if (!(t instanceof HTMLImageElement)) return;
      if (!el.contains(t)) return;
      pegarAbajoSiCorresponde();
    };
    el.addEventListener("load", onLoad, true);
    return () => el.removeEventListener("load", onLoad, true);
  }, [conversacionId]);

  const ordenVisual = [...mensajes].reverse();

  return (
    <div className="relative min-h-0 flex-1">
      <div
        key={conversacionId}
        ref={scrollerRef}
        onScroll={syncNearBottom}
        className="flex h-full flex-col-reverse gap-2 overflow-y-auto overscroll-contain px-4 py-3 [overflow-anchor:none] sm:px-5"
      >
        {agenteEscribiendo && (
          <div className="flex justify-end">
            <div className="rounded-2xl bg-ink/80 px-4 py-2.5 text-sm text-surface">
              <span className="inline-flex gap-1">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:150ms]">●</span>
                <span className="animate-pulse [animation-delay:300ms]">●</span>
              </span>
              <span className="ml-2 text-xs text-surface/70">{NOMBRE_AGENTE} escribiendo…</span>
            </div>
          </div>
        )}
        {ordenVisual.map((m) => {
          const out = m.direccion === "out";
          const system = m.tipo === "system";
          const audio = esNotaDeVoz(m);
          const transcript =
            m.texto &&
            !/^🎤\s*nota de voz$/i.test(m.texto.trim())
              ? m.texto.replace(/^🎤\s*/, "").trim()
              : null;
          return (
            <div
              key={m.id}
              className={`flex ${system ? "justify-center" : out ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[min(82%,30rem)] rounded-2xl px-3.5 py-2 text-sm ${
                  system
                    ? "bg-rojo-wash text-rojo ring-1 ring-rojo/20"
                    : out
                      ? "bg-ink text-white"
                      : "bg-gris-wash text-ink"
                }`}
              >
                {audio && m.signedUrl ? (
                  <AudioNote src={m.signedUrl} outbound={out && !system} />
                ) : null}
                {audio && !m.signedUrl ? (
                  <p className={`mb-1 text-xs ${out && !system ? "text-white/70" : "text-muted"}`}>
                    Nota de voz (sin audio guardado)
                  </p>
                ) : null}
                {m.signedUrl && !audio ? (
                  <ChatImage src={m.signedUrl} onSettled={pegarAbajoSiCorresponde} />
                ) : null}
                {!audio && m.texto ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p>
                ) : null}
                {audio && transcript ? (
                  <p
                    className={`mt-1.5 whitespace-pre-wrap text-[13px] leading-snug ${
                      out && !system ? "text-white/85" : "text-ink/90"
                    }`}
                  >
                    {transcript}
                  </p>
                ) : null}
                <p
                  className={`mt-1 text-right text-[10px] tabular-nums ${
                    out && !system ? "text-white/55" : "text-muted"
                  }`}
                >
                  {out && !system
                    ? `${m.enviado_por ? m.enviado_por : NOMBRE_AGENTE} · `
                    : ""}
                  {horaMensaje(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        {mensajes.length === 0 && !agenteEscribiendo && (
          <p className="py-16 text-center text-sm text-muted">Sin mensajes todavía.</p>
        )}
      </div>
      {mostrarIrAbajo && (
        <button
          type="button"
          onClick={irAlFinal}
          className="absolute bottom-3 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line transition hover:bg-paper"
          aria-label="Ir al último mensaje"
          title="Ir al final"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Hueco fijo antes de que cargue la foto: evita el salto del hilo al abrir. */
function ChatImage({ src, onSettled }: { src: string; onSettled?: () => void }) {
  const [listo, setListo] = useState(false);

  function marcarListo() {
    setListo(true);
    onSettled?.();
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="mb-1.5 block w-[min(100%,14rem)]"
    >
      <span
        className={`relative block h-56 w-full overflow-hidden rounded-md ${
          listo ? "bg-transparent" : "bg-line/70"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Comprobante"
          decoding="async"
          className={`h-full w-full object-contain transition-opacity duration-150 ${
            listo ? "opacity-100" : "opacity-0"
          }`}
          onLoad={marcarListo}
          onError={marcarListo}
        />
      </span>
    </a>
  );
}

function AudioNote({ src, outbound }: { src: string; outbound: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => {
      if (!a.duration || !Number.isFinite(a.duration)) return;
      setProgress(a.currentTime / a.duration);
      setDur(a.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onMeta = () => {
      if (Number.isFinite(a.duration)) setDur(a.duration);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("loadedmetadata", onMeta);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("loadedmetadata", onMeta);
    };
  }, [src]);

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      a.pause();
      setPlaying(false);
    }
  }

  const secs = Math.max(0, Math.round(dur || 0));
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div className={`flex min-w-[11rem] items-center gap-2.5 ${outbound ? "" : ""}`}>
      <audio ref={ref} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
          outbound ? "bg-white/15 text-white hover:bg-white/25" : "bg-ink text-white hover:bg-black"
        }`}
        aria-label={playing ? "Pausar nota de voz" : "Reproducir nota de voz"}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <rect x="2" y="2" width="3" height="8" rx="0.5" />
            <rect x="7" y="2" width="3" height="8" rx="0.5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M3 1.5v9l8-4.5-8-4.5z" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={`h-1 overflow-hidden rounded-full ${outbound ? "bg-white/25" : "bg-line"}`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-100 ${
              outbound ? "bg-white" : "bg-ink"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
        <p
          className={`mt-1 text-[10px] tabular-nums ${
            outbound ? "text-white/60" : "text-muted"
          }`}
        >
          {secs > 0 ? `${mm}:${ss}` : "Nota de voz"}
        </p>
      </div>
    </div>
  );
}

function Composer({
  conversacionId,
  esHumano,
  ventanaAbierta,
  demo,
  onSent,
  onError,
}: {
  conversacionId: string;
  esHumano: boolean;
  ventanaAbierta: boolean;
  demo?: boolean;
  onSent: (texto: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [pending, startTransition] = useTransition();
  const [grabando, setGrabando] = useState(false);
  const [secs, setSecs] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | null>(null);
  const puede = esHumano && ventanaAbierta && !pending;

  function enviar(raw?: string) {
    const body = (raw ?? texto).trim();
    if (!body || !puede) return;
    onError(null);
    if (demo) {
      setTexto("");
      void onSent(body);
      return;
    }
    const fd = new FormData();
    fd.set("conversacion_id", conversacionId);
    fd.set("texto", body);
    setTexto("");
    startTransition(async () => {
      const r = await enviarRespuestaHumana(fd);
      if (!r.ok) {
        onError(r.error ?? "No se pudo enviar.");
        setTexto(body);
        return;
      }
      await onSent(body);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if ((e.key === "Enter" || e.code === "NumpadEnter") && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    enviar();
  }

  async function iniciarGrabacion() {
    if (!puede || demo || grabando) return;
    onError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferidos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = preferidos.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (tickRef.current) window.clearInterval(tickRef.current);
        tickRef.current = null;
        setGrabando(false);
        setSecs(0);
        void enviarGrabacion(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
      };
      mediaRef.current = rec;
      rec.start();
      setGrabando(true);
      setSecs(0);
      tickRef.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      onError("No pude usar el micrófono. Revisá el permiso del navegador.");
    }
  }

  function detenerGrabacion() {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    mediaRef.current = null;
  }

  async function enviarGrabacion(blob: Blob) {
    if (blob.size < 200) {
      onError("La nota quedó vacía. Probá de nuevo.");
      return;
    }
    startTransition(async () => {
      try {
        const wav = await blobAWav(blob);
        const fd = new FormData();
        fd.set("conversacion_id", conversacionId);
        fd.set("audio", wav, "nota.wav");
        const r = await enviarAudioHumano(fd);
        if (!r.ok) {
          onError(r.error ?? "No se pudo enviar el audio.");
          return;
        }
        await onSent("🎤 Nota de voz");
      } catch (e) {
        onError(e instanceof Error ? e.message : "No se pudo preparar el audio.");
      }
    });
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface px-3 py-3 sm:px-5">
      {!esHumano && (
        <p className="mb-2 text-xs text-muted">
          El agente está manejando este chat. Pulsá <b className="font-medium">Tomar control</b> para
          escribir o mandar audio.
        </p>
      )}
      {esHumano && !ventanaAbierta && (
        <p className="mb-2 rounded-md bg-ambar-wash px-3 py-2 text-xs text-ambar ring-1 ring-ambar/25">
          Ventana de 24h cerrada. El cliente debe escribir primero para poder responder.
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
        <button
          type="button"
          disabled={!puede || demo}
          onClick={grabando ? detenerGrabacion : iniciarGrabacion}
          title={grabando ? "Detener y enviar" : "Grabar nota de voz"}
          aria-label={grabando ? "Detener grabación" : "Grabar audio"}
          className={`shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium ring-1 transition disabled:opacity-40 ${
            grabando
              ? "bg-rojo text-white ring-rojo"
              : "bg-paper text-ink ring-line hover:bg-surface-2"
          }`}
        >
          {grabando ? `■ ${secs}s` : "🎤"}
        </button>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={
            !esHumano
              ? "Tomá el control para escribir…"
              : !ventanaAbierta
                ? "Ventana de 24h cerrada"
                : grabando
                  ? "Grabando… pulsá ■ para enviar"
                  : "Escribe tu respuesta… (Enter envía)"
          }
          disabled={!esHumano || !ventanaAbierta || pending || grabando}
          className="flex-1 resize-none rounded-lg bg-paper px-3.5 py-2.5 text-sm ring-1 ring-line placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!puede || !texto.trim() || grabando}
          className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-40"
        >
          {pending ? "…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}

/** Convierte la grabación del navegador a WAV PCM (aceptado por WhatsApp). */
async function blobAWav(blob: Blob): Promise<File> {
  const ctx = new AudioContext();
  try {
    const raw = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(raw.slice(0));
    const wav = encodeWav(audio);
    return new File([wav], "nota.wav", { type: "audio/wav" });
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = 1;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const dataSize = samples * numCh * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    let s = ch0[i] ?? 0;
    if (ch1) s = (s + (ch1[i] ?? 0)) / 2;
    const n = Math.max(-1, Math.min(1, s));
    view.setInt16(offset, n < 0 ? n * 0x8000 : n * 0x7fff, true);
    offset += 2;
  }
  return out;
}

function MiniChip({
  tone,
  children,
}: {
  tone: "good" | "warn" | "neutral";
  children: ReactNode;
}) {
  const map = {
    good: "bg-verde-wash text-verde",
    warn: "bg-ambar-wash text-ambar",
    neutral: "bg-gris-wash text-gris",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}


