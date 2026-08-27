import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Capa provider-agnostic. Hoy vía OpenRouter; mañana se cambia sin tocar el resto.
const apiKey = process.env.OPENROUTER_API_KEY ?? "";

export const openrouter = createOpenRouter({ apiKey });

// Modelos configurables por env — los afinamos con el benchmark de comprobantes.
export const MODELO_VISION = process.env.AI_MODEL_VISION ?? "google/gemini-2.5-flash";
export const MODELO_TEXTO = process.env.AI_MODEL_TEXTO ?? "openai/gpt-4o-mini";

/** Modelo para leer comprobantes (visión). */
export function modeloVision() {
  return openrouter(MODELO_VISION);
}

/** Modelo para conversación / texto. */
export function modeloTexto() {
  return openrouter(MODELO_TEXTO);
}
