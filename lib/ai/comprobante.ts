import { generateObject } from "ai";
import { z } from "zod";
import { modeloVision } from "./provider";

// Datos que extraemos de la captura de una transferencia bancaria.
export const ComprobanteSchema = z.object({
  es_comprobante: z
    .boolean()
    .describe(
      "true SOLO si la imagen es de verdad un comprobante/captura de una transferencia o pago bancario (se ven datos de pago: monto, banco, referencia, cuenta). false si es cualquier otra cosa: selfie, foto de un carro/persona, meme, pantallazo sin datos de pago, documento no relacionado.",
    ),
  monto: z.number().nullable().describe("Monto de la transferencia en dólares (USD)"),
  fecha: z.string().nullable().describe("Fecha del pago tal como se ve; formato YYYY-MM-DD si es posible"),
  referencia: z.string().nullable().describe("Número de referencia / confirmación de la transacción"),
  banco: z.string().nullable().describe("Banco emisor si es visible (ej. Banco General)"),
  numero_carro: z
    .string()
    .nullable()
    .describe(
      "Número de carro/unidad que el cliente escribe en el COMENTARIO o descripción del pago (ej. 'CARRO 144' -> '144'). Es el ancla para conciliar. null si no aparece.",
    ),
  cuenta_destino: z
    .string()
    .nullable()
    .describe("Número de cuenta destino a la que se transfirió, si es visible. null si no aparece."),
  confianza: z.enum(["alta", "media", "baja"]).describe("Qué tan confiable es la lectura"),
});

export type Comprobante = z.infer<typeof ComprobanteSchema>;

const PROMPT = `Eres el asistente de cartera de una empresa de renta de autos en Panamá.
Te paso una imagen que el cliente envió por WhatsApp.

PRIMERO decide si la imagen ES REALMENTE un comprobante de pago / transferencia bancaria
(Banco General u otros bancos panameños), donde se vean datos de pago (monto, banco, referencia,
cuenta). Si NO lo es (una selfie, la foto de un carro, un meme, un pantallazo sin datos de pago,
un documento no relacionado), pon es_comprobante = false y TODOS los demás campos en null.

Si SÍ es un comprobante, pon es_comprobante = true y extrae con precisión:
- monto en USD
- fecha (YYYY-MM-DD)
- número de referencia / confirmación
- banco emisor
- número de carro/unidad: el cliente lo escribe en el COMENTARIO o descripción del pago (ej. "CARRO 144", "144", "unidad 144"). Devuelve solo el número.
- cuenta destino: el número de cuenta al que se transfirió, si se ve.
Si un dato no se ve claro, ponlo en null y baja la confianza. NO inventes valores.`;

/**
 * Lee un comprobante y devuelve los campos estructurados.
 * `image` acepta un Buffer (de downloadMedia) o un data URL.
 */
export async function leerComprobante(
  image: Buffer | string,
  mime = "image/jpeg",
): Promise<Comprobante> {
  const imagePart =
    typeof image === "string"
      ? image
      : `data:${mime};base64,${image.toString("base64")}`;

  const { object } = await generateObject({
    model: modeloVision(),
    schema: ComprobanteSchema,
    maxOutputTokens: 800,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image", image: imagePart },
        ],
      },
    ],
  });

  return object;
}
