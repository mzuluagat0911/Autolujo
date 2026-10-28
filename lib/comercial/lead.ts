import type { TemperaturaLead } from "./chats";

export type LecturaLead = {
  temperatura: TemperaturaLead;
  score: number;
  motivo: string;
};

const NEGATIVO =
  /\b(ya no (me )?interesa|no estoy interesad[oa]|no quiero (continuar|seguir)|no (me )?escrib(?:an|ir)?|no (me )?contact(?:en|ar)?|deje(n)? eso|no gracias|d[eé]jelo as[ií]|ya no gracias)\b/i;
const CIERRE = /\b(agend|cita|ll[aá]m|separ|reserv|cerrar|firmar|sacar el carro|retirar)\b/i;
const URGENCIA = /\b(hoy|mañana|esta semana|de una vez|lo antes posible|ya)\b/i;
const CONCRETO = /\b(disponible|autom[aá]tico|manual|picanto|accent|kia|hyundai|modelo|año)\b/i;
const DECISION = /\b(requisit|abono|precio|cuota|letra|licencia|document|sede|ubicaci[oó]n)\b/i;

export function lecturaLeadConReglas(
  textos: string[],
  sugerida: LecturaLead,
): LecturaLead {
  const texto = textos.join("\n").slice(-5000);
  if (NEGATIVO.test(texto)) {
    return {
      temperatura: "frio",
      score: Math.min(sugerida.score, 15),
      motivo: "El lead expresó que no quiere continuar o no desea contacto.",
    };
  }

  let reglas = 20;
  const senales: string[] = [];
  if (CIERRE.test(texto)) {
    reglas += 35;
    senales.push("pidió avanzar, llamar o agendar");
  }
  if (URGENCIA.test(texto)) {
    reglas += 20;
    senales.push("mencionó una fecha cercana");
  }
  if (CONCRETO.test(texto)) {
    reglas += 15;
    senales.push("mostró interés concreto en un carro");
  }
  if (DECISION.test(texto)) {
    reglas += 10;
    senales.push("preguntó datos necesarios para decidir");
  }
  const combinado = Math.min(
    100,
    Math.max(0, Math.round(sugerida.score * 0.4 + Math.min(reglas, 100) * 0.6)),
  );
  const temperatura: TemperaturaLead =
    combinado >= 70 ? "caliente" : combinado >= 35 ? "tibio" : "frio";
  return {
    temperatura,
    score: combinado,
    motivo: senales.length
      ? `${sugerida.motivo} Señales verificadas: ${senales.join("; ")}.`
      : sugerida.motivo,
  };
}

export function esSolicitudNoContacto(textos: string[]): boolean {
  return NEGATIVO.test(textos.join("\n").slice(-5000));
}

/** Solo lo que escribió la persona. Lo que mandó Lucía no sube ni baja el interés. */
export function textosDelCliente(historial: { direccion: "in" | "out"; texto: string }[]): string[] {
  return historial.filter((m) => m.direccion === "in").map((m) => m.texto);
}

/** Nombre del perfil de WhatsApp. Sin emojis ni símbolos. Vacío si queda un número o basura. */
export function nombreDeWhatsApp(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "")
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (limpio.length < 2 || limpio.length > 80) return null;
  if (!/\p{L}/u.test(limpio)) return null;
  return limpio;
}

/** 1–3 van cerca. 4–7 son un día, tres días, una semana y diez días. El 8 archiva. */
export const INTENTO_ARCHIVO = 8;

export function horasHastaSeguimiento(
  temperatura: TemperaturaLead,
  intento: number,
): number | null {
  if (intento === INTENTO_ARCHIVO) return 48;
  if (intento < 1 || intento > 7) return null;
  if (intento === 4) return 24;
  if (intento === 5) return 72;
  if (intento === 6) return 24 * 7;
  if (intento === 7) return 24 * 10;
  if (temperatura === "caliente") return intento === 1 ? 3 : 24;
  if (temperatura === "tibio") return intento === 1 ? 4 : 48;
  return intento === 1 ? 8 : 48;
}

/** El primer seguimiento retoma el paso pendiente. Los demás tienen texto fijo. */
export function textoSeguimientoLead(opts: {
  nombre: string | null;
  proximaAccion: string | null;
  intento: number;
}): string {
  const nombre = opts.nombre?.trim();
  const saludo = nombre ? `Hola, ${nombre}.` : "Hola.";
  const paso = pasoPendiente(opts.proximaAccion);
  if (opts.intento <= 1) {
    if (paso) return `${saludo} ${paso}`;
    if (esOrdenInterna(opts.proximaAccion)) {
      return `${saludo} ¿Le queda mejor Juan Díaz o La Chorrera? Si ya sabe el día, dígamelo y le dejo la visita.`;
    }
    return `${saludo} Quedé pendiente de su mensaje. ¿Seguimos con el carro?`;
  }
  if (opts.intento === 2) {
    return `${saludo} Si le queda bien, le dejo una cita en Juan Díaz o en La Chorrera. ¿Cuál le sirve?`;
  }
  if (opts.intento === 3) {
    return `${saludo} Lo dejo por aquí por si todavía quiere ver el carro. Cuando quiera, me escribe.`;
  }
  if (opts.intento === 4) {
    return `${saludo} Le escribo de nuevo por si quedó con ganas de ver el carro. ¿Le busco un horario?`;
  }
  if (opts.intento === 5) {
    return `${saludo} Sigo por aquí. Si quiere, le dejo la cita esta semana en Juan Díaz o en La Chorrera.`;
  }
  if (opts.intento === 6) {
    return `${saludo} Pasó una semana. Si todavía busca carro, le aparto la visita.`;
  }
  return `${saludo} Este es el último mensaje. Si quiere el carro, respóndame y le dejo la cita. Si no, cierro el chat.`;
}

function esOrdenInterna(accion: string | null | undefined): boolean {
  const texto = accion?.replace(/\s+/g, " ").trim() ?? "";
  return /^(pedir|confirmar|ofrecer|esperar|llamar|dar seguimiento|revisar|preguntar|agendar|decir|responder|indicar)\b/i.test(
    texto,
  );
}

function pasoPendiente(accion: string | null | undefined): string | null {
  const texto = accion?.replace(/\s+/g, " ").trim() ?? "";
  if (texto.length < 8 || texto.length > 180) return null;
  if (esOrdenInterna(texto)) return null;
  if (/confirmar asistencia|no contactar|no desea/i.test(texto)) return null;
  return /[.?!]$/.test(texto) ? texto : `${texto}.`;
}
