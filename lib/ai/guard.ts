// Última barrera antes de que un mensaje del agente salga a WhatsApp.
//
// El prompt le prohíbe al modelo inventar cifras, dar por recibido un pago y
// revelar que es IA. Pero un prompt es una petición, no una garantía: sobre
// cientos de conversaciones al día, "casi siempre obedece" son varios errores
// de dinero por semana. Aquí se verifica de forma determinista lo que el código
// SÍ puede comprobar, y si algo no cuadra el mensaje no sale.
//
// Los patrones son deliberadamente ESTRECHOS. Escalar silencia al agente en ese
// chat, así que un falso positivo cuesta caro: sale más barato dejar pasar un
// mensaje dudoso que mutar a un cliente que solo preguntaba un horario.

import type { RespuestaAgente } from "./agente";

/** Lo que se responde cuando el mensaje original no pasó la revisión. */
const MENSAJE_SEGURO = "Déjame revisar eso bien y en un momento te escribo por aquí 🙌";

/**
 * Afirmaciones que dan por hecho algo que el sistema no ha confirmado, o que
 * rompen el personaje. Van en afirmativo a propósito: "no me aparece ningún
 * pago registrado" es una respuesta correcta y no debe bloquearse.
 */
const PROHIBIDAS: { re: RegExp; que: string }[] = [
  { re: /\brecib[íi]\s+(tu|el|su)\s+comprobante\b/i, que: "da por recibido un comprobante" },
  { re: /\bgracias\s+por\s+(el|tu|su)\s+comprobante\b/i, que: "da por recibido un comprobante" },
  { re: /\bgracias\s+por\s+(enviarnos|enviar|mandarnos|mandar)\s+(el|tu|su)\s+comprobante\b/i, que: "da por recibido un comprobante" },
  { re: /\brecib(imos|[íi])\s+(tu|el|su)\s+(pago|transferencia|captura)\b/i, que: "da por recibido un pago" },
  { re: /\b(el|tu|su)\s+dinero\s+ya\s+(entr[oó]|est[aá]|lleg[oó])(?:\s|[.,!?]|$)/i, que: "da un pago por aplicado" },
  { re: /\b(el|tu|su)\s+pago\s+ya\s+(lleg[oó]|entr[oó]|cruz[oó])(?:\s|[.,!?]|$)/i, que: "da un pago por aplicado" },
  { re: /\bqued(as|a|ó|o)\s+al\s+d[íi]a\b/i, que: "declara al cliente al día" },
  { re: /\bya\s+(lo\s+|te\s+lo\s+)?(registr[éa]mos|registr[ée]|aplicamos|apliqu[ée]|acreditamos|abonamos)\b/i, que: "da un pago por aplicado" },
  { re: /\b(tu|el|su)\s+pago\s+(ya\s+)?(est[áa]|qued[óo]|fue)\s+(registrado|aplicado|acreditado|confirmado|validado)\b/i, que: "da un pago por aplicado" },
  { re: /\bpago\s+(ya\s+)?(aplicado|acreditado|validado\s+correctamente)\b/i, que: "da un pago por aplicado" },
  { re: /\b(soy|somos)\s+(un[ao]?\s+)?(bot|robot|asistente\s+virtual|inteligencia\s+artificial|ia|modelo\s+de)\b/i, que: "revela que es IA" },
  { re: /\b(soy|somos)\s+(chatgpt|claude|gemini|gpt-?\d*)\b/i, que: "revela que es IA" },
  { re: /\b(chatbot|respuesta\s+autom[áa]tica|mensaje\s+autom[áa]tico)\b/i, que: "revela que es automático" },
  { re: /🤖/u, que: "revela que es IA" },
];

/** "No debes nada" solo es válido si el sistema realmente calculó $0. */
const SALDO_CERO = /\bno\s+(debes|tienes\s+que\s+pagar)\s+nada\b|\best[áa]s\s+al\s+d[íi]a\b|\bpaz\s+y\s+salvo\b/i;

/**
 * Cifra de dinero escrita EN LETRAS (ej. "treinta dólares", "mil doscientos
 * balboas"). montosDelTexto solo ve números, así que deletrear una cifra la
 * saca del control del guard. La política es escribir el dinero en NÚMEROS;
 * una cifra en letras no se puede verificar contra el contexto, así que se
 * bloquea. En la práctica solo aparece cuando el cliente insiste "en letras"
 * (patrón manipulador), y bloquear→escalar es justo la respuesta correcta.
 */
const NUM_PALABRA =
  "(?:cero|una?|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci(?:s[eé]is|siete|ocho|nueve)|veinti\\w+|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien(?:to|tos)?|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil|mill[oó]n(?:es)?)";
