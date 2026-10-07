import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Capa provider-agnostic. Hoy vía OpenRouter; mañana se cambia sin tocar el resto.
const apiKey = process.env.OPENROUTER_API_KEY ?? "";

export const openrouter = createOpenRouter({ apiKey });

// Modelos configurables por env — los afinamos con el benchmark de comprobantes.
// VISION          = lector por defecto (barato, rápido).
// VISION_FALLBACK = modelo más fuerte para comprobantes difíciles (confianza baja).
// TEXTO           = el agente conversacional / operativo.
export const MODELO_VISION = process.env.AI_MODEL_VISION ?? "google/gemini-2.5-flash";
export const MODELO_VISION_FALLBACK =
  process.env.AI_MODEL_VISION_FALLBACK ?? "anthropic/claude-haiku-4.5";
export const MODELO_TEXTO = process.env.AI_MODEL_TEXTO ?? "google/gemini-2.5-flash";
// COMERCIAL = agente de ventas (Lucía). Perilla aparte para poder darle un
// modelo distinto al de cobranza sin tocar a Claudia. Si no se setea, usa el
// mismo que TEXTO.
export const MODELO_COMERCIAL = process.env.AI_MODEL_COMERCIAL ?? MODELO_TEXTO;

/** Modelo para leer comprobantes (visión) — barato por defecto. */
export function modeloVision() {
  return openrouter(MODELO_VISION);
}

/** Modelo de respaldo para comprobantes difíciles (segunda opinión). */
export function modeloVisionFallback() {
  return openrouter(MODELO_VISION_FALLBACK);
}

/** Modelo para conversación / operativa del agente de cobranza (Claudia). */
export function modeloTexto() {
  return openrouter(MODELO_TEXTO);
}

/** Modelo del agente comercial (Lucía). Perilla aparte vía AI_MODEL_COMERCIAL. */
export function modeloComercial() {
  return openrouter(MODELO_COMERCIAL);
}
