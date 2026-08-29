"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendText } from "@/lib/whatsapp/client";
import {
  tomarChat,
  devolverAlAgente,
  registrarMensaje,
  ventanaAbierta,
} from "@/lib/cartera/pipeline";

export async function accionTomarChat(formData: FormData): Promise<void> {
  const id = String(formData.get("conversacion_id") ?? "");
  if (!id) throw new Error("Falta la conversación.");
  await tomarChat(id);
  revalidatePath(`/cartera/conversaciones/${id}`);
  revalidatePath("/cartera/conversaciones");
}

export async function accionDevolverAgente(formData: FormData): Promise<void> {
  const id = String(formData.get("conversacion_id") ?? "");
  if (!id) throw new Error("Falta la conversación.");
  await devolverAlAgente(id);
  revalidatePath(`/cartera/conversaciones/${id}`);
  revalidatePath("/cartera/conversaciones");
}

/** Envía una respuesta escrita por una persona del equipo (mismo hilo de WhatsApp). */
export async function enviarRespuestaHumana(formData: FormData): Promise<void> {
  const id = String(formData.get("conversacion_id") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();
  if (!id) throw new Error("Falta la conversación.");
  if (!texto) return;

  const sb = createServerSupabase();
  const { data: conv, error } = await sb
    .from("conversaciones")
    .select("wa_numero, ultimo_entrante_at, modo")
    .eq("id", id)
    .single();
  if (error || !conv) throw new Error("No se encontró la conversación.");

  if (!ventanaAbierta(conv.ultimo_entrante_at as string | null)) {
    throw new Error(
      "La ventana de 24h está cerrada: el cliente no ha escrito en las últimas 24h. " +
        "Para reactivar debe escribir él primero (o se usa una plantilla).",
    );
  }

  await sendText(conv.wa_numero as string, texto);
  await registrarMensaje({ conversacionId: id, direccion: "out", texto, enviadoPor: "Equipo" });

  // Ya se respondió: baja la bandera de "necesita respuesta".
  await sb.from("conversaciones").update({ necesita_humano: false }).eq("id", id);

  revalidatePath(`/cartera/conversaciones/${id}`);
  revalidatePath("/cartera/conversaciones");
}
