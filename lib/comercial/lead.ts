import type { TemperaturaLead } from "./chats";

export type LecturaLead = {
  temperatura: TemperaturaLead;
  score: number;
  motivo: string;
};

const NEGATIVO =
  /\b(ya no (me )?interesa|no estoy interesad[oa]|no quiero (continuar|seguir)|no (me )?escrib(?:an|ir)?|no (me )?contact(?:en|ar)?|deje(n)? eso|no gracias|d[eé]jelo as[ií]|ya no gracias|no recibir mensajes|no (quiero )?recibir (m[aá]s )?mensajes|dejar de (escribirme|contactarme)|no me escriba(n)? m[aá]s)\b/i;
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

export type AtajoRetomar = "agendar" | "ver_carros" | "no_contactar";

/** Botones de `retomar_venta`. Van por texto fijo, sin modelo. */
export function atajoBotonRetomar(texto: string): AtajoRetomar | null {
  const t = planoLead(texto);
  if (!t) return null;
  if (t === "si quiero agendar") return "agendar";
  if (t === "ver carros disponibles" || t === "ver carros") return "ver_carros";
  if (t === "no recibir mensajes") return "no_contactar";
  return null;
}

export function textoAtajoRetomar(atajo: AtajoRetomar): string {
  if (atajo === "agendar") {
    return "¿Le queda mejor Juan Díaz o La Chorrera? Si ya tiene día, se lo dejo.";
  }
  if (atajo === "ver_carros") {
    return "Tenemos Hyundai Grand i10 desde 2020 y Kia Soluto desde 2024. Letras desde $25. ¿Cuál le llama más?";
  }
  return "Listo, no le escribo más. Si cambia de opinión, aquí estamos.";
}

/** Solo lo que escribió la persona. Lo que mandó Lucía no sube ni baja el interés. */
export function textosDelCliente(historial: { direccion: "in" | "out"; texto: string }[]): string[] {
  return historial.filter((m) => m.direccion === "in").map((m) => m.texto);
}

const FRASE_NO_NOMBRE =
  /alabado|aleluya|bendicion|gloria a dios|dios es|sea el senor|fe amor|amor paz|productos|infraestructura|milanesa|\bchannel\b|\binavic\b|facebook user|usuario de facebook/;
const SOLO_NO_NOMBRE =
  /^(dios|jesus|cristo|amen|aleluya|senor|channel|oficial|official|user|unknown|negocio|empresa|productos)$/;

function planoLead(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Nombre del perfil de WhatsApp. Sin emojis, slogans ni apodos que no son de persona. */
export function nombreDeWhatsApp(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "")
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (limpio.length < 2 || limpio.length > 80) return null;
  if (!/\p{L}/u.test(limpio)) return null;
  const plano = planoLead(limpio);
  if (!plano) return null;
  if (FRASE_NO_NOMBRE.test(plano) || SOLO_NO_NOMBRE.test(plano)) return null;
  const tokens = plano.split(" ").filter(Boolean);
  if (tokens.length > 4) return null;
  if (tokens.filter((t) => t.length === 1).length >= 2) return null;
  if (/\b(es|sea|somos|son|tiene|vive)\b/.test(plano)) return null;
  return limpio;
}

export const MOTIVO_PIDIO_ASESOR = "Pidió hablar con un asesor";

export function esPausaPorAsesor(motivo: string | null | undefined): boolean {
  return /pidi[oó] hablar con un asesor|quiere (un )?asesor|que lo llamen/i.test(motivo ?? "");
}

/** Pregunta si Lucía es un bot, no pide una persona. */
export function preguntaSiEsBot(texto: string): boolean {
  return /eres (un |una )?(bot|agente|ia|inteligencia)|es (un |una )?(bot|agente|ia)\b/.test(planoLead(texto));
}

/** Quiere un asesor, un humano o que lo llamen. Lucía da el teléfono y se calla. */
export function pideAsesorHumano(texto: string): boolean {
  if (preguntaSiEsBot(texto)) return false;
  const t = planoLead(texto);
  return (
    /habl(?:a|e|ale|arle|ame|en) con (un |una )?(agente|asesor|persona|humano|alguien)/.test(t)
    || /pasar(me)? con (un |una )?(agente|asesor|persona|humano)/.test(t)
    || /quiero (hablar con |un |una )?(asesor|agente|persona)/.test(t)
    || /hablar con alguien/.test(t)
    || /un (asesor|humano)( por favor)?$/.test(t)
    || /que me llamen|pueden llamarme|puede llamarme|necesito que me llamen|quiero que me llamen/.test(t)
    || /^(llameme|llamame)$/.test(t)
  );
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
  const nombre = nombreDeWhatsApp(opts.nombre);
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
