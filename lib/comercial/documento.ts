import { generateObject } from "ai";
import { z } from "zod";
import { modeloVision } from "@/lib/ai/provider";
import { createServerSupabase } from "@/lib/supabase/server";

const Lectura = z.object({
  es_documento: z
    .boolean()
    .describe(
      "true si es cédula, licencia, carnet de residencia, récord policivo, paz y salvo, historial de tránsito o recibo de agua, luz, teléfono o cable. false si es un carro, una persona, un meme o algo que no es un requisito.",
    ),
  que: z.string().nullable().describe("Nombre corto del documento, o null si no lo es."),
});

/** ¿La foto es un requisito para el preaprobado? Si la lectura falla, se trata como documento. */
export async function esDocumentoRequisito(
  bytes: Buffer,
  mime: string,
): Promise<{ esDocumento: boolean; que: string | null }> {
  try {
    const mediaType = mime.includes("png") ? "image/png" : "image/jpeg";
    const dataUrl = `data:${mediaType};base64,${bytes.toString("base64")}`;
    const { object } = await generateObject({
      model: modeloVision(),
      schema: Lectura,
      maxOutputTokens: 120,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Mira la foto. Di si es un documento de requisito para rentar un carro en Panamá.",
            },
            { type: "image", image: dataUrl },
          ],
        },
      ],
    });
    return { esDocumento: object.es_documento, que: object.que };
  } catch (e) {
    console.error("[comercial] no pude leer la foto:", e instanceof Error ? e.message : e);
    return { esDocumento: true, que: null };
  }
}

/** Guarda la foto del lead en el bucket privado de comprobantes. */
export async function guardarFotoComercial(bytes: Buffer, mime: string): Promise<string> {
  const sb = createServerSupabase();
  const ext = mime.includes("png") ? "png" : "jpg";
  const path = `comercial/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("comprobantes").upload(path, bytes, {
    contentType: mime.includes("png") ? "image/png" : "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