const MONEDA_PALABRA = "(?:d[oó]lares?|balboas?|usd)";
const CIFRA_EN_LETRAS = new RegExp(
  `\\b${NUM_PALABRA}(?:\\s+(?:y\\s+)?${NUM_PALABRA})*\\s+${MONEDA_PALABRA}\\b`,
  "i",
);

/**
 * Promesa de que alguien va a responder después. Necesita las dos piezas —un
 * marcador de tiempo y un verbo de contacto— para no confundir "te confirmo que
 * hoy sí corre cuota" (afirmación presente) con "en un momento te confirmo".
 */
const TEMPORAL = /\b(en\s+un\s+momento|en\s+breve|en\s?seguida|m[áa]s\s+tarde|ya\s+mismo|pronto|apenas|en\s+cuanto|ahorita)\b/i;
const CONTACTO = /\b(te|le)\s+(escrib|confirm|avis|respond|contact|llam)\w*|\bse\s+(comunican?|contactan?)\b/i;

/**
 * Cifras de dinero de un texto. Acepta "$35", "$1,250.50", "35 dólares",
 * "USD 35", "B/. 35", "35$". No toma números sueltos (carro 144, las 7:00).
 */
export function montosDelTexto(texto: string): number[] {
  const out: number[] = [];
  const re =
    /(?:\$|usd|b\/\.?|b\.)\s*(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:d[óo]lares|balboas|usd)\b|(\d[\d,]*(?:\.\d{1,2})?)\s*\$/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const n = Number((m[1] ?? m[2] ?? m[3]).replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(Math.round(n * 100) / 100);
  }
  return out;
}

export type Revision = {
  respuesta: RespuestaAgente;
  /** null = el mensaje original pasó sin cambios. */
  intervino: "cifra" | "frase" | "saldo_cero" | "promesa" | "vacio" | null;
  detalle: string | null;
};

/**
 * Revisa la respuesta del agente contra el CONTEXTO que se le dio.
 *
 * - Toda cifra en dólares del mensaje debe existir en el contexto. Se comparan
 *   VALORES, no cadenas, para que "$35", "$35.00" y "35 dólares" sean lo mismo
 *   y un formateo distinto no bloquee un mensaje correcto.
 * - Ninguna afirmación prohibida puede salir.
 * - Una promesa de respuesta obliga a escalar, aunque el modelo no lo pidiera:
 *   sin dueño en el panel, la promesa no le llega a nadie.
 */
export function revisarRespuesta(respuesta: RespuestaAgente, contexto?: string): Revision {
  const mensaje = (respuesta.mensaje ?? "").trim();
  const ctx = contexto ?? "";

  const bloquear = (
    intervino: Exclude<Revision["intervino"], null>,
    detalle: string,
  ): Revision => ({
    respuesta: { mensaje: MENSAJE_SEGURO, pasar_a_humano: true, motivo: detalle },
    intervino,
    detalle,
  });

  if (!mensaje) return bloquear("vacio", "El agente devolvió un mensaje vacío.");

  const recorte = mensaje.slice(0, 120);

  for (const { re, que } of PROHIBIDAS) {
    if (re.test(mensaje)) return bloquear("frase", `El agente ${que}: "${recorte}"`);
  }

  const permitidos = new Set(montosDelTexto(ctx));

  if (SALDO_CERO.test(mensaje) && !permitidos.has(0)) {
    return bloquear("saldo_cero", `El agente dijo que no debe nada, pero el sistema no calculó $0: "${recorte}"`);
  }

  const inventadas = montosDelTexto(mensaje).filter((n) => !permitidos.has(n));
  if (inventadas.length > 0) {
    return bloquear(
      "cifra",
      `El agente dio una cifra que no está en el contexto (${inventadas.map((n) => `$${n}`).join(", ")}): "${recorte}"`,
    );
  }

  // Cifra deletreada en letras: no se puede verificar contra el contexto → fuera.
  if (CIFRA_EN_LETRAS.test(mensaje)) {
    return bloquear("cifra", `El agente escribió una cifra en letras (no verificable): "${recorte}"`);
  }

  // La promesa sí sale —está bien dicha—, pero deja dueño en el panel.
  if (!respuesta.pasar_a_humano && TEMPORAL.test(mensaje) && CONTACTO.test(mensaje)) {
    return {
      respuesta: {
        ...respuesta,
        pasar_a_humano: true,
        motivo: respuesta.motivo ?? "El agente prometió que alguien le escribe.",
      },
      intervino: "promesa",
      detalle: "El agente prometió respuesta sin escalar; se escaló para que la promesa tenga dueño.",
    };
  }

  return { respuesta, intervino: null, detalle: null };
}
