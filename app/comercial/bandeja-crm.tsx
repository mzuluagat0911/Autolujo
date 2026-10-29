"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { EmptyState, FilterChip, StatusChip, Toast } from "@/components/kit";
import type { SesionEquipo } from "@/lib/equipo/tipos";
import type {
  AsesorComercial,
  ChatComercial,
  ConteosBandejaComercial,
  EtapaComercial,
  FiltroBandejaComercial,
  MensajeComercial,
  TemperaturaLead,
} from "@/lib/comercial/chats";
import { ordenarPorReciente, pasaFiltroComercial } from "@/lib/comercial/piloto";
import { sedePorId } from "@/lib/comercial/sedes";
import {
  agendarCitaComercial,
  cargarBandejaComercial,
  cargarCambiosComercial,
  cargarConteosComercial,
  cargarHiloComercial,
  cargarMensajesNuevos,
  devolverChat,
  enviarAudioComercial,
  enviarPlantillaComercial,
  enviarRespuestaComercial,
  guardarFichaComercial,
  marcarChatLeido,
  tomarChat,
} from "./actions";

const FILTROS_MAIN: { value: FiltroBandejaComercial; label: string; conteo?: keyof ConteosBandejaComercial }[] = [
  { value: "por_atender", label: "Por atender", conteo: "por_atender" },
  { value: "calientes", label: "Calientes", conteo: "calientes" },
  { value: "citas", label: "Con cita", conteo: "citas" },
  { value: "mios", label: "Míos", conteo: "mios" },
  { value: "cerrados", label: "Cerrados" },
];

const FILTROS_MAS: { value: FiltroBandejaComercial; label: string }[] = [
  { value: "sin_asignar", label: "Sin asignar" },
  { value: "tibios", label: "Tibios" },
  { value: "frios", label: "Fríos" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "todos", label: "Todos" },
];

const ETAPAS: { value: EtapaComercial; label: string }[] = [
  { value: "nuevo", label: "Nuevo" },
  { value: "conversacion", label: "En conversación" },
  { value: "cita", label: "Cita agendada" },
  { value: "visito", label: "Visitó" },
  { value: "ganado", label: "Ganado" },
  { value: "perdido", label: "Perdido" },
];

