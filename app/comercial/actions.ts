"use server";

import { revalidatePath } from "next/cache";
import { sendText } from "@/lib/whatsapp/client";
import { ventanaAbierta } from "@/lib/cartera/pipeline";
import {
  hiloComercial,
  listarChatsComercial,
  marcarChatComercialLeido,
  registrarSalidaComercial,
  type ChatComercial,
  type MensajeComercial,
} from "@/lib/comercial/chats";

function refrescar() {
  revalidatePath("/comercial");
  revalidatePath("/comercial/citas");
}

export async function marcarCitaConfirmadaPorLlamada(id: string): Promise<{ ok: boolean; error?: string }> {
  const { confirmarCitaPorLlamada } = await import("@/lib/comercial/citas");
  const r = await confirmarCitaPorLlamada(id);
  if (r.ok) refrescar();
  return r;
}

export async function cargarBandejaComercial(): Promise<{ chats: ChatComercial[]; error: string | null }> {
  return listarChatsComercial();
}

export async function cargarHiloComercial(
  id: string,
): Promise<{ chat: ChatComercial | null; mensajes: MensajeComercial[] }> {
  if (!id) return { chat: null, mensajes: [] };
  await marcarChatComercialLeido(id);
  refrescar();
  return hiloComercial(id);
}

/** Respuesta de una persona, siempre desde el número de ventas. */
export async function enviarRespuestaComercial(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("conversacion_id") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();
  const phoneId = process.env.WHATSAPP_COMERCIAL_PHONE_NUMBER_ID;
  if (!id) return { ok: false, error: "Falta el chat." };
  if (!texto) return { ok: false, error: "Escribe un mensaje." };
  if (!phoneId) return { ok: false, error: "Falta el número comercial en el entorno." };

  try {
    const { chat } = await hiloComercial(id);
    if (!chat) return { ok: false, error: "No encontré ese chat de ventas." };
    if (!ventanaAbierta(chat.ultimoEntranteAt)) {
      return {
        ok: false,
        error: "La ventana de 24 horas está cerrada. La persona tiene que escribir primero.",
      };
    }
    await sendText(chat.waNumero, texto, phoneId);
    await registrarSalidaComercial(id, texto);
    refrescar();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." };
  }
}
