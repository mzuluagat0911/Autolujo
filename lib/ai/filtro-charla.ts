// Filtro barato ANTES del LLM. "ok", "gracias" y un emoji no se contestan:
// cada respuesta se cobra. Si hay duda, pasa al agente.
//
// El dinero, el reclamo y el comprobante NUNCA se filtran aquí.

export type DestinoCharla =
  | { destinar: "agente" }
  | { destinar: "silencio" }
  | { destinar: "canned"; mensaje: string };

/** Palabras que convierten el mensaje en asunto de cartera → Marcela. */
const INTENTO =
  /\b(debo|debe|debemos|saldo|cuot[ao]s?|letra|pag(o|ar|ue|u[eé]|amos)|pagu[eé]|cancel[eé]|anoche|antier|anteayer|comprobante|captura|transfer|deposit|cuenta|banco|recargo|multa|descuento|arreglo|acuerdo|cu[aá]nto|mora|atrasad|pendiente|carro|placa|contrato|oficina|efectivo|dat[aá]fono|tarde|puntual|extracto|concili|interior|permiso|salida|viaje|penonome|penonom[eé]|santiago|aguadulce|tablas|chitre|chitr[eé]|david|chiriqui|chiriqu[ií]|aval)\b/i;

const SOLO_RISA = /^(j(a|e)+)+s?$/i;

const ACK = new Set([
  "ok", "okay", "okey", "oki", "okis", "okii",
  "dale", "va", "listo", "bien", "bueno", "perfecto", "super",
  "claro", "sale", "weno", "buena", "buenisimo", "excelente",
  "sip", "sep", "si",
  "gracias", "gracia", "grax", "thanks", "ty", "thx",
  "de acuerdo", "esta bien", "ta bien", "todo bien",
  "ok gracias", "gracias ok", "ok dale", "dale ok",
  "listo gracias", "gracias listo", "dale gracias", "gracias dale",
  "mil gracias", "muchas gracias", "muchisimas gracias",
  "gracias a ti", "gracias a usted",
]);

function stripAcentos(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Quita emoji, puntuación y espacios; deja letras/números. */
export function normalizarCharla(texto: string): string {
  const sinEmoji = texto.replace(/[\p{Extended_Pictographic}\p{So}\uFE0F\u200D]/gu, " ");
  return stripAcentos(sinEmoji)
    .toLowerCase()
    .replace(/[¿?¡!.,;:…"'“”‘’\-_/\\()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function esGracias(norm: string): boolean {
  return /gracias|grax|thanks|\bthx\b|\bty\b/.test(norm);
}

function ultimoFuePregunta(ultimoSaliente: string | null | undefined): boolean {
  if (!ultimoSaliente) return false;
  return /[?]/.test(ultimoSaliente) || /¿/.test(ultimoSaliente);
}

/**
 * @param texto mensaje del cliente (texto o transcripción de audio)
 * @param ultimoSaliente último mensaje que salió hacia el cliente (no system)
 */
export function destinarCharla(
  texto: string,
  ultimoSaliente?: string | null,
): DestinoCharla {
  const crudo = (texto ?? "").trim();
  if (!crudo) return { destinar: "silencio" };

  const norm = normalizarCharla(crudo);
  if (!norm) return { destinar: "silencio" }; // solo emoji / signos

  if (INTENTO.test(norm) || INTENTO.test(crudo)) return { destinar: "agente" };
  if (/pana\s*-?\s*pass/i.test(norm) || /pana\s*-?\s*pass/i.test(crudo)) return { destinar: "agente" };

  if (norm.length > 48) return { destinar: "agente" };

  if (SOLO_RISA.test(norm.replace(/\s/g, ""))) return { destinar: "silencio" };

  if (ACK.has(norm)) {
    // "sí" / "ok" / "dale" a una pregunta del agente SÍ es respuesta de negocio.
    // "gracias" no: contestarlo también se cobra.
    if (ultimoFuePregunta(ultimoSaliente) && !esGracias(norm)) {
      return { destinar: "agente" };
    }
    return { destinar: "silencio" };
  }

  return { destinar: "agente" };
}
