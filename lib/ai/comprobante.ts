import { generateObject } from "ai";
import { z } from "zod";
import { modeloVision, modeloVisionFallback } from "./provider";

// Datos que extraemos de la prueba de pago (transferencia, depósito o cheque).
export const ComprobanteSchema = z.object({
  es_comprobante: z
    .boolean()
    .describe(
      "true si la imagen es una prueba de pago REAL: captura de transferencia bancaria, recibo de depósito, O la foto de un CHEQUE o de un comprobante físico en papel (se ven datos de pago: monto, banco, referencia o número de cuenta). NO tiene que ser un screenshot de app. false solo si es algo claramente no relacionado: selfie, foto de un carro/persona, meme, o imagen sin ningún dato de pago.",
    ),
  tipo: z
    .enum(["transferencia", "deposito", "cheque", "recibo", "otro"])
    .describe("Qué clase de comprobante es. 'cheque' si es la foto de un cheque; 'otro' si es_comprobante = false."),
  monto: z
    .number()
    .nullable()
    .describe(
      "Valor numérico REAL del pago. CUIDADO con los separadores: en Panamá se usa el punto como decimal ($30.00 = treinta). Pero un comprobante en pesos colombianos usa el punto como separador de MILES ($177.500 = ciento setenta y siete mil quinientos, no 177.50). Devuelve el número verdadero según el formato que veas.",
    ),
  moneda: z
    .string()
    .nullable()
    .describe(
      "Moneda del pago: 'USD' para dólares o balboas panameños (B/.); 'COP' para pesos colombianos; el código que corresponda. null si de verdad no se distingue.",
    ),
  fecha: z
    .string()
    .nullable()
    .describe(
      "Fecha EXACTA impresa en el comprobante, en formato YYYY-MM-DD. Léela tal cual aparece (ej. '02 septiembre 2026' -> 2026-09-02; 'Hoy (02 sep)' -> 2026-09-02; '31 Ago 2026' -> 2026-08-31). NUNCA pongas la fecha de hoy por defecto: si no puedes leerla, pon null y baja la confianza.",
    ),
  referencia: z.string().nullable().describe("Número de referencia / confirmación / comprobante de la transacción. En un cheque, el número del cheque."),
  banco: z.string().nullable().describe("Banco o entidad EMISORA (desde dónde se pagó), si es visible."),
  banco_destino: z.string().nullable().describe("Banco o entidad que RECIBE el pago (ej. 'Banco General'), si es visible."),
  numero_carro: z
    .string()
    .nullable()
    .describe(
      "Número de carro/unidad SOLO si el cliente lo escribió en el comentario/descripción (ej. 'CARRO 144', 'auto172' -> '172', 'unidad 144'). Si la descripción dice otra cosa (ej. 'jueves viernes sabado'), pon null. Devuelve solo el número.",
    ),
  cuenta_destino: z
    .string()
    .nullable()
    .describe("Número de cuenta destino a la que se transfirió/depositó, tal como se ve. null si no aparece."),
  confianza: z.enum(["alta", "media", "baja"]).describe("Qué tan confiable es la lectura"),
});

export type Comprobante = z.infer<typeof ComprobanteSchema>;

const PROMPT = `Eres el asistente de cartera de una empresa de renta de autos en Panamá.
Te paso una imagen que el cliente envió por WhatsApp como prueba de pago.

PASO 1 — ¿Es una prueba de pago? Pon es_comprobante = true si es CUALQUIERA de estas:
- captura de una transferencia o pago por app (Banco General, Banistmo, BAC, etc.),
- recibo/voucher de depósito,
- la FOTO de un CHEQUE (tómate el tiempo de leerlo: monto en números y en letras, beneficiario,
  banco, número de cheque, fecha),
- la foto de un comprobante FÍSICO en papel.
No tiene que ser un screenshot de app. Pon es_comprobante = false SOLO si es algo claramente no
relacionado (selfie, foto de un carro/persona, meme, o imagen sin ningún dato de pago). En ese
caso pon el resto de campos en null y tipo = "otro".

PASO 2 — Si es comprobante, extrae con MUCHA precisión:
- tipo: transferencia / deposito / cheque / recibo.
- monto: el valor numérico REAL. Cuidado con los separadores de miles vs decimales (ver abajo).
- moneda: USD si son dólares o balboas (B/.); COP si son pesos colombianos; etc.
- fecha: la fecha EXACTA impresa en el comprobante (YYYY-MM-DD). NUNCA uses la fecha de hoy por
  defecto. Si no la puedes leer, null y baja la confianza.
- referencia / número de confirmación (o número del cheque).
- banco emisor y banco destino, si se ven.
- cuenta destino: el número de cuenta que RECIBE, tal como aparece.
- número de carro: SOLO si el cliente lo puso en el comentario/descripción ("CARRO 144", "auto172").
  Si la descripción dice otra cosa (días, nombres), pon null.

SEPARADORES (crítico para el monto):
- Panamá usa USD/balboas con el punto como DECIMAL: "$30.00" = 30 ; "$1,250.50" = 1250.50.
- Pesos colombianos usan el punto como separador de MILES: "$177.500" = 177500 (moneda COP),
  NO 177.50. Fíjate en la moneda y el contexto del banco para no equivocarte por mil.

NO inventes valores. Si un dato no se ve claro, ponlo en null y baja la confianza.`;

