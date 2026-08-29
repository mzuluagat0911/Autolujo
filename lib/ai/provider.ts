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

/** Modelo para leer comprobantes (visión) — barato por defecto. */
export function modeloVision() {
  return openrouter(MODELO_VISION);
}

/** Modelo de respaldo para comprobantes difíciles (segunda opinión). */
export function modeloVisionFallback() {
  return openrouter(MODELO_VISION_FALLBACK);
}

/** Modelo para conversación / operativa del agente. */
export function modeloTexto() {
  return openrouter(MODELO_TEXTO);
}
