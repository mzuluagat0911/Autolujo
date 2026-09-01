import { generateText } from "ai";
import { modeloVision } from "./provider";

/** WhatsApp manda "audio/ogg; codecs=opus" — OpenRouter/Gemini no aceptan el sufijo. */
export function normalizarMimeAudio(mime?: string | null): string {
  const raw = (mime ?? "audio/ogg").toLowerCase();
  if (raw.includes("mpeg") || raw.includes("mp3")) return "audio/mpeg";
  if (raw.includes("mp4") || raw.includes("m4a") || raw.includes("aac")) return "audio/mp4";
  if (raw.includes("wav")) return "audio/wav";
  if (raw.includes("webm")) return "audio/webm";
  return "audio/ogg";
}

// Transcribe una nota de voz de WhatsApp (OGG/Opus) a texto.
// Mismo patrón que los comprobantes: data URL en base64, no Buffer crudo.
export async function transcribirAudio(
  audio: Buffer,
  mime = "audio/ogg",
): Promise<string> {
  const mediaType = normalizarMimeAudio(mime);
  const dataUrl = `data:${mediaType};base64,${audio.toString("base64")}`;

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
          { type: "file", data: dataUrl, mediaType },
        ],
      },
    ],
  });

  const limpio = (text ?? "").trim();
  if (!limpio) throw new Error("La transcripción llegó vacía.");
  return limpio;
}
