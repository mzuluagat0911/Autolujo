"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  accionTomarChat,
  cargarAlertasEscalada,
  type AlertaEscalada,
} from "@/app/cartera/conversaciones/actions";
import {
  desbloquearAudio,
  lanzarNotificacionEscritorio,
  pedirPermisoNotificacion,
  permisoNotificacion,
  setSonidoActivado,
  sonarAviso,
  sonidoActivado,
  soportaNotificaciones,
} from "@/lib/aviso-asesor";

const POLL_MS = 4_000;
const TITULO_BASE = "AutoLujo — Plataforma";

type Ctx = {
  items: AlertaEscalada[];
  open: boolean;
  setOpen: (v: boolean) => void;
  permiso: NotificationPermission | "unsupported";
  pedirPermiso: () => void;
  tomar: (id: string) => Promise<void>;
  probarAviso: () => void;
  sonidoOn: boolean;
  toggleSonido: () => void;
};

const AlertasCtx = createContext<Ctx | null>(null);

export function useAlertasAsesor(): Ctx {
  const v = useContext(AlertasCtx);
  if (!v) throw new Error("useAlertasAsesor fuera del provider");
  return v;
}

export function useAlertasCount(): number {
  return useContext(AlertasCtx)?.items.length ?? 0;
}

export function AlertasAsesorProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AlertaEscalada[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<AlertaEscalada | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | "unsupported">("unsupported");
  const [sonidoOn, setSonidoOn] = useState(true);
  const conocidos = useRef<Set<string> | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setPermiso(permisoNotificacion());
    setSonidoOn(sonidoActivado());
    const unlock = () => desbloquearAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  const avisar = useCallback(
    (nuevas: AlertaEscalada[], opts?: { prueba?: boolean }) => {
      if (nuevas.length === 0) return;
      const primera = nuevas[0];
      setToast(primera);
      window.setTimeout(() => setToast((t) => (t?.id === primera.id ? null : t)), 8000);
      if (!opts?.prueba) setOpen(true);
      void sonarAviso();
      for (const a of nuevas) {
        lanzarNotificacionEscritorio({
          titulo: `${a.titulo} espera a un asesor`,
          cuerpo: a.motivo ?? a.preview ?? "Marcela pasó este chat a una persona.",
          tag: `escalada-${a.id}`,
          onClick: () => {
            if (opts?.prueba || a.id === "__prueba__") return;
            router.push(`/cartera/conversaciones/${a.id}`);
          },
        });
      }
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await cargarAlertasEscalada();
      if (cancelled) return;
      const ids = new Set(next.map((a) => a.id));
      if (conocidos.current === null) {
        conocidos.current = ids;
      } else {
        const nuevas = next.filter((a) => !conocidos.current!.has(a.id));
        conocidos.current = ids;
        if (nuevas.length > 0) avisar(nuevas);
      }
      setItems(next);
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [avisar]);

  useEffect(() => {
    const n = items.length;
    document.title = n > 0 ? `(${n}) ${TITULO_BASE}` : TITULO_BASE;
    return () => {
      document.title = TITULO_BASE;
    };
  }, [items.length]);

  function pedirPermiso() {
    desbloquearAudio();
    void pedirPermisoNotificacion().then((p) => setPermiso(p));
  }

  function probarAviso() {
    desbloquearAudio();
    if (permiso === "default") void pedirPermisoNotificacion().then((p) => setPermiso(p));
    avisar(
      [
        {
          id: "__prueba__",
          titulo: "Prueba de aviso",
          motivo: "Así suena y se ve cuando un cliente espera a un asesor.",
          desde: new Date().toISOString(),
          preview: null,
        },
      ],
      { prueba: true },
    );
  }

  function toggleSonido() {
    const next = !sonidoOn;
    setSonidoOn(next);
    setSonidoActivado(next);
    if (next) {
      desbloquearAudio();
      void sonarAviso();
    }
  }

  async function tomar(id: string) {
    const fd = new FormData();
    fd.set("conversacion_id", id);
    await accionTomarChat(fd);
    conocidos.current?.delete(id);
    setItems((prev) => prev.filter((a) => a.id !== id));
    setOpen(false);
    router.push(`/cartera/conversaciones/${id}`);
  }

  return (
    <AlertasCtx.Provider
      value={{ items, open, setOpen, permiso, pedirPermiso, tomar, probarAviso, sonidoOn, toggleSonido }}
    >
      {children}
      {toast && pathname !== `/cartera/conversaciones/${toast.id}` && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(100%-2rem,22rem)] rounded-xl bg-surface p-4 ring-1 ring-line shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ambar">
            Cliente espera respuesta
          </p>
          <p className="mt-1 text-sm font-medium text-ink">{toast.titulo}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">
            {toast.motivo ?? toast.preview ?? "Marcela pasó este chat a una persona."}
          </p>
          <div className="mt-3 flex gap-2">
            {toast.id !== "__prueba__" ? (
              <>
                <button
                  type="button"
                  onClick={() => void tomar(toast.id)}
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-black"
                >
                  Tomar ahora
                </button>
                <Link
                  href={`/cartera/conversaciones/${toast.id}`}
                  onClick={() => setToast(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-surface-2"
                >
                  Ver chat
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setToast(null)}
                className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-black"
              >
                Listo
              </button>
            )}
          </div>
        </div>
      )}
    </AlertasCtx.Provider>
  );
}

