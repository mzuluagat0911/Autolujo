import { generateObject } from "ai";
import { z } from "zod";
import { modeloVision, modeloVisionFallback } from "./provider";

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

const RANGO_CONFIANZA = { alta: 3, media: 2, baja: 1 } as const;

/** ¿Vale la pena pedir una segunda opinión al modelo más fuerte? */
function lecturaFloja(c: Comprobante): boolean {
  if (!c.es_comprobante) return false; // no es comprobante: no hay nada que releer
  return c.confianza === "baja" || c.monto == null || c.numero_carro == null;
}

/** Se queda con la lectura más completa de las dos. */
function mejor(a: Comprobante, b: Comprobante): Comprobante {
  const puntaje = (c: Comprobante) =>
    RANGO_CONFIANZA[c.confianza] * 10 +
    (c.monto != null ? 4 : 0) +
    (c.numero_carro != null ? 3 : 0) +
    (c.referencia != null ? 2 : 0) +
    (c.cuenta_destino != null ? 1 : 0);
  return puntaje(b) > puntaje(a) ? b : a;
}

async function extraer(
  modelo: ReturnType<typeof modeloVision>,
  imagePart: string,
): Promise<Comprobante> {
  const { object } = await generateObject({
    model: modelo,
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

/**
 * Lee un comprobante y devuelve los campos estructurados.
 * `image` acepta un Buffer (de downloadMedia) o un data URL.
 *
 * Empieza con el modelo barato; si la lectura queda floja (confianza baja o
 * sin monto/carro), pide una segunda opinión al modelo fuerte. De un
 * comprobante mal leído salen pagos mal aplicados, así que la relectura sale
 * más barata que el error.
 */
export async function leerComprobante(
  image: Buffer | string,
  mime = "image/jpeg",
): Promise<Comprobante> {
  const imagePart =
    typeof image === "string"
      ? image
      : `data:${mime};base64,${image.toString("base64")}`;

  const primera = await extraer(modeloVision(), imagePart);
  if (!lecturaFloja(primera)) return primera;

  try {
    const segunda = await extraer(modeloVisionFallback(), imagePart);
    return mejor(primera, segunda);
  } catch (e) {
    console.error("[comprobante] el modelo de respaldo falló:", e);
    return primera;
  }
}
