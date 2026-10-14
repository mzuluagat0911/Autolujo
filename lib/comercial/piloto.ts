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

export function ordenarPorReciente<T extends { ultimoMensajeAt: string | null }>(chats: T[]): T[] {
  return [...chats].sort((a, b) => {
    const aa = a.ultimoMensajeAt ? Date.parse(a.ultimoMensajeAt) : 0;
    const bb = b.ultimoMensajeAt ? Date.parse(b.ultimoMensajeAt) : 0;
    return (Number.isNaN(bb) ? 0 : bb) - (Number.isNaN(aa) ? 0 : aa);
  });
}
