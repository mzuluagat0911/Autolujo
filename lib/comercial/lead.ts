import type { TemperaturaLead } from "./chats";

export type LecturaLead = {
  temperatura: TemperaturaLead;
  score: number;
  motivo: string;
};

const NEGATIVO =
  /\b(ya no (me )?interesa|no estoy interesad[oa]|no quiero (continuar|seguir)|no (me )?escrib(?:an|ir)?|no (me )?contact(?:en|ar)?|deje(n)? eso)\b/i;
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

export function horasHastaSeguimiento(
  temperatura: TemperaturaLead,
  intento: number,
): number | null {
  if (intento < 1 || intento > 3) return null;
  if (temperatura === "caliente") return intento === 1 ? 3 : 24;
  if (temperatura === "tibio") return intento === 1 ? 24 : 48;
  return 48;
}
