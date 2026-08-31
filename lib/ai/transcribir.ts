import { generateText } from "ai";
import { modeloVision } from "./provider";

// Transcribe una nota de voz de WhatsApp (OGG/Opus) a texto, usando el modelo
// multimodal (Gemini) vía OpenRouter — el mismo que ya usamos para imágenes.
export async function transcribirAudio(
  audio: Buffer,
  mime = "audio/ogg",
): Promise<string> {
  const { text } = await generateText({
    model: modeloVision(),
    maxOutputTokens: 500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Transcribe esta nota de voz de WhatsApp al español. Devuelve ÚNICAMENTE el texto " +
              "de lo que dijo la persona, sin comentarios, sin comillas y sin traducir.",
          },
          { type: "file", data: audio, mediaType: mime },
        ],
      },
    ],
  });
  return text.trim();
}