const RAPIDAS = [
  "¿Qué sede le queda mejor, Juan Díaz o La Chorrera?",
  "¿Qué día le queda bien para la visita?",
  "Recibí su documento. El equipo lo revisa y yo le sigo aquí.",
  "Tenemos Hyundai Grand i10 y Kia Soluto. ¿Cuál le llama más?",
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

function tonoTemperatura(t: TemperaturaLead): "warn" | "azul" | "neutral" {
  return t === "caliente" ? "warn" : t === "tibio" ? "azul" : "neutral";
}

function etiquetaEtapa(etapa: EtapaComercial): string {
  return ETAPAS.find((e) => e.value === etapa)?.label ?? etapa;
}

function etiquetaCita(c: ChatComercial): string | null {
  if (!c.citaFecha || !c.citaHora) return null;
  const sede = sedePorId(c.citaSede)?.nombre ?? c.citaSede;
  const d = new Date(`${c.citaFecha}T12:00:00`);
  const cuando = Number.isNaN(d.getTime())
    ? c.citaFecha
    : d.toLocaleDateString("es-PA", { day: "numeric", month: "short" });
  return `${cuando} ${c.citaHora}${sede ? ` · ${sede}` : ""}`;
}

function esAudio(texto: string | null, url: string | null): boolean {
  if (url && /\.(wav|ogg|opus|mp3|m4a|webm)(\?|$)/i.test(url)) return true;
  return Boolean(texto && /^🎤/.test(texto.trim()));
}

function mezclarChats(
  actuales: ChatComercial[],
  cambios: ChatComercial[],
  filtro: FiltroBandejaComercial,
  asesorId: string | null,
  buscar: string,
): ChatComercial[] {
  const map = new Map(actuales.map((c) => [c.id, c]));
  const q = buscar.trim().toLowerCase();
  for (const c of cambios) {
    const coincideBuscar =
      !q ||
      nombreChat(c).toLowerCase().includes(q) ||
      c.waNumero.includes(q) ||
      (c.interes ?? "").toLowerCase().includes(q);
    if (pasaFiltroComercial(c, filtro, asesorId) && coincideBuscar) map.set(c.id, c);
    else map.delete(c.id);
  }
  return ordenarPorReciente([...map.values()]);
}

function unirMensajes(actuales: MensajeComercial[], nuevos: MensajeComercial[]): MensajeComercial[] {
  const map = new Map(actuales.map((m) => [m.id, m]));
  for (const m of nuevos) map.set(m.id, m);
  return [...map.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function unirChatsSinReordenar(actuales: ChatComercial[], nuevos: ChatComercial[]): ChatComercial[] {
  const ids = new Set(actuales.map((c) => c.id));
  return [...actuales, ...nuevos.filter((c) => !ids.has(c.id))];
}

export function BandejaCrmComercial({
  inicial,
  errorInicial,
  cursorInicial,
  crmDisponible,
  conteosIniciales,
  sesion,
  asesores,
  seleccionadoInicial,
  piloto,
}: {
  inicial: ChatComercial[];
  errorInicial: string | null;
  cursorInicial: string | null;
  crmDisponible: boolean;
  conteosIniciales: ConteosBandejaComercial;
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
  const [conteos, setConteos] = useState(conteosIniciales);
  const buscarDiferido = useDeferredValue(buscar);
  const [sel, setSel] = useState<string | null>(
    seleccionadoInicial && inicial.some((c) => c.id === seleccionadoInicial)
      ? seleccionadoInicial
      : inicial[0]?.id ?? null,
  );
  const [mensajes, setMensajes] = useState<MensajeComercial[]>([]);
  const [hayMasMensajes, setHayMasMensajes] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "neutral" | "good" | "warn" | "crit" } | null>(null);
  const [texto, setTexto] = useState("");
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [agendar, setAgendar] = useState(false);
  const [pending, start] = useTransition();
  const cache = useRef(new Map<string, { mensajes: MensajeComercial[]; hayMas: boolean }>());
  const ultimoCambio = useRef(new Date().toISOString());
  const primeraBusqueda = useRef(true);
  const fondo = useRef<HTMLDivElement>(null);
  const hiloActivo = useRef<string | null>(null);
  const cercaDelFondo = useRef(true);
  const ultimoMsgAt = useRef<string | null>(null);
  const [hiloId, setHiloId] = useState<string | null>(null);
  const [mostrarIrAbajo, setMostrarIrAbajo] = useState(false);

  const elegido = chats.find((c) => c.id === sel) ?? null;
  const hiloVisible = hiloId === sel ? mensajes : [];
  const masActivo = FILTROS_MAS.find((f) => f.value === filtro);

  function avisar(message: string, tone: "neutral" | "good" | "warn" | "crit" = "crit") {
    setToast({ message, tone });
  }

  function abrirChat(id: string) {
    setSel(id);
    setFichaAbierta(false);
    setAgendar(false);
    cercaDelFondo.current = true;
    setMostrarIrAbajo(false);
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, noLeidos: 0 } : c)));
  }

  function precargar(id: string) {
    if (cache.current.has(id)) return;
    void cargarHiloComercial(id, null, false).then((hilo) => {
      cache.current.set(id, { mensajes: hilo.mensajes, hayMas: hilo.hayMas });
    });
  }

  function syncScroll() {
    const el = fondo.current;
    if (!el) return;
    const abajo = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    cercaDelFondo.current = abajo;
    setMostrarIrAbajo(!abajo);
  }

  function irAlFinal() {
    const el = fondo.current;
    if (!el) return;
    cercaDelFondo.current = true;
    setMostrarIrAbajo(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  function aplicarChat(id: string, patch: Partial<ChatComercial>) {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  useEffect(() => {
    ultimoMsgAt.current = mensajes.at(-1)?.createdAt ?? null;
  }, [mensajes]);

  useEffect(() => {
    if (!sel) {
      hiloActivo.current = null;
      setHiloId(null);
      setMensajes([]);
      return;
    }
    const chatId = sel;
    hiloActivo.current = chatId;
    const guardado = cache.current.get(chatId);
    if (guardado) {
      setHiloId(chatId);
      setMensajes(guardado.mensajes);
      setHayMasMensajes(guardado.hayMas);
    } else {
      setHiloId(null);
      setMensajes([]);
      setHayMasMensajes(false);
    }
    let viva = true;
    start(async () => {
      const hilo = await cargarHiloComercial(chatId);
      if (!viva || hiloActivo.current !== chatId) return;
      cache.current.set(chatId, { mensajes: hilo.mensajes, hayMas: hilo.hayMas });
      if (hilo.chat) {
        setChats((prev) => {
          const existe = prev.some((c) => c.id === chatId);
          return existe
            ? prev.map((c) => (c.id === chatId ? { ...c, ...hilo.chat, noLeidos: 0 } : c))
            : [hilo.chat!, ...prev];
        });
      }
      setHiloId(chatId);
      setMensajes((prev) => {
        const pendientes = prev.filter((m) => m.id.startsWith("temp-"));
        return pendientes.length ? unirMensajes(hilo.mensajes, pendientes) : hilo.mensajes;
      });
      setHayMasMensajes(hilo.hayMas);
      void marcarChatLeido(chatId);
    });
    return () => {
      viva = false;
    };
  }, [sel]);

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
      setConteos(pagina.conteos);
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
      const [cambios, siguientes] = await Promise.all([
        cargarCambiosComercial(ultimoCambio.current),
        cargarConteosComercial(),
      ]);
      ultimoCambio.current = corte;
      setConteos(siguientes);
      if (cambios.length) {
        setChats((prev) => mezclarChats(prev, cambios, filtro, sesion?.id ?? null, buscarDiferido));
      }
    }, 6_000);
    return () => clearInterval(t);
  }, [crmDisponible, filtro, sesion?.id, buscarDiferido]);

  useEffect(() => {
    if (!sel) return;
    const chatId = sel;
    let viva = true;
    const t = setInterval(async () => {
      if (document.hidden || hiloActivo.current !== chatId) return;
      const ultimo = ultimoMsgAt.current;
      if (!ultimo) return;
      const nuevos = await cargarMensajesNuevos(chatId, ultimo);
      if (!viva || hiloActivo.current !== chatId || !nuevos.length) return;
      setMensajes((prev) => {
        if (hiloActivo.current !== chatId) return prev;
        const merged = unirMensajes(prev, nuevos);
        cache.current.set(chatId, { mensajes: merged, hayMas: hayMasMensajes });
        return merged;
      });
    }, 2_500);
    return () => {
      viva = false;
      clearInterval(t);
    };
  }, [sel, hayMasMensajes]);

  useEffect(() => {
    if (!cercaDelFondo.current) {
      setMostrarIrAbajo(true);
      return;
    }
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: "auto" });
  }, [sel, mensajes.length]);

  function meterSalida(chatId: string, cuerpo: string, mensaje?: MensajeComercial | null) {
    const temp: MensajeComercial = mensaje ?? {
      id: `temp-${Date.now()}`,
      direccion: "out",
      texto: cuerpo,
      createdAt: new Date().toISOString(),
      autor: "humano",
      actorNombre: sesion?.nombre ?? null,
      archivoUrl: null,
    };
    setHiloId(chatId);
    setMensajes((prev) => {
      const merged = unirMensajes(prev.filter((m) => m.id !== temp.id), [temp]);
      cache.current.set(chatId, { mensajes: merged, hayMas: hayMasMensajes });
      return merged;
    });
    aplicarChat(chatId, {
      ultimoTexto: cuerpo,
      ultimoMensajeAt: temp.createdAt,
      modoAtencion: "humano",
      asesorId: sesion?.id ?? null,
      asesorNombre: sesion?.nombre ?? null,
      necesitaHumano: false,
      borrador: null,
    });
    cercaDelFondo.current = true;
  }

  function enviar(cuerpoRaw?: string) {
    if (!elegido) return;
    const cuerpo = (cuerpoRaw ?? texto).trim();
    if (!cuerpo) return;
    const chatId = elegido.id;
    const data = new FormData();
    data.set("conversacion_id", chatId);
    data.set("texto", cuerpo);
    const tempId = `temp-${Date.now()}`;
    meterSalida(chatId, cuerpo, {
      id: tempId,
      direccion: "out",
      texto: cuerpo,
      createdAt: new Date().toISOString(),
      autor: "humano",
      actorNombre: sesion?.nombre ?? null,
      archivoUrl: null,
    });
    setTexto("");
    setToast(null);
    start(async () => {
      const r = await enviarRespuestaComercial(data);
      if (hiloActivo.current !== chatId) return;
      if (!r.ok) {
        setMensajes((prev) => prev.filter((m) => m.id !== tempId));
        avisar(r.error ?? "No se pudo enviar.");
        setTexto(cuerpo);
        return;
      }
      if (r.mensaje) {
        setMensajes((prev) => {
          const merged = prev.map((m) => (m.id === tempId ? r.mensaje! : m));
          cache.current.set(chatId, { mensajes: merged, hayMas: hayMasMensajes });
          return merged;
        });
      }
    });
  }

  function tomar() {
    if (!elegido || !sesion) return;
    start(async () => {
      const r = await tomarChat(elegido.id);
      if (!r.ok) {
        avisar(r.error ?? "No pude tomar el chat.");
        return;
      }
      aplicarChat(elegido.id, {
        asesorId: sesion.id,
        asesorNombre: sesion.nombre,
        modoAtencion: "humano",
        necesitaHumano: false,
        etapa: elegido.etapa === "nuevo" ? "conversacion" : elegido.etapa,
      });
    });
  }

  function devolver() {
    if (!elegido) return;
    start(async () => {
      const r = await devolverChat(elegido.id);
      if (!r.ok) {
        avisar(r.error ?? "No pude devolver el chat.");
        return;
      }
      aplicarChat(elegido.id, { modoAtencion: "lucia", necesitaHumano: false });
      avisar("Lucía volvió a atender este chat.", "good");
    });
  }

  function mandarPlantilla(tipo: "seguimiento" | "recordatorio_cita" | "confirma_cita") {
    if (!elegido) return;
    const chatId = elegido.id;
    start(async () => {
      const r = await enviarPlantillaComercial(chatId, tipo);
      if (!r.ok) {
        avisar(r.error ?? "No se pudo enviar la plantilla.");
        return;
      }
      if (r.mensaje) meterSalida(chatId, r.texto ?? r.mensaje.texto ?? "Plantilla enviada", r.mensaje);
      else if (r.texto) meterSalida(chatId, r.texto);
    });
  }

  function guardarFicha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await guardarFichaComercial(data);
      if (!r.ok) {
        avisar(r.error ?? "No pude guardar la ficha.");
        return;
      }
      avisar("Ficha actualizada.", "good");
      const etapa = String(data.get("etapa") ?? "nuevo") as EtapaComercial;
      const temperatura = String(data.get("temperatura") ?? "tibio") as TemperaturaLead;
      const asesorId = String(data.get("asesor_id") ?? "") || null;
      const asesorNombre = asesores.find((a) => a.id === asesorId)?.nombre ?? null;
      const modo = String(data.get("modo_atencion") ?? "lucia") === "humano" ? "humano" : "lucia";
      const seguimientoRaw = String(data.get("seguimiento_at") ?? "");
      aplicarChat(String(data.get("conversacion_id")), {
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
        cerradoAt: etapa === "ganado" || etapa === "perdido" ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  function cargarMasChats() {
    if (!cursor) return;
    start(async () => {
      const pagina = await cargarBandejaComercial({ filtro, buscar: buscarDiferido, cursor });
      setChats((prev) => unirChatsSinReordenar(prev, pagina.chats));
      setCursor(pagina.siguienteCursor);
      setConteos(pagina.conteos);
    });
  }

  function cargarAnteriores() {
    if (!sel || hiloId !== sel || !mensajes[0]) return;
    const chatId = sel;
    const antes = mensajes[0].createdAt;
    const el = fondo.current;
    const prevHeight = el?.scrollHeight ?? 0;
    start(async () => {
      const hilo = await cargarHiloComercial(chatId, antes);
      if (hiloActivo.current !== chatId) return;
      setMensajes((prev) => {
        const merged = unirMensajes(hilo.mensajes, prev);
        cache.current.set(chatId, { mensajes: merged, hayMas: hilo.hayMas });
        return merged;
      });
      setHayMasMensajes(hilo.hayMas);
      requestAnimationFrame(() => {
        if (!el) return;
        el.scrollTop = el.scrollHeight - prevHeight;
      });
    });
  }

  return (
    <div className="-mx-5 flex h-[calc(100dvh-3rem)] flex-col overflow-hidden bg-paper sm:-mx-8 lg:-mx-12 md:h-dvh">
      <header className="shrink-0 border-b border-line bg-surface px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Comercial</p>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight">Chats</h1>
              <StatusChip tone={piloto.toLowerCase().includes("apagada") ? "warn" : "good"}>
                {piloto.toLowerCase().includes("apagada") ? "Lucía apagada" : "Lucía activa"}
              </StatusChip>
            </div>
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

      {error && (
        <p className="shrink-0 border-b border-line bg-ambar-wash px-5 py-2.5 text-sm text-ambar">{error}</p>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className={`${sel ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-line bg-surface md:w-[22rem]`}>
          <div className="shrink-0 space-y-3 border-b border-line p-4">
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar nombre, teléfono o carro"
              className="h-10 w-full rounded-lg bg-paper px-3 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
            />
            <div className="flex flex-wrap gap-1.5">
              {FILTROS_MAIN.map((f) => {
                const n = f.conteo ? conteos[f.conteo] : undefined;
                return (
                  <FilterChip key={f.value} active={filtro === f.value} onClick={() => setFiltro(f.value)}>
                    {f.label}
                    {n && n > 0 && f.value !== "cerrados" ? ` · ${n}` : ""}
                  </FilterChip>
                );
              })}
              {masActivo && (
                <FilterChip active onClick={() => setFiltro("por_atender")}>
                  {masActivo.label}
                </FilterChip>
              )}
              <select
                value={masActivo ? filtro : ""}
                onChange={(e) => {
                  const v = e.target.value as FiltroBandejaComercial;
                  if (v) setFiltro(v);
                }}
                className="h-8 rounded-lg bg-paper px-2 text-xs text-muted ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
                aria-label="Más filtros"
              >
                <option value="">Más</option>
                {FILTROS_MAS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-paper">
            {chats.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No hay leads en esta vista" hint="Pruebe otro filtro o búsqueda." />
              </div>
            ) : (
              chats.map((c) => {
                const cita = etiquetaCita(c);
                const activo = c.id === sel;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => abrirChat(c.id)}
                    onMouseEnter={() => precargar(c.id)}
                    className={`relative block w-full border-b border-line px-4 py-3.5 text-left transition hover:bg-surface ${
                      activo ? "bg-surface" : "bg-paper"
                    }`}
                  >
                    <span
                      className={`absolute inset-y-3 left-0 w-0.5 rounded-full ${
                        activo
                          ? "bg-ink"
                          : c.necesitaHumano
                            ? "bg-ambar"
                            : c.temperatura === "caliente"
                              ? "bg-ambar/70"
                              : c.noLeidos > 0
                                ? "bg-ink/40"
                                : "bg-transparent"
                      }`}
                    />
                    <div className="flex items-start justify-between gap-2 pl-2">
                      <span className="min-w-0 truncate text-sm font-semibold">{nombreChat(c)}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-faint">{hora(c.ultimoMensajeAt)}</span>
                    </div>
                    <p className="mt-1 truncate pl-2 text-xs text-muted">{c.ultimoTexto || "Sin mensajes"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-2">
                      <StatusChip tone={tonoTemperatura(c.temperatura)}>
                        {c.temperatura === "caliente" ? "Caliente" : c.temperatura === "tibio" ? "Tibio" : "Frío"}
                      </StatusChip>
                      <span className="text-[11px] text-muted">{etiquetaEtapa(c.etapa)}</span>
                      {c.necesitaHumano && <StatusChip tone="warn">Asesor</StatusChip>}
                      {c.noLeidos > 0 && (
                        <span className="ml-auto rounded-full bg-ink px-1.5 text-[10px] font-semibold text-white">
                          {c.noLeidos}
                        </span>
                      )}
                    </div>
                    {cita && (
                      <p className="mt-1.5 truncate pl-2 text-[11px] font-medium text-azul">{cita}</p>
                    )}
                  </button>
                );
              })
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

        <main className={`${sel ? "flex" : "hidden"} min-w-0 flex-1 flex-col bg-paper md:flex`}>
          {!elegido ? (
            <div className="m-8">
              <EmptyState title="Elige un lead" hint="La conversación y su contexto aparecen aquí." />
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-line bg-surface px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => setSel(null)} className="mb-1 text-xs text-muted md:hidden">
                      Volver
                    </button>
                    <h2 className="truncate text-base font-semibold">{nombreChat(elegido)}</h2>
                    <p className="mt-1 truncate text-xs text-muted">
                      {[etiquetaEtapa(elegido.etapa), elegido.interes, elegido.lugar, telefono(elegido.waNumero)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {etiquetaCita(elegido) && (
                      <p className="mt-1 text-xs font-medium text-azul">{etiquetaCita(elegido)}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {elegido.modoAtencion === "humano" ? (
                      <button
                        type="button"
                        disabled={pending || !crmDisponible}
                        onClick={devolver}
                        className="rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-line hover:bg-surface-2 disabled:opacity-50"
                      >
                        Devolver a Lucía
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pending || !crmDisponible}
                        onClick={tomar}
                        className="rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white hover:bg-black disabled:opacity-50"
                      >
                        Tomar chat
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAgendar(true)}
                      className="rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-line hover:bg-surface-2"
                    >
                      {elegido.citaFecha ? "Reagendar" : "Agendar"}
                    </button>
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusChip tone={tonoTemperatura(elegido.temperatura)}>
                    {elegido.temperatura === "caliente" ? "Caliente" : elegido.temperatura === "tibio" ? "Tibio" : "Frío"}
                  </StatusChip>
                  <StatusChip tone={elegido.modoAtencion === "humano" ? "azul" : "good"}>
                    {elegido.modoAtencion === "humano" ? "Atiende una persona" : "Lucía activa"}
                  </StatusChip>
                  {elegido.necesitaHumano && <StatusChip tone="warn">Necesita asesor</StatusChip>}
                  <span className="text-[11px] text-muted">{elegido.asesorNombre || "Sin responsable"}</span>
                </div>
              </div>

              <div className="relative min-h-0 flex-1">
                <div
                  ref={fondo}
                  onScroll={syncScroll}
                  className="h-full overflow-y-auto px-5 py-5 sm:px-6 [overflow-anchor:none]"
                >
                  {hayMasMensajes && hiloId === sel && (
                    <div className="mb-5 text-center">
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
                  <Mensajes mensajes={hiloVisible} />
                </div>
                {mostrarIrAbajo && (
                  <button
                    type="button"
                    onClick={irAlFinal}
                    className="absolute bottom-4 right-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line hover:bg-paper"
                    aria-label="Ir al último mensaje"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>

              <Composer
                chat={elegido}
                texto={texto}
                setTexto={setTexto}
                pending={pending}
                onEnviar={enviar}
                onPlantilla={mandarPlantilla}
                onAudio={(mensaje) => {
                  if (mensaje) meterSalida(elegido.id, mensaje.texto ?? "🎤 Nota de voz", mensaje);
                }}
                onError={(msg) => avisar(msg)}
              />
            </>
          )}
        </main>

        {elegido && (
          <aside
            className={`${fichaAbierta ? "fixed inset-y-0 right-0 z-40 flex w-[min(90vw,22rem)]" : "hidden"} shrink-0 flex-col overflow-y-auto border-l border-line bg-surface lg:static lg:flex lg:w-[22rem]`}
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

      {agendar && elegido && (
        <AgendarModal
          chat={elegido}
          pending={pending}
          onClose={() => setAgendar(false)}
          onOk={(textoCita, errorEnvio, enviado, cita) => {
            setAgendar(false);
            aplicarChat(elegido.id, {
              etapa: "cita",
              modoAtencion: "humano",
              asesorId: sesion?.id ?? elegido.asesorId,
              asesorNombre: sesion?.nombre ?? elegido.asesorNombre,
              nombre: cita.nombre || elegido.nombre,
              lugar: cita.lugar || elegido.lugar,
              citaFecha: cita.fecha,
              citaHora: cita.hora,
              citaSede: cita.sede,
            });
            if (enviado && textoCita) meterSalida(elegido.id, textoCita);
            avisar(errorEnvio ?? "Cita agendada.", errorEnvio ? "warn" : "good");
          }}
          onError={(msg) => avisar(msg)}
          start={start}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

function Composer({
  chat,
  texto,
  setTexto,
  pending,
  onEnviar,
  onPlantilla,
  onAudio,
  onError,
}: {
  chat: ChatComercial;
  texto: string;
  setTexto: (v: string) => void;
  pending: boolean;
  onEnviar: (cuerpo?: string) => void;
  onPlantilla: (tipo: "seguimiento" | "recordatorio_cita" | "confirma_cita") => void;
  onAudio: (mensaje?: MensajeComercial | null) => void;
  onError: (msg: string) => void;
}) {
  const abierta = ventanaAbierta(chat.ultimoEntranteAt);
  const [grabando, setGrabando] = useState(false);
  const [secs, setSecs] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | null>(null);
  const puedeAudio = abierta && !pending && !grabando;

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if ((e.key === "Enter" || e.code === "NumpadEnter") && !e.shiftKey) {
      e.preventDefault();
      if (abierta) onEnviar();
    }
  }

  async function iniciarGrabacion() {
    if (!puedeAudio) return;
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
      onError("No pude usar el micrófono. Revise el permiso del navegador.");
    }
  }

  function detenerGrabacion() {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    mediaRef.current = null;
  }

  async function enviarGrabacion(blob: Blob) {
    if (blob.size < 200) {
      onError("La nota quedó vacía. Pruebe de nuevo.");
      return;
    }
    try {
      const wav = await blobAWav(blob);
      const fd = new FormData();
      fd.set("conversacion_id", chat.id);
      fd.set("audio", wav, "nota.wav");
      const r = await enviarAudioComercial(fd);
      if (!r.ok) {
        onError(r.error ?? "No se pudo enviar el audio.");
        return;
      }
      onAudio(r.mensaje);
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo preparar el audio.");
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface px-4 py-3 sm:px-5">
      {!abierta && (
        <p className="mb-2 rounded-lg bg-ambar-wash px-3 py-2 text-xs text-ambar">
          Ventana cerrada. El texto libre espera a que escriba. Las plantillas sí salen.
        </p>
      )}
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => onPlantilla("seguimiento")}
          className="shrink-0 rounded-lg bg-paper px-2.5 py-1.5 text-[11px] text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-40"
        >
          Retomar
        </button>
        {chat.citaFecha && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => onPlantilla("confirma_cita")}
              className="shrink-0 rounded-lg bg-paper px-2.5 py-1.5 text-[11px] text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-40"
            >
              Confirmar cita
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onPlantilla("recordatorio_cita")}
              className="shrink-0 rounded-lg bg-paper px-2.5 py-1.5 text-[11px] text-ink ring-1 ring-line hover:bg-surface-2 disabled:opacity-40"
            >
              Recordatorio de cita
            </button>
          </>
        )}
        {abierta && RAPIDAS.map((r) => (
          <button
            key={r}
            type="button"
            disabled={pending}
            onClick={() => onEnviar(r)}
            className="shrink-0 rounded-lg bg-paper px-2.5 py-1.5 text-[11px] text-muted ring-1 ring-line hover:text-ink disabled:opacity-40"
          >
            {r.length > 38 ? `${r.slice(0, 36)}…` : r}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (abierta) onEnviar();
        }}
        className="flex items-end gap-2"
      >
        <button
          type="button"
          disabled={!puedeAudio}
          onClick={grabando ? detenerGrabacion : iniciarGrabacion}
          title={grabando ? "Detener y enviar" : "Grabar nota de voz"}
          aria-label={grabando ? "Detener grabación" : "Grabar audio"}
          className={`inline-flex shrink-0 items-center rounded-lg px-3 py-2.5 text-sm font-medium ring-1 transition disabled:opacity-40 ${
            grabando ? "bg-rojo text-white ring-rojo" : "bg-paper text-ink ring-line hover:bg-surface-2"
          }`}
        >
          {grabando ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="4" y="4" width="8" height="8" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="6" y="1.5" width="4" height="8" rx="2" />
              <path d="M4.5 7.5a3.5 3.5 0 0 0 7 0" strokeLinecap="round" />
              <path d="M8 11v2.5M6 13.5h4" strokeLinecap="round" />
            </svg>
          )}
          {grabando ? <span className="ml-1.5 tabular-nums">{secs}s</span> : null}
        </button>
        <textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={!abierta}
          placeholder={abierta ? "Escribir desde el número de ventas" : "Ventana de 24 h cerrada"}
          className="min-h-[44px] flex-1 resize-none rounded-lg bg-paper px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20 disabled:bg-surface-2"
          onKeyDown={onKeyDown}
        />
        <button
          disabled={pending || !abierta || !texto.trim() || grabando}
          className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

function Mensajes({ mensajes }: { mensajes: MensajeComercial[] }) {
  let fecha = "";
  return (
    <div className="space-y-2.5">
      {mensajes.map((m) => {
        const dia = new Date(m.createdAt).toDateString();
        const cambia = dia !== fecha;
        fecha = dia;
        const audio = esAudio(m.texto, m.archivoUrl);
        const transcript =
          audio && m.texto && !/^🎤\s*nota de voz$/i.test(m.texto.trim())
            ? m.texto.replace(/^🎤\s*/, "").trim()
            : null;
        return (
          <div key={m.id}>
            {cambia && (
              <p className="my-5 text-center text-[10px] font-medium capitalize text-faint">
                {fechaSeparador(m.createdAt)}
              </p>
            )}
            <div className={`flex ${m.direccion === "out" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[min(82%,36rem)] rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.direccion === "out" ? "bg-ink text-white" : "bg-gris-wash text-ink"
                } ${m.id.startsWith("temp-") ? "opacity-60" : ""}`}
              >
                {audio && m.archivoUrl ? (
                  <AudioNote src={m.archivoUrl} outbound={m.direccion === "out"} />
                ) : null}
                {m.archivoUrl && !audio && (
                  <a href={m.archivoUrl} target="_blank" rel="noreferrer">
                    <img
                      src={m.archivoUrl}
                      alt="Documento enviado"
                      className="mb-2 max-h-64 w-full rounded-lg object-contain"
                    />
                  </a>
                )}
                {!audio && m.texto && <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p>}
                {audio && transcript && (
                  <p className={`mt-1.5 whitespace-pre-wrap text-[13px] leading-snug ${m.direccion === "out" ? "text-white/85" : "text-ink/90"}`}>
                    {transcript}
                  </p>
                )}
                <p className={`mt-1.5 text-[10px] ${m.direccion === "out" ? "text-white/55" : "text-muted"}`}>
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
    if (a.paused) void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else {
      a.pause();
      setPlaying(false);
    }
  }

  const secs = Math.max(0, Math.round(dur || 0));
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div className="mb-1 flex min-w-[11rem] items-center gap-2.5">
      <audio ref={ref} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
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
        <div className={`h-1 overflow-hidden rounded-full ${outbound ? "bg-white/25" : "bg-line"}`}>
          <div
            className={`h-full rounded-full ${outbound ? "bg-white" : "bg-ink"}`}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
        <p className={`mt-1 text-[10px] tabular-nums ${outbound ? "text-white/60" : "text-muted"}`}>
          {secs > 0 ? `${mm}:${ss}` : "Nota de voz"}
        </p>
      </div>
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
  const cierra = chat.etapa === "ganado" || chat.etapa === "perdido";
  return (
    <form onSubmit={onSubmit} className="flex min-h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <p className="text-sm font-semibold">Ficha</p>
          <p className="mt-0.5 text-[11px] text-muted">{telefono(chat.waNumero)}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-muted lg:hidden">Cerrar</button>
      </div>
      <input type="hidden" name="conversacion_id" value={chat.id} />
      <div className="flex-1 space-y-5 p-5">
        {(chat.borrador || chat.proximaAccion?.startsWith("Borrador: ")) && (
          <div className="rounded-xl bg-ambar-wash p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ambar">Borrador de Lucía</p>
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink">
              {chat.borrador || chat.proximaAccion?.replace(/^Borrador:\s*/, "")}
            </p>
            <button
              type="button"
              onClick={() => onUsarBorrador(chat.borrador || chat.proximaAccion?.replace(/^Borrador:\s*/, "") || "")}
              className="mt-3 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white"
            >
              Usar en el mensaje
            </button>
          </div>
        )}
        {chat.resumen && (
          <div className="rounded-xl bg-azul-wash p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-azul">Resumen</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink">{chat.resumen}</p>
            {chat.temperaturaMotivo && (
              <p className="mt-2 text-[11px] leading-relaxed text-muted">{chat.temperaturaMotivo}</p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <SelectFicha label="Temperatura" name="temperatura" defaultValue={chat.temperatura}>
            <option value="caliente">Caliente</option>
            <option value="tibio">Tibio</option>
            <option value="frio">Frío</option>
          </SelectFicha>
          <SelectFicha label="Etapa" name="etapa" defaultValue={chat.etapa}>
            {ETAPAS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </SelectFicha>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectFicha label="Responsable" name="asesor_id" defaultValue={chat.asesorId ?? ""}>
            <option value="">Sin asignar</option>
            {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </SelectFicha>
          <SelectFicha label="Atención" name="modo_atencion" defaultValue={chat.modoAtencion}>
            <option value="lucia">Lucía</option>
            <option value="humano">Persona</option>
          </SelectFicha>
        </div>
        <Campo label="Nombre" name="nombre" defaultValue={chat.nombre ?? ""} />
        <Campo label="Carro o interés" name="interes" defaultValue={chat.interes ?? ""} />
        <Campo label="Ubicación" name="lugar" defaultValue={chat.lugar ?? ""} />
        <Campo label="Próxima acción" name="proxima_accion" defaultValue={chat.proximaAccion ?? ""} />
        <Campo
          label="Seguimiento"
          name="seguimiento_at"
          type="datetime-local"
          defaultValue={datetimeLocal(chat.seguimientoAt)}
        />
        {(cierra || chat.resultado || chat.motivoPerdida) && (
          <div className="space-y-3 rounded-xl bg-surface-2 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Cierre</p>
            <Campo label="Resultado" name="resultado" defaultValue={chat.resultado ?? ""} />
            <Campo label="Motivo de pérdida" name="motivo_perdida" defaultValue={chat.motivoPerdida ?? ""} />
          </div>
        )}
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

function AgendarModal({
  chat,
  pending,
  onClose,
  onOk,
  onError,
  start,
}: {
  chat: ChatComercial;
  pending: boolean;
  onClose: () => void;
  onOk: (
    texto: string | undefined,
    errorEnvio: string | undefined,
    enviado: boolean | undefined,
    cita: { nombre: string; lugar: string; fecha: string; hora: string; sede: string },
  ) => void;
  onError: (msg: string) => void;
  start: (fn: () => Promise<void>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="w-full max-w-md rounded-xl bg-surface p-5 shadow-lg ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          data.set("conversacion_id", chat.id);
          const cita = {
            nombre: String(data.get("nombre") ?? ""),
            lugar: String(data.get("lugar") ?? ""),
            fecha: String(data.get("fecha") ?? ""),
            hora: String(data.get("hora") ?? ""),
            sede: String(data.get("sede") ?? "juan_diaz"),
          };
          start(async () => {
            const r = await agendarCitaComercial(data);
            if (!r.ok) {
              onError(r.error ?? "No pude agendar.");
              return;
            }
            onOk(r.texto, r.error, r.enviado, cita);
          });
        }}
      >
        <p className="text-sm font-semibold">{chat.citaFecha ? "Reagendar visita" : "Agendar visita"}</p>
        <p className="mt-1 text-xs text-muted">{nombreChat(chat)}</p>
        <div className="mt-4 space-y-3">
          <Campo label="Nombre" name="nombre" defaultValue={chat.nombre ?? ""} />
          <Campo label="Lugar del cliente" name="lugar" defaultValue={chat.lugar ?? ""} />
          <SelectFicha label="Sede" name="sede" defaultValue={chat.citaSede === "chorrera" ? "chorrera" : "juan_diaz"}>
            <option value="juan_diaz">Juan Díaz</option>
            <option value="chorrera">La Chorrera</option>
          </SelectFicha>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha" name="fecha" type="date" defaultValue={chat.citaFecha ?? ""} />
            <Campo label="Hora" name="hora" type="time" defaultValue={chat.citaHora ?? "10:00"} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line hover:bg-surface-2">
            Cancelar
          </button>
          <button disabled={pending} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50">
            Guardar cita
          </button>
        </div>
      </form>
    </div>
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
        className="mt-1.5 h-9 w-full rounded-lg bg-paper px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
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
        className="mt-1.5 h-9 w-full rounded-lg bg-paper px-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-ink/20"
      >
        {children}
      </select>
    </label>
  );
}

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
  const sampleRate = 16000;
  const srcRate = buffer.sampleRate;
  const samples = Math.max(1, Math.round((buffer.length * sampleRate) / srcRate));
  const dataSize = samples * 2;
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
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const last = buffer.length - 1;
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    const x = (i * srcRate) / sampleRate;
    const i0 = Math.min(last, Math.floor(x));
    const i1 = Math.min(last, i0 + 1);
    const t = x - i0;
    const a0 = ch0[i0] ?? 0;
    const a1 = ch0[i1] ?? 0;
    let s = a0 * (1 - t) + a1 * t;
    if (ch1) {
      const b0 = ch1[i0] ?? 0;
      const b1 = ch1[i1] ?? 0;
      s = (s + b0 * (1 - t) + b1 * t) / 2;
    }
    const n = Math.max(-1, Math.min(1, s));
    view.setInt16(offset, n < 0 ? n * 0x8000 : n * 0x7fff, true);
    offset += 2;
  }
  return out;
}
