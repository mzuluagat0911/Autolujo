export type ModoAgente = "off" | "recomendacion" | "on";

export type DecisionPiloto = {
  responde: boolean;
  envia: boolean;
};

/** Pruebas: responde sola. Solo `off` la apaga. `recomendacion` también envía. */
export function modoAgente(valor = process.env.COMERCIAL_AGENTE): ModoAgente {
  const modo = (valor ?? "on").trim().toLowerCase();
  if (modo === "off") return "off";
  return "on";
}

/** Pruebas: seguimientos y avisos de cita salen. Solo `off` los detiene. */
export function enviosAutomaticos(valor = process.env.COMERCIAL_ENVIOS): boolean {
  return (valor ?? "on").trim().toLowerCase() !== "off";
}

/** Pruebas: entran todos los números, aunque haya una lista de piloto. */
export function numeroEnPiloto(_wa: string, _lista = process.env.COMERCIAL_PILOTO_NUMEROS): boolean {
  return true;
}

export function decisionPiloto(wa: string, entorno?: {
  agente?: string;
  numeros?: string;
}): DecisionPiloto {
  const modo = modoAgente(entorno?.agente);
  if (modo === "off") return { responde: false, envia: false };
  if (!numeroEnPiloto(wa, entorno?.numeros)) return { responde: true, envia: false };
  if (modo === "recomendacion") return { responde: true, envia: false };
  return { responde: true, envia: true };
}

export function resumenPiloto(): { etiqueta: string } {
  const modo = modoAgente();
  const agente = modo === "off" ? "Lucía está apagada." : "Lucía responde a todos los chats.";
  const envios = enviosAutomaticos()
    ? "Los seguimientos y avisos de cita están activos."
    : "Los envíos automáticos están apagados.";
  return { etiqueta: `${agente} ${envios}` };
}

/** El poll no debe colar un chat que no pertenece al filtro activo. */
function inicioHoyPanamaMs(): number {
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Panama",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${hoy}T00:00:00-05:00`).getTime();
}

export function pasaFiltroComercial(
  c: {
    cerradoAt: string | null;
    noLeidos: number;
    necesitaHumano: boolean;
    seguimientoAt: string | null;
    asesorId: string | null;
    temperatura: string;
    etapa: string;
    ultimoEntranteAt?: string | null;
  },
  filtro: string,
  asesorId?: string | null,
): boolean {
  const cerrado = Boolean(c.cerradoAt);
  if (filtro === "cerrados") return cerrado;
  if (cerrado && filtro !== "todos") return false;
  if (filtro === "hoy") {
    const t = c.ultimoEntranteAt ? Date.parse(c.ultimoEntranteAt) : NaN;
    return Number.isFinite(t) && t >= inicioHoyPanamaMs();
  }
  if (filtro === "mios") return Boolean(asesorId) && c.asesorId === asesorId;
  if (filtro === "sin_asignar") return !c.asesorId;
  if (filtro === "calientes") return c.temperatura === "caliente";
  if (filtro === "tibios") return c.temperatura === "tibio";
  if (filtro === "frios") return c.temperatura === "frio";
  if (filtro === "seguimiento") return Boolean(c.seguimientoAt);
  if (filtro === "citas") return c.etapa === "cita";
  if (filtro === "todos") return !cerrado;
  const vencido = c.seguimientoAt ? Date.parse(c.seguimientoAt) <= Date.now() : false;
  return c.noLeidos > 0 || c.necesitaHumano || vencido;
}

export function ordenarPorReciente<T extends { ultimoMensajeAt: string | null }>(chats: T[]): T[] {
  return [...chats].sort((a, b) => {
    const aa = a.ultimoMensajeAt ? Date.parse(a.ultimoMensajeAt) : 0;
    const bb = b.ultimoMensajeAt ? Date.parse(b.ultimoMensajeAt) : 0;
    return (Number.isNaN(bb) ? 0 : bb) - (Number.isNaN(aa) ? 0 : aa);
  });
}
