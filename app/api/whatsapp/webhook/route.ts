import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { sendText, downloadMedia } from "@/lib/whatsapp/client";
import { leerComprobantes, type Comprobante } from "@/lib/ai/comprobante";
import {
  obtenerConversacion,
  registrarMensaje,
  procesarPagoComprobante,
  subirComprobante,
  reclamarMensajeEntrante,
  completarMensaje,
  historialReciente,
  marcarEscalada,
  marcarNecesitaHumano,
  marcarPendienteDeRespuesta,
  notasRecientes,
  hayImagenEntranteReciente,
  resumenContrato,
  type Conversacion,
} from "@/lib/cartera/pipeline";
import { responderAgente } from "@/lib/ai/agente";
import { revisarRespuesta } from "@/lib/ai/guard";
import { destinarCharla } from "@/lib/ai/filtro-charla";
import { transcribirAudio } from "@/lib/ai/transcribir";

type Conv = Conversacion;

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// GET — verificación del webhook (handshake de Meta).
// Meta llama con hub.mode, hub.verify_token y hub.challenge.
// ---------------------------------------------------------------------------
export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — recepción de eventos (mensajes entrantes).
// Verifica la firma HMAC con el App Secret, luego procesa.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verificarFirma(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Meta reintenta si no recibe 200 rápido: procesamos con try/catch y siempre 200.
  try {
    await procesar(payload);
  } catch (e) {
    console.error("[whatsapp/webhook] error procesando:", e);
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function verificarFirma(raw: string, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    // Sin secret, cualquiera puede inyectar mensajes falsos y manejar al
    // agente. En dev se deja pasar; en producción se cierra.
    if (process.env.NODE_ENV === "production") {
      console.error("[whatsapp/webhook] falta META_APP_SECRET: se rechaza el evento.");
      return false;
    }
    return true;
  }
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function procesar(payload: WebhookPayload) {
  const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (!Array.isArray(messages)) return; // estados de entrega, etc. — ignorar por ahora

  for (const msg of messages) {
    if (!msg.from) continue;
    try {
      await manejarMensaje(msg);
    } catch (e) {
      console.error("[whatsapp/webhook] error en mensaje:", e);
    }
  }
}

// Responde y deja registrado el mensaje saliente en la conversación.
// Si el envío falla, deja el ERROR guardado en la conversación para diagnóstico.
async function responder(conversacionId: string, from: string, texto: string, pagoId?: string) {
  try {
    await sendText(from, texto);
    await registrarMensaje({ conversacionId, direccion: "out", texto, pagoId: pagoId ?? null });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("[whatsapp/webhook] sendText falló:", err);
    await registrarMensaje({
      conversacionId, direccion: "out", tipo: "system",
      texto: `⚠️ ENVÍO FALLÓ: ${err}`,
    });
    await marcarPendienteDeRespuesta(conversacionId, "No se pudo enviar la respuesta por WhatsApp.");
  }
}

/**
 * Se le prometió al cliente que alguien le escribe. Deja la conversación en
 * la cola de pendientes para que la promesa tenga dueño; sin esto el chat se
 * queda mudo y nadie se entera.
 */
async function responderYEscalar(
  conversacionId: string,
  from: string,
  texto: string,
  motivo: string,
) {
  await responder(conversacionId, from, texto);
  await marcarPendienteDeRespuesta(conversacionId, motivo);
}

async function manejarMensaje(msg: WhatsAppMessage) {
  const from = msg.from as string;
  const conv = await obtenerConversacion(from);

  const tipo = tipoMensaje(msg);
  const texto =
    tipo === "text" ? msg.text?.body ?? "" :
    tipo === "image" ? "📷 Comprobante" :
    tipo === "audio" ? "🎤 Nota de voz" :
    tipo === "ack" ? "👍" : `[${msg.type ?? "mensaje"}]`;

  // Candado de idempotencia: reclama el mensaje ANTES de trabajo pesado.
  // Si Meta reintenta, el segundo choca con el unique y sale sin reprocesar.
  const mensajeId = await reclamarMensajeEntrante({
    conversacionId: conv.id, waMessageId: msg.id,
    tipo: tipo === "image" ? "image" : "text", texto,
  });
  if (!mensajeId) return; // duplicado (reintento de Meta)

  // Si una persona del equipo tomó el chat, el agente NO responde.
  // Solo marcamos que hay un mensaje nuevo esperando respuesta.
  if (conv.modo === "humano") {
    await marcarNecesitaHumano(conv.id);
    return;
  }

  if (tipo === "text") {
    // Coalesce "foto + caption": si este texto suena a que anuncia un comprobante
    // ("aquí el pago", "envío comprobante"…), espera la ventana y, si en ella llegó
    // una imagen, no respondas — el lector de comprobante contesta por los dos.
    if (pareceCaptionDeAdjunto(msg.text?.body ?? "")) {
      await new Promise((r) => setTimeout(r, VENTANA_ADJUNTO_MS));
      if (await hayImagenEntranteReciente(conv.id, VENTANA_ADJUNTO_MS * 2)) return;
    }
    await responderConAgente(conv, from);
  } else if (tipo === "image") {
    await procesarComprobante(conv, from, msg, mensajeId);
  } else if (tipo === "audio") {
    await procesarAudio(conv, from, msg, mensajeId);
  } else if (tipo === "ack") {
    // Sticker / reacción: mismo trato que un "ok". No se escala ni se gasta el modelo.
    return;
  } else {
    await responderYEscalar(
      conv.id,
      from,
      "¡Gracias por escribir! En un momento te respondo por aquí 🙌",
      `Mensaje de tipo "${msg.type ?? "desconocido"}" que el agente no puede leer.`,
    );
  }
}

// Ventana de gracia para juntar una foto con su textito (caption). 3–5s.
const VENTANA_ADJUNTO_MS = 4000;

// Texto que suena a "te estoy mandando el comprobante" (el caption de una foto).
const ANUNCIA_ADJUNTO =
  /comprobante|transferenc|dep[óo]sit|adjunt|captura|pantallazo|voucher|recibo|(?:te|le)\s+(?:lo\s+)?(?:mand|env[íi]|paso|comparto)|env[íi]o|ah[íi]\s+(?:va|te|le|est)|aqu[íi]\s+(?:est|va|le|te|tien)|ya\s+pagu|hice\s+el\s+pago|acabo\s+de\s+pagar|mira/i;

/** ¿Este texto parece solo el caption de una foto que viene? (corto, sin pregunta). */
function pareceCaptionDeAdjunto(texto: string): boolean {
  const t = (texto ?? "").trim();
  if (t.length === 0 || t.length > 80) return false; // largo = conversación real
  if (/[?¿]/.test(t)) return false;                  // si pregunta algo, hay que responder
  return ANUNCIA_ADJUNTO.test(t);
}

function tipoMensaje(msg: WhatsAppMessage): "text" | "image" | "audio" | "ack" | "otro" {
  if (msg.type === "sticker" || msg.type === "reaction") return "ack";
  if (msg.type === "text" || msg.text?.body) return "text";
  if (msg.type === "image" || msg.image?.id) return "image";
  // Cloud API: notas de voz = type "audio". A veces llega voice/ptt.
  if (msg.type === "audio" || msg.type === "voice" || msg.type === "ptt" || msg.audio?.id) {
    return "audio";
  }
  return "otro";
}

// El agente conversa; si el caso lo amerita, escala a una persona del equipo.
async function responderConAgente(conv: Conv, from: string, extraTurno?: { direccion: "in" | "out"; texto: string }) {
  try {
    const historial = await historialReciente(conv.id, 10);
    if (extraTurno) {
      const last = historial[historial.length - 1];
      if (last?.direccion === "in" && /nota de voz/i.test(last.texto)) {
        last.texto = extraTurno.texto;
      } else {
        historial.push(extraTurno);
      }
    }

    const textoCliente =
      extraTurno?.texto ??
      [...historial].reverse().find((m) => m.direccion === "in")?.texto ??
      "";
    const ultimoSaliente =
      [...historial].reverse().find((m) => m.direccion === "out")?.texto ?? null;
    const dest = destinarCharla(textoCliente, ultimoSaliente);
    if (dest.destinar === "silencio") return;
    if (dest.destinar === "canned") {
      await responder(conv.id, from, dest.mensaje);
      return;
    }

    // Contexto con cifras REALES si la conversación está vinculada a un contrato.
    let contexto = conv.etiqueta ? `El cliente está vinculado al ${conv.etiqueta}.` : undefined;
    if (conv.contrato_id) {
      const resumen = await resumenContrato(conv.contrato_id);
      if (resumen) contexto = resumen;
    }
    // Lo que registró el equipo por fuera del chat (ej. un pago en oficina).
    const notas = await notasRecientes(conv.id);
    if (notas.length) {
      contexto = `${contexto ?? ""}\n\nREGISTROS INTERNOS RECIENTES (el equipo los anotó; tenlos en cuenta):\n${notas
        .map((n) => `- ${n}`)
        .join("\n")}`.trim();
    }
    const bruta = await responderAgente({ historial, contexto });

    // El prompt pide; el guard verifica. Nada sale sin pasar por aquí.
    const { respuesta: r, intervino, detalle } = revisarRespuesta(bruta, contexto);
    if (intervino) {
      console.warn(`[whatsapp/webhook] guard (${intervino}): ${detalle}`);
      await registrarMensaje({
        conversacionId: conv.id,
        direccion: "out",
        tipo: "system",
        texto: `🛡️ Respuesta bloqueada (${intervino}): ${detalle}`,
      });
    }

    if (r.pasar_a_humano) await marcarEscalada(conv.id, r.motivo ?? null);
    await responder(conv.id, from, r.mensaje);
  } catch (e) {
    console.error("[whatsapp/webhook] agente falló:", e);
    await responderYEscalar(
      conv.id,
      from,
      "¡Gracias por escribir! En un momento te respondo por aquí 🙌",
      "El agente no pudo responder (falla técnica).",
    );
  }
}

// Descarga la nota de voz, la transcribe y deja que el agente responda al texto.
async function procesarAudio(conv: Conv, from: string, msg: WhatsAppMessage, mensajeId: string) {
  const mediaId = msg.audio?.id;
  if (!mediaId) {
    await responderYEscalar(
      conv.id,
      from,
      "Recibí tu audio pero no pude abrirlo. ¿Me lo escribes o me lo reenvías?",
      "Llegó una nota de voz que no se pudo descargar.",
    );
    return;
  }
  try {
    const bytes = await downloadMedia(mediaId);
    const transcript = await transcribirAudio(bytes, msg.audio?.mime_type ?? "audio/ogg");
    await completarMensaje(mensajeId, { texto: transcript });
    await responderConAgente(conv, from, { direccion: "in", texto: transcript });
  } catch (e) {
    console.error("[whatsapp/webhook] transcribir audio falló:", e);
    await responderYEscalar(
      conv.id,
      from,
      "Te escuché, pero no pude entender bien el audio. ¿Me lo escribes en un mensajito?",
      "No se pudo transcribir una nota de voz.",
    );
  }
}

// Descarga el comprobante, lo lee con visión, lo sube a Storage, resuelve el
// contrato por # de carro, registra el pago y responde lo leído.
async function procesarComprobante(
  conv: Conv,
  from: string,
  msg: WhatsAppMessage,
  mensajeId: string,
) {
  const conversacionId = conv.id;
  const image = msg.image;
  const mediaId = image?.id;
  if (!mediaId) {
    await responderYEscalar(
      conversacionId,
      from,
      "📷 Recibí una imagen pero no pude abrirla. Reenvíala, por favor.",
      "Llegó una imagen que no se pudo descargar.",
    );
    return;
  }
  const mime = image?.mime_type ?? "image/jpeg";

  try {
    const bytes = await downloadMedia(mediaId);
    const lista = (await leerComprobantes(bytes, mime)).filter((x) => x.es_comprobante);

    // Ninguna lectura es comprobante → no creamos pago (antifraude).
    if (lista.length === 0) {
      await responder(
        conversacionId,
        from,
        "Recibí tu imagen, pero no parece un comprobante de pago 🤔 ¿Me envías la captura de la transferencia, o la foto del recibo o cheque, donde se vea el monto y la referencia? Así la cruzamos con el banco y aplicamos tu pago.",
      );
      return;
    }

    // La imagen se sube UNA sola vez, aunque traiga varios recibos.
    const path = await subirComprobante(bytes, mime);
    const items: { c: Comprobante; res: Awaited<ReturnType<typeof procesarPagoComprobante>> }[] = [];
    for (const c of lista) {
      const res = await procesarPagoComprobante({ conversacion: conv, comprobante: c, bytes, mime, path });
      items.push({ c, res });
    }

    // La miniatura del mensaje enlaza al primer pago creado.
    const primerPago = items.find((it) => it.res.pagoId)?.res.pagoId ?? null;
    await completarMensaje(mensajeId, { mediaUrl: path, pagoId: primerPago });

    // Un solo comprobante: respuesta completa de siempre.
    if (items.length === 1) {
      const { c, res } = items[0];
      const { respuesta, escalarMotivo } = armarRespuestaComprobante(c, res);
      await responder(conversacionId, from, respuesta, res.pagoId ?? undefined);
      if (escalarMotivo) await marcarPendienteDeRespuesta(conversacionId, escalarMotivo);
      return;
    }

    // Varios comprobantes en una foto: se resumen y se escala si alguno tiene pero.
    const lineas = items.map(({ c, res }) => lineaComprobante(c, res));
    const motivos = items
      .map(({ c, res }) => armarRespuestaComprobante(c, res).escalarMotivo)
      .filter((m): m is string => !!m);
    const cabeza = `¡Recibí ${items.length} comprobantes en esa foto! 🙌`;
    const cola = motivos.length
      ? "Hay uno que necesito revisar con el equipo; te confirmamos por aquí."
      : "Los estamos cruzando con el banco para validarlos. Apenas queden, te confirmo.";
    await responder(conversacionId, from, `${cabeza}\n${lineas.join("\n")}\n${cola}`, primerPago ?? undefined);
    if (motivos.length) {
      await marcarPendienteDeRespuesta(conversacionId, `Foto con varios comprobantes: ${motivos.join(" · ")}`);
    }
  } catch (e) {
    console.error("[whatsapp/webhook] error procesando comprobante:", e);
    await responderYEscalar(
      conversacionId,
      from,
      "¡Gracias por escribir! Tuve un detallito abriendo la imagen 🙈 ¿Me la reenvías, porfa?",
      "Falló el procesamiento de un comprobante: revisar si el pago quedó registrado.",
    );
  }
}

type ResPago = Awaited<ReturnType<typeof procesarPagoComprobante>>;

/** Respuesta al cliente para UN comprobante ya procesado. No confirma "al día". */
function armarRespuestaComprobante(c: Comprobante, res: ResPago): { respuesta: string; escalarMotivo: string | null } {
  const monto = c.monto != null ? `$${c.monto.toFixed(2)}` : null;
  const alerta = (codigo: string) => res.veredicto.alertas.some((a) => a.codigo === codigo);
  if (res.estadoConciliacion === "duplicado") {
    return {
      respuesta: "Ese comprobante ya lo tenemos registrado por aquí 🙌 Si hiciste otro pago distinto, mándame la captura de ese otro y lo revisamos.",
      escalarMotivo: null,
    };
  }
  if (alerta("cuenta_otra_empresa")) {
    return {
      respuesta: "¡Gracias por enviarlo! Pero ese comprobante fue a la cuenta de otra de nuestras empresas, no a la cuenta asignada a tu carro. Por eso no lo puedo aplicar así. Déjame revisarlo con el equipo y te confirmamos por aquí.",
      escalarMotivo: "Comprobante a la cuenta de otra empresa (no la del carro).",
    };
  }
  if (alerta("cuenta_ajena")) {
    return {
      respuesta: "¡Gracias por enviarlo! Pero ese comprobante no corresponde a la cuenta de banco asignada a tu carro 🤔 Revisa que la transferencia vaya a nuestra cuenta. Déjame verificarlo con el equipo y te confirmamos.",
      escalarMotivo: "Comprobante a una cuenta que no es de la empresa.",
    };
  }
  if (alerta("moneda_no_esperada")) {
    return {
      respuesta: "¡Gracias por enviarlo! El comprobante no parece estar en dólares/balboas, así que necesito revisarlo con el equipo para aplicarlo bien. Te confirmamos por aquí.",
      escalarMotivo: "Comprobante en moneda distinta a USD.",
    };
  }
  if (alerta("fecha_vieja") || alerta("fecha_futura")) {
    return {
      respuesta: "¡Gracias! Recibí tu comprobante, pero la fecha no me cuadra con un pago de hoy 🤔 Déjame revisarlo con el equipo y te confirmamos por aquí.",
      escalarMotivo: "La fecha del comprobante no cuadra (viejo o futuro).",
    };
  }
  if (!monto || c.confianza === "baja") {
    return {
      respuesta: "¡Gracias por enviarnos el comprobante! 🙌 Lo estamos cruzando con el banco para confirmar que entró bien. En cuanto quede validado te confirmamos por aquí.",
      escalarMotivo: null,
    };
  }
  if (res.resolucion.estado === "ok" && res.resolucion.contratoId) {
    const carro = res.resolucion.etiqueta ?? "tu carro";
    return {
      respuesta: `¡Gracias por enviarnos el comprobante de ${monto} del ${carro}! 🙌 Lo estamos cruzando con el banco para confirmar que entró sin problema. Apenas quede validado te confirmamos por aquí.`,
      escalarMotivo: null,
    };
  }
  if (res.resolucion.estado === "sin_carro") {
    return {
      respuesta: `¡Gracias por enviarnos el comprobante de ${monto}! 🙌 ¿Me confirmas el número de carro para aplicarlo bien? Lo estamos cruzando con el banco para validar que entró.`,
      escalarMotivo: null,
    };
  }
  return {
    respuesta: `¡Gracias por enviarnos el comprobante de ${monto}! 🙌 Lo estamos cruzando con el banco para validarlo y en un momento te confirmamos.`,
    escalarMotivo: null,
  };
}

/** Línea corta de un comprobante para el resumen cuando llegan varios en una foto. */
function lineaComprobante(c: Comprobante, res: ResPago): string {
  const monto = c.monto != null ? `$${c.monto.toFixed(2)}` : "monto ?";
  const alerta = (codigo: string) => res.veredicto.alertas.some((a) => a.codigo === codigo);
  if (res.estadoConciliacion === "duplicado") return `• ${monto} — ya estaba registrado`;
  if (alerta("cuenta_otra_empresa")) return `• ${monto} — ⚠️ fue a la cuenta de otra empresa`;
  if (alerta("cuenta_ajena")) return `• ${monto} — ⚠️ cuenta que no es la nuestra`;
  if (alerta("moneda_no_esperada")) return `• ${monto} — ⚠️ no está en dólares`;
  if (alerta("fecha_vieja") || alerta("fecha_futura")) return `• ${monto} — ⚠️ la fecha no cuadra`;
  if (res.resolucion.estado === "ok" && res.resolucion.contratoId) return `• ${monto} del ${res.resolucion.etiqueta ?? "tu carro"} ✓`;
  if (res.resolucion.estado === "sin_carro") return `• ${monto} — ¿de qué carro?`;
  return `• ${monto} — validando`;
}

// ---------------------------------------------------------------------------
// Tipos mínimos del payload de WhatsApp
// ---------------------------------------------------------------------------
type WhatsAppMessage = {
  id?: string;
  from?: string;
  type?: string | "text" | "image" | "audio" | "voice" | "ptt" | "sticker" | "reaction";
  text?: { body?: string };
  image?: { id?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string; voice?: boolean };
};

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: WhatsAppMessage[] };
    }>;
  }>;
};
