"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { EmptyState, StatusChip } from "@/components/kit";
import type { SesionEquipo } from "@/lib/equipo/tipos";
import type {
  AsesorComercial,
  ChatComercial,
  EtapaComercial,
  FiltroBandejaComercial,
  MensajeComercial,
  TemperaturaLead,
} from "@/lib/comercial/chats";
import { ordenarPorReciente } from "@/lib/comercial/piloto";
import {
  cargarBandejaComercial,
  cargarCambiosComercial,
  cargarHiloComercial,
  cargarMensajesNuevos,
  enviarRespuestaComercial,
  guardarFichaComercial,
  marcarChatLeido,
  tomarChat,
} from "./actions";

const FILTROS: { value: FiltroBandejaComercial; label: string }[] = [
  { value: "por_atender", label: "Por atender" },
  { value: "mios", label: "Mis chats" },
  { value: "sin_asignar", label: "Sin asignar" },
  { value: "calientes", label: "Calientes" },
  { value: "tibios", label: "Tibios" },
  { value: "frios", label: "Fríos" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "citas", label: "Con cita" },
  { value: "todos", label: "Todos" },
  { value: "cerrados", label: "Cerrados" },
];

const ETAPAS: { value: EtapaComercial; label: string }[] = [
  { value: "nuevo", label: "Nuevo" },
  { value: "conversacion", label: "En conversación" },
  { value: "cita", label: "Cita agendada" },
  { value: "visito", label: "Visitó" },
  { value: "ganado", label: "Ganado" },
  { value: "perdido", label: "Perdido" },
];

function telefono(n: string): string {
  const d = n.replace(/\D/g, "");
  if (d.startsWith("507") && d.length === 11) return `+507 ${d.slice(3, 7)}-${d.slice(7)}`;
  return n.startsWith("+") ? n : `+${n}`;
}

