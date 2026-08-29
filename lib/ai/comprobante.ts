import { generateObject } from "ai";
import { z } from "zod";
import { modeloVision } from "./provider";

// Datos que extraemos de la captura de una transferencia bancaria.
export const ComprobanteSchema = z.object({
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
Te paso la captura de un comprobante de transferencia bancaria (Banco General y otros bancos panameños).
Extrae con precisión:
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