export function AlertasCampana({ variant }: { variant: "side" | "mobile" }) {
  const {
    items, open, setOpen, permiso, pedirPermiso, tomar, probarAviso, sonidoOn, toggleSonido,
  } = useAlertasAsesor();
  const n = items.length;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);

  const btn =
    variant === "side"
      ? "relative p-1.5 text-white/50 transition hover:text-white"
      : "relative p-2 text-white";

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        aria-label={n > 0 ? `${n} chats esperando a un asesor` : "Sin chats esperando"}
        onClick={() => {
          desbloquearAudio();
          setOpen(!open);
        }}
        className={btn}
      >
        <CampanaIcon />
        {n > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ambar px-1 text-[9px] font-semibold text-white">
            {n > 9 ? "9+" : n}
          </span>
        )}
      </button>

      {open && (
        <div
          className={
            variant === "side"
              ? "absolute bottom-full left-0 z-50 mb-2 w-80 rounded-xl bg-surface text-ink ring-1 ring-line shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
              : "absolute right-0 top-full z-50 mt-2 w-80 rounded-xl bg-surface text-ink ring-1 ring-line shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
          }
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Esperan asesor
            </p>
            {n > 0 && <span className="text-xs tabular-nums text-ambar">{n}</span>}
          </div>
          <div className="flex flex-col border-b border-line">
            <button
              type="button"
              onClick={probarAviso}
              className="w-full px-4 py-2.5 text-left text-xs text-ink hover:bg-surface-2"
            >
              Probar sonido y aviso
            </button>
            <button
              type="button"
              onClick={toggleSonido}
              className="w-full px-4 py-2.5 text-left text-xs text-ink hover:bg-surface-2"
            >
              {sonidoOn ? "Silenciar pitido" : "Activar pitido"}
            </button>
            {permiso === "default" && soportaNotificaciones() && (
              <button
                type="button"
                onClick={pedirPermiso}
                className="w-full px-4 py-2.5 text-left text-xs text-ink hover:bg-surface-2"
              >
                Activar avisos en el escritorio
              </button>
            )}
            {permiso === "granted" && (
              <p className="px-4 py-2 text-[11px] text-muted">Avisos del sistema: activos (con sonido del SO).</p>
            )}
            {permiso === "denied" && (
              <p className="px-4 py-2 text-[11px] text-muted">
                El navegador bloqueó los avisos del sistema. Quedan el pitido y el recuadro en pantalla.
              </p>
            )}
            {permiso === "unsupported" && (
              <p className="px-4 py-2 text-[11px] text-muted">
                Este navegador no muestra avisos de escritorio (típico en iPhone). Deja la pestaña abierta: el pitido y el recuadro sí funcionan.
              </p>
            )}
          </div>
          {n === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">Nadie está esperando ahora.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((a) => (
                <li key={a.id} className="border-b border-line last:border-0">
                  <div className="flex items-start gap-2 px-4 py-3 hover:bg-surface-2">
                    <Link
                      href={`/cartera/conversaciones/${a.id}`}
                      onClick={() => setOpen(false)}
                      className="min-w-0 flex-1"
                    >
                      <p className="text-sm font-medium text-ink">{a.titulo}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                        {a.motivo ?? a.preview ?? "Pasado a una persona"}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-faint">
                        {haceCuanto(a.desde)}
                      </p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void tomar(a.id)}
                      className="shrink-0 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-black"
                    >
                      Tomar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CampanaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

function haceCuanto(iso: string | null): string {
  if (!iso) return "ahora";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}
