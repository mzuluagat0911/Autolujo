"use server";

import { sesionEquipo } from "@/lib/equipo/sesion";
import {
  hiloMantenimiento,
  listarChatsMantenimiento,
  responderMantenimiento,
} from "@/lib/operaciones/chats";

export async function cargarBandejaMantenimiento() {
  return listarChatsMantenimiento();
}

export async function cargarHiloMantenimiento(conversacionId: string) {
  return hiloMantenimiento(conversacionId);
}

export async function enviarRespuestaMantenimiento(formData: FormData) {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false as const, error: "Tenés que iniciar sesión." };
  if (!sesion.modulos.includes("operaciones") && !sesion.modulos.includes("cartera")) {
    return { ok: false as const, error: "No tenés permiso de operaciones." };
  }
  return responderMantenimiento({
    conversacionId: String(formData.get("conversacion_id") ?? ""),
    texto: String(formData.get("texto") ?? ""),
    autorId: sesion.id,
  });
}
