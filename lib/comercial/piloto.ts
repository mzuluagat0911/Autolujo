export type ModoAgente = "off" | "recomendacion" | "on";

export type DecisionPiloto = {
  responde: boolean;
  envia: boolean;
};

/** Sin variable, Lucía solo deja borradores. `on` responde sola. `off` no llama al modelo. */
export function modoAgente(valor = process.env.COMERCIAL_AGENTE): ModoAgente {
  const modo = (valor ?? "recomendacion").trim().toLowerCase();
  if (modo === "on" || modo === "off" || modo === "recomendacion") return modo;
  return "recomendacion";
}

/** Sin variable, seguimientos y avisos de cita no salen. `on` los activa. */
export function enviosAutomaticos(valor = process.env.COMERCIAL_ENVIOS): boolean {
  return (valor ?? "").trim().toLowerCase() === "on";
}

/** Lista vacía: entran todos. Con números, solo esos reciben el modo activo. */
export function numeroEnPiloto(wa: string, lista = process.env.COMERCIAL_PILOTO_NUMEROS): boolean {
  const raw = (lista ?? "").trim();
  if (!raw) return true;
  const destino = wa.replace(/\D/g, "");
  if (destino.length < 8) return false;
  return raw.split(/[,;\s]+/).some((item) => {
    const digitos = item.replace(/\D/g, "");
    return digitos.length >= 8 && (destino.endsWith(digitos) || digitos.endsWith(destino));
  });
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
  const acotado = Boolean((process.env.COMERCIAL_PILOTO_NUMEROS ?? "").trim());
  const agente =
    modo === "off"
      ? "Lucía está apagada."
      : modo === "recomendacion"
        ? "Lucía deja borradores y no responde sola."
        : acotado
          ? "Lucía responde solo a los números del piloto."
          : "Lucía responde a todos los chats.";
  const envios = enviosAutomaticos()
    ? "Los seguimientos y avisos de cita están activos."
    : "Los envíos automáticos están apagados.";
  return { etiqueta: `${agente} ${envios}` };
}

export function ordenarPorReciente<T extends { ultimoMensajeAt: string | null }>(chats: T[]): T[] {
  return [...chats].sort((a, b) => {
    const aa = a.ultimoMensajeAt ? Date.parse(a.ultimoMensajeAt) : 0;
    const bb = b.ultimoMensajeAt ? Date.parse(b.ultimoMensajeAt) : 0;
    return (Number.isNaN(bb) ? 0 : bb) - (Number.isNaN(aa) ? 0 : aa);
  });
}