function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return d.toLocaleString("es-PA", mismoDia
    ? { hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short" });
}

function fechaSeparador(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function ventanaAbierta(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t < 24 * 60 * 60 * 1000;
}

function datetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function nombreChat(c: ChatComercial): string {
  return c.nombre?.trim() || telefono(c.waNumero);
}

function tonoTemperatura(t: TemperaturaLead): "crit" | "warn" | "neutral" {
  return t === "caliente" ? "crit" : t === "tibio" ? "warn" : "neutral";
}

function mezclarChats(actuales: ChatComercial[], cambios: ChatComercial[]): ChatComercial[] {
  const map = new Map(actuales.map((c) => [c.id, c]));
  for (const c of cambios) map.set(c.id, c);
  return ordenarPorReciente([...map.values()]);
}

function unirMensajes(actuales: MensajeComercial[], nuevos: MensajeComercial[]): MensajeComercial[] {
  const map = new Map(actuales.map((m) => [m.id, m]));
  for (const m of nuevos) map.set(m.id, m);
  return [...map.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function BandejaCrmComercial({
  inicial,
  errorInicial,
  cursorInicial,
  crmDisponible,
  sesion,
  asesores,
  seleccionadoInicial,
  piloto,
}: {
  inicial: ChatComercial[];
  errorInicial: string | null;
  cursorInicial: string | null;
  crmDisponible: boolean;
  sesion: SesionEquipo | null;
  asesores: AsesorComercial[];
  seleccionadoInicial: string | null;
  piloto: string;
}) {
  const [chats, setChats] = useState(inicial);
  const [error, setError] = useState(errorInicial);
  const [cursor, setCursor] = useState(cursorInicial);
  const [filtro, setFiltro] = useState<FiltroBandejaComercial>("por_atender");
  const [buscar, setBuscar] = useState("");
  const buscarDiferido = useDeferredValue(buscar);
  const [sel, setSel] = useState<string | null>(
    seleccionadoInicial && inicial.some((c) => c.id === seleccionadoInicial)
      ? seleccionadoInicial
      : inicial[0]?.id ?? null,
  );
  const [mensajes, setMensajes] = useState<MensajeComercial[]>([]);
  const [hayMasMensajes, setHayMasMensajes] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [pending, start] = useTransition();
  const cache = useRef(new Map<string, { mensajes: MensajeComercial[]; hayMas: boolean }>());
  const ultimoCambio = useRef(new Date().toISOString());
  const primeraBusqueda = useRef(true);
  const fondo = useRef<HTMLDivElement>(null);

  const elegido = chats.find((c) => c.id === sel) ?? null;

  function abrirChat(id: string) {
    setSel(id);
    setFichaAbierta(false);
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, noLeidos: 0 } : c)));
    const guardado = cache.current.get(id);
    if (guardado) {
      void marcarChatLeido(id);
      setMensajes(guardado.mensajes);
      setHayMasMensajes(guardado.hayMas);
      return;
    }
    start(async () => {
      const hilo = await cargarHiloComercial(id);
      cache.current.set(id, { mensajes: hilo.mensajes, hayMas: hilo.hayMas });
      if (hilo.chat?.borrador) {
        setChats((prev) => prev.map((c) => (c.id === id ? { ...c, borrador: hilo.chat?.borrador ?? null } : c)));
      }
      setMensajes(hilo.mensajes);
      setHayMasMensajes(hilo.hayMas);
    });
  }

  function precargar(id: string) {
    if (cache.current.has(id)) return;
    void cargarHiloComercial(id, null, false).then((hilo) => {
      cache.current.set(id, { mensajes: hilo.mensajes, hayMas: hilo.hayMas });
    });
  }

  useEffect(() => {
    if (sel && !cache.current.has(sel)) abrirChat(sel);
    // Solo abre el chat inicial; los siguientes pasan por abrirChat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (primeraBusqueda.current) {
      primeraBusqueda.current = false;
      return;
    }
    let viva = true;
    start(async () => {
      const pagina = await cargarBandejaComercial({ filtro, buscar: buscarDiferido });
      if (!viva) return;
      setChats(pagina.chats);
      setCursor(pagina.siguienteCursor);
      setError(pagina.error);
      if (!pagina.chats.some((c) => c.id === sel)) setSel(pagina.chats[0]?.id ?? null);
    });
    return () => {
      viva = false;
    };
  }, [filtro, buscarDiferido]);

  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden || !crmDisponible) return;
      const corte = new Date().toISOString();
      const cambios = await cargarCambiosComercial(ultimoCambio.current);
      ultimoCambio.current = corte;
      if (cambios.length) setChats((prev) => mezclarChats(prev, cambios));
    }, 6_000);
    return () => clearInterval(t);
  }, [crmDisponible]);

  useEffect(() => {
    if (!sel) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const ultimo = mensajes[mensajes.length - 1]?.createdAt;
      if (!ultimo) return;
      const nuevos = await cargarMensajesNuevos(sel, ultimo);
      if (!nuevos.length) return;
      setMensajes((prev) => {
        const merged = unirMensajes(prev, nuevos);
        cache.current.set(sel, { mensajes: merged, hayMas: hayMasMensajes });
        return merged;
      });
    }, 2_500);
    return () => clearInterval(t);
  }, [sel, mensajes, hayMasMensajes]);

  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: "auto" });
  }, [sel, mensajes.length]);

  useEffect(() => {
    if (sel && mensajes.length > 0) {
      cache.current.set(sel, { mensajes, hayMas: hayMasMensajes });
    }
  }, [sel, mensajes, hayMasMensajes]);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!elegido) return;
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    const data = new FormData();
    data.set("conversacion_id", elegido.id);
    data.set("texto", cuerpo);
    const temp: MensajeComercial = {
      id: `temp-${Date.now()}`,
      direccion: "out",
      texto: cuerpo,
      createdAt: new Date().toISOString(),
      autor: "humano",
      actorNombre: sesion?.nombre ?? null,
      archivoUrl: null,
    };
    setMensajes((prev) => [...prev, temp]);
    setTexto("");
    setChats((prev) => prev.map((c) => (c.id === elegido.id ? { ...c, borrador: null } : c)));
    setAviso(null);
    start(async () => {
      const r = await enviarRespuestaComercial(data);
      if (!r.ok) {
        setMensajes((prev) => prev.filter((m) => m.id !== temp.id));
        setAviso(r.error ?? "No se pudo enviar.");
        return;
      }
      setMensajes((prev) =>
        r.mensaje
          ? prev.map((m) => (m.id === temp.id ? r.mensaje! : m))
          : prev,
      );
      setChats((prev) =>
        prev.map((c) =>
          c.id === elegido.id
            ? {
                ...c,
                ultimoTexto: texto,
                ultimoMensajeAt: r.mensaje?.createdAt ?? temp.createdAt,
              }
            : c,
        ),
      );
    });
  }

  function tomar() {
    if (!elegido || !sesion) return;
    start(async () => {
      const r = await tomarChat(elegido.id);
      if (!r.ok) {
        setAviso(r.error ?? "No pude tomar el chat.");
        return;
      }
      setChats((prev) =>
        prev.map((c) =>
          c.id === elegido.id
            ? {
                ...c,
                asesorId: sesion.id,
                asesorNombre: sesion.nombre,
                modoAtencion: "humano",
                necesitaHumano: false,
                etapa: "conversacion",
              }
            : c,
        ),
      );
    });
  }

  function guardarFicha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    start(async () => {
      const r = await guardarFichaComercial(data);
      if (!r.ok) {
        setAviso(r.error ?? "No pude guardar la ficha.");
        return;
      }
      setAviso("Ficha actualizada.");
      const etapa = String(data.get("etapa") ?? "nuevo") as EtapaComercial;
      const temperatura = String(data.get("temperatura") ?? "tibio") as TemperaturaLead;
      const asesorId = String(data.get("asesor_id") ?? "") || null;
      const asesorNombre = asesores.find((a) => a.id === asesorId)?.nombre ?? null;
      const modo = String(data.get("modo_atencion") ?? "lucia") === "humano" ? "humano" : "lucia";
      const seguimientoRaw = String(data.get("seguimiento_at") ?? "");
      setChats((prev) =>
        prev.map((c) =>
          c.id === String(data.get("conversacion_id"))
            ? {
                ...c,
                nombre: String(data.get("nombre") ?? "") || null,
                interes: String(data.get("interes") ?? "") || null,
                lugar: String(data.get("lugar") ?? "") || null,
                etapa,
                temperatura,
                asesorId,
                asesorNombre,
                modoAtencion: modo,
                proximaAccion: String(data.get("proxima_accion") ?? "") || null,
                seguimientoAt: seguimientoRaw ? new Date(seguimientoRaw).toISOString() : null,
                resultado: String(data.get("resultado") ?? "") || null,
                motivoPerdida: String(data.get("motivo_perdida") ?? "") || null,
                cerradoAt:
                  etapa === "ganado" || etapa === "perdido"
                    ? new Date().toISOString()
                    : null,
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
    });
  }

  function cargarMasChats() {
    if (!cursor) return;
    start(async () => {
      const pagina = await cargarBandejaComercial({ filtro, buscar: buscarDiferido, cursor });
      setChats((prev) => unirChatsSinReordenar(prev, pagina.chats));
      setCursor(pagina.siguienteCursor);
    });
  }

  function cargarAnteriores() {
    if (!sel || !mensajes[0]) return;
    start(async () => {
      const hilo = await cargarHiloComercial(sel, mensajes[0].createdAt);
      const merged = unirMensajes(hilo.mensajes, mensajes);
      setMensajes(merged);
      setHayMasMensajes(hilo.hayMas);
      cache.current.set(sel, { mensajes: merged, hayMas: hilo.hayMas });
    });
  }

  return (
    <div className="-mx-5 flex h-[calc(100dvh-3rem)] flex-col overflow-hidden sm:-mx-8 lg:-mx-12 md:h-dvh">
      <header className="shrink-0 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Comercial</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight">Bandeja de leads</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/comercial/citas"
              className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
            >
              Citas
            </Link>
            <Link
              href="/comercial/resultados"
              className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
            >
              Resultados
            </Link>
          </div>
        </div>
      </header>

      <p className="shrink-0 border-b border-line bg-surface-2 px-5 py-2 text-xs text-ink">{piloto}</p>
      {error && (
        <p className="shrink-0 border-b border-line bg-ambar-wash px-5 py-2 text-sm text-ambar">{error}</p>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className={`${sel ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-line bg-surface md:w-[21rem]`}>
          <div className="shrink-0 space-y-3 border-b border-line p-3">
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar nombre, teléfono o carro"
              className="h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
            />
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {FILTROS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFiltro(f.value)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                    filtro === f.value ? "bg-ink text-white" : "bg-white text-muted ring-1 ring-line hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No hay leads en esta vista" hint="Prueba otro filtro o búsqueda." />
              </div>
            ) : (
              chats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => abrirChat(c.id)}
                  onMouseEnter={() => precargar(c.id)}
                  className={`relative block w-full border-b border-line px-4 py-3 text-left hover:bg-surface-2 ${
                    c.id === sel ? "bg-surface-2 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-ink" : "bg-surface"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">{nombreChat(c)}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-faint">{hora(c.ultimoMensajeAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{c.ultimoTexto || "Sin mensajes"}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <StatusChip tone={tonoTemperatura(c.temperatura)}>{c.temperatura}</StatusChip>
                    {c.necesitaHumano && <StatusChip tone="warn">Necesita asesor</StatusChip>}
                    {c.noLeidos > 0 && (
                      <span className="ml-auto rounded-full bg-ink px-1.5 text-[10px] font-semibold text-white">
                        {c.noLeidos}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-[10px] text-faint">
                    {c.asesorNombre ? `Responsable: ${c.asesorNombre}` : "Sin asignar"}
                  </p>
                </button>
              ))
            )}
            {cursor && (
              <button
                type="button"
                disabled={pending}
                onClick={cargarMasChats}
                className="m-3 w-[calc(100%-1.5rem)] rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
              >
                Cargar más
              </button>
            )}
          </div>
        </aside>

        <main className={`${sel ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}>
          {!elegido ? (
            <div className="m-6">
              <EmptyState title="Elige un lead" hint="La conversación y su contexto aparecen aquí." />
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => setSel(null)} className="mb-1 text-xs text-muted md:hidden">
                      Volver
                    </button>
                    <h2 className="truncate text-sm font-semibold">{nombreChat(elegido)}</h2>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[elegido.interes, elegido.lugar, elegido.anuncio].filter(Boolean).join(" · ") || telefono(elegido.waNumero)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!elegido.asesorId && (
                      <button
                        type="button"
                        disabled={pending || !crmDisponible}
                        onClick={tomar}
                        className="rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white hover:bg-black disabled:opacity-50"
                      >
                        Tomar chat
                      </button>
                    )}
                    <a
                      href={`tel:+${elegido.waNumero.replace(/\D/g, "")}`}
                      className="rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-line hover:bg-surface-2"
                    >
                      Llamar
                    </a>
                    <button
                      type="button"
                      onClick={() => setFichaAbierta((v) => !v)}
                      className="rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-line hover:bg-surface-2 lg:hidden"
                    >
                      Ficha
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusChip tone={tonoTemperatura(elegido.temperatura)}>{elegido.temperatura}</StatusChip>
                  <StatusChip tone={elegido.modoAtencion === "humano" ? "azul" : "neutral"}>
                    {elegido.modoAtencion === "humano" ? "Atiende una persona" : "Lucía activa"}
                  </StatusChip>
                  <span className="text-[11px] text-muted">
                    {elegido.asesorNombre || "Sin responsable"}
                  </span>
                </div>
              </div>

              <div ref={fondo} className="min-h-0 flex-1 overflow-y-auto bg-paper px-4 py-4 sm:px-6">
                {hayMasMensajes && (
                  <div className="mb-4 text-center">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={cargarAnteriores}
                      className="rounded-full bg-white px-3 py-1.5 text-xs text-muted ring-1 ring-line hover:text-ink"
                    >
                      Cargar mensajes anteriores
                    </button>
                  </div>
                )}
                <Mensajes mensajes={mensajes} />
              </div>

              <form onSubmit={enviar} className="shrink-0 border-t border-line bg-surface px-4 py-3">
                <input type="hidden" name="conversacion_id" value={elegido.id} />
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className={`text-[11px] font-medium ${ventanaAbierta(elegido.ultimoEntranteAt) ? "text-verde" : "text-ambar"}`}>
                    {ventanaAbierta(elegido.ultimoEntranteAt)
                      ? "Ventana de WhatsApp abierta"
                      : "Ventana cerrada: se necesita plantilla"}
                  </p>
                  {aviso && <p className="truncate text-[11px] text-rojo">{aviso}</p>}
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    name="texto"
                    required
                    rows={2}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    disabled={!ventanaAbierta(elegido.ultimoEntranteAt)}
                    placeholder="Escribir desde el número de ventas"
                    className="min-h-[44px] flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20 disabled:bg-surface-2"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button
                    disabled={pending || !ventanaAbierta(elegido.ultimoEntranteAt)}
                    className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>
              </form>
            </>
          )}
        </main>

        {elegido && (
          <aside
            className={`${fichaAbierta ? "fixed inset-y-0 right-0 z-40 flex w-[min(90vw,22rem)]" : "hidden"} shrink-0 flex-col overflow-y-auto border-l border-line bg-surface lg:static lg:flex lg:w-[21rem]`}
          >
            <FichaLead
              key={`${elegido.id}-${elegido.updatedAt}`}
              chat={elegido}
              asesores={asesores}
              pending={pending}
              crmDisponible={crmDisponible}
              onSubmit={guardarFicha}
              onUsarBorrador={(borrador) => {
                setTexto(borrador);
                setFichaAbierta(false);
              }}
              onClose={() => setFichaAbierta(false)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function Mensajes({ mensajes }: { mensajes: MensajeComercial[] }) {
  let fecha = "";
  return (
    <div className="space-y-2">
      {mensajes.map((m) => {
        const dia = new Date(m.createdAt).toDateString();
        const cambia = dia !== fecha;
        fecha = dia;
        return (
          <div key={m.id}>
            {cambia && (
              <p className="my-4 text-center text-[10px] font-medium capitalize text-faint">
                {fechaSeparador(m.createdAt)}
              </p>
            )}
            <div className={`flex ${m.direccion === "out" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[36rem] rounded-2xl px-3 py-2 text-sm ${
                  m.direccion === "out" ? "bg-ink text-white" : "bg-gris-wash text-ink"
                } ${m.id.startsWith("temp-") ? "opacity-60" : ""}`}
              >
                {m.archivoUrl && (
                  <a href={m.archivoUrl} target="_blank" rel="noreferrer">
                    <img
                      src={m.archivoUrl}
                      alt="Documento enviado"
                      className="mb-2 max-h-64 w-full rounded-lg object-contain"
                    />
                  </a>
                )}
                {m.texto && <p className="whitespace-pre-wrap">{m.texto}</p>}
                <p className={`mt-1 text-[10px] ${m.direccion === "out" ? "text-white/60" : "text-muted"}`}>
                  {m.autor === "cliente"
                    ? "Cliente"
                    : m.autor === "lucia"
                      ? "Lucía"
                      : m.actorNombre || "Equipo"}{" "}
                  · {hora(m.createdAt)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FichaLead({
  chat,
  asesores,
  pending,
  crmDisponible,
  onSubmit,
  onUsarBorrador,
  onClose,
}: {
  chat: ChatComercial;
  asesores: AsesorComercial[];
  pending: boolean;
  crmDisponible: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onUsarBorrador: (texto: string) => void;
  onClose: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex min-h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Ficha del lead</p>
          <p className="text-[11px] text-muted">{telefono(chat.waNumero)}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-muted lg:hidden">Cerrar</button>
      </div>
      <input type="hidden" name="conversacion_id" value={chat.id} />
      <div className="flex-1 space-y-4 p-4">
        {(chat.borrador || chat.proximaAccion?.startsWith("Borrador: ")) && (
          <div className="rounded-lg bg-ambar-wash p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ambar">Borrador de Lucía</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink">
              {chat.borrador || chat.proximaAccion?.replace(/^Borrador:\s*/, "")}
            </p>
            <button
              type="button"
              onClick={() => onUsarBorrador(chat.borrador || chat.proximaAccion?.replace(/^Borrador:\s*/, "") || "")}
              className="mt-2 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white"
            >
              Usar en el mensaje
            </button>
          </div>
        )}
        {chat.resumen && (
          <div className="rounded-lg bg-surface-2 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Resumen de Lucía</p>
            <p className="mt-1 text-xs leading-relaxed text-ink">{chat.resumen}</p>
          </div>
        )}
        <Campo label="Nombre" name="nombre" defaultValue={chat.nombre ?? ""} />
        <Campo label="Carro o interés" name="interes" defaultValue={chat.interes ?? ""} />
        <Campo label="Ubicación" name="lugar" defaultValue={chat.lugar ?? ""} />
        <SelectFicha label="Etapa" name="etapa" defaultValue={chat.etapa}>
          {ETAPAS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </SelectFicha>
        <SelectFicha label="Temperatura" name="temperatura" defaultValue={chat.temperatura}>
          <option value="caliente">Caliente</option>
          <option value="tibio">Tibio</option>
          <option value="frio">Frío</option>
        </SelectFicha>
        {chat.temperaturaMotivo && (
          <p className="text-[11px] leading-relaxed text-muted">{chat.temperaturaMotivo}</p>
        )}
        <SelectFicha label="Responsable" name="asesor_id" defaultValue={chat.asesorId ?? ""}>
          <option value="">Sin asignar</option>
          {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </SelectFicha>
        <SelectFicha label="Atención" name="modo_atencion" defaultValue={chat.modoAtencion}>
          <option value="lucia">Lucía</option>
          <option value="humano">Persona</option>
        </SelectFicha>
        <Campo label="Próxima acción" name="proxima_accion" defaultValue={chat.proximaAccion ?? ""} />
        <Campo
          label="Fecha de seguimiento"
          name="seguimiento_at"
          type="datetime-local"
          defaultValue={datetimeLocal(chat.seguimientoAt)}
        />
        <Campo label="Resultado (si cierra)" name="resultado" defaultValue={chat.resultado ?? ""} />
        <Campo label="Motivo de pérdida (si aplica)" name="motivo_perdida" defaultValue={chat.motivoPerdida ?? ""} />
      </div>
      <div className="sticky bottom-0 border-t border-line bg-surface p-4">
        <button
          disabled={pending || !crmDisponible}
          className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          Guardar ficha
        </button>
      </div>
    </form>
  );
}

function Campo({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        className="mt-1.5 h-9 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
      />
    </label>
  );
}

function SelectFicha({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1.5 h-9 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
      >
        {children}
      </select>
    </label>
  );
}

function unirChatsSinReordenar(actuales: ChatComercial[], nuevos: ChatComercial[]): ChatComercial[] {
  const ids = new Set(actuales.map((c) => c.id));
  return [...actuales, ...nuevos.filter((c) => !ids.has(c.id))];
}
