// Prueba de conexión a OpenRouter.
// Correr:  node --env-file=.env.local scripts/test-ai.mjs
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error("❌ Falta OPENROUTER_API_KEY en el entorno.");
  process.exit(1);
}

const openrouter = createOpenRouter({ apiKey: key });
const modelId = process.env.AI_MODEL_TEXTO ?? "openai/gpt-4o-mini";

try {
  const { text } = await generateText({
    model: openrouter(modelId),
    prompt: "Responde únicamente con la palabra: OK",
  });
  console.log(`✅ OpenRouter conectado (modelo: ${modelId})`);
  console.log(`   Respuesta: ${text.trim()}`);
} catch (e) {
  console.error(`❌ Falló la llamada a OpenRouter (modelo: ${modelId})`);
  console.error(`   ${e?.message ?? e}`);
  process.exit(1);
}