const RANGO_CONFIANZA = { alta: 3, media: 2, baja: 1 } as const;

/** ¿Vale la pena pedir una segunda opinión al modelo más fuerte? */
function lecturaFloja(c: Comprobante): boolean {
  if (!c.es_comprobante) return false; // no es comprobante: no hay nada que releer
  // La fecha es crítica (detecta comprobantes viejos/reusados): si falta, relee.
  return c.confianza === "baja" || c.monto == null || c.fecha == null || c.numero_carro == null;
}

function puntaje(c: Comprobante): number {
  return (
    RANGO_CONFIANZA[c.confianza] * 10 +
    (c.monto != null ? 4 : 0) +
    (c.numero_carro != null ? 3 : 0) +
    (c.referencia != null ? 2 : 0) +
    (c.cuenta_destino != null ? 1 : 0)
  );
}

/** Se queda con la lectura más completa de las dos. */
function mejor(a: Comprobante, b: Comprobante): Comprobante {
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

// ---------------------------------------------------------------------------
// Lectura de VARIOS comprobantes en una sola foto.
// La gente fotografía 2–3 recibos juntos (ej. dos depósitos). Con un solo
// objeto se perdía todo menos uno. Aquí devolvemos una lista: un pago por recibo.
// ---------------------------------------------------------------------------

const ComprobantesSchema = z.object({
  comprobantes: z
    .array(ComprobanteSchema)
    .describe("Un elemento por CADA comprobante/recibo/pago visible en la imagen."),
});

const PROMPT_LISTA = `${PROMPT}

MUY IMPORTANTE — puede haber MÁS DE UN comprobante en la MISMA imagen (ej. dos o tres
recibos de depósito juntos, o varias capturas en un collage). Devuelve un elemento por CADA
pago que veas, con sus propios datos (monto, cuenta destino, referencia, fecha, carro).
- Si hay un solo comprobante, devuelve un solo elemento.
- Si NO hay ningún comprobante, devuelve un solo elemento con es_comprobante = false.
No mezcles dos recibos en uno ni inventes recibos que no están.`;

async function extraerLista(
  modelo: ReturnType<typeof modeloVision>,
  imagePart: string,
): Promise<Comprobante[]> {
  const { object } = await generateObject({
    model: modelo,
    schema: ComprobantesSchema,
    maxOutputTokens: 1600,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT_LISTA },
          { type: "image", image: imagePart },
        ],
      },
    ],
  });
  return object.comprobantes ?? [];
}

/** ¿Alguna lectura válida de la lista quedó floja? */
function listaFloja(lista: Comprobante[]): boolean {
  const validos = lista.filter((c) => c.es_comprobante);
  if (validos.length === 0) return true; // nada válido: vale la pena una segunda opinión
  return validos.some(lecturaFloja);
}

/** Más comprobantes válidos y mejor leídos = mejor lista. */
function puntajeLista(lista: Comprobante[]): number {
  const validos = lista.filter((c) => c.es_comprobante);
  return validos.length * 100 + validos.reduce((s, c) => s + puntaje(c), 0);
}

/**
 * Lee TODOS los comprobantes de una imagen. Devuelve una lista (normalmente 1).
 * Empieza con el modelo barato; si la lista queda floja o vacía, pide una
 * segunda opinión al modelo fuerte y se queda con la lista más completa.
 */
export async function leerComprobantes(
  image: Buffer | string,
  mime = "image/jpeg",
): Promise<Comprobante[]> {
  const imagePart =
    typeof image === "string" ? image : `data:${mime};base64,${image.toString("base64")}`;

  const primera = await extraerLista(modeloVision(), imagePart);
  if (!listaFloja(primera)) return primera;

  try {
    const segunda = await extraerLista(modeloVisionFallback(), imagePart);
    return puntajeLista(segunda) > puntajeLista(primera) ? segunda : primera;
  } catch (e) {
    console.error("[comprobante] el modelo de respaldo (lista) falló:", e);
    return primera;
  }
}
