"use server";

import { sesionEquipo } from "@/lib/equipo/sesion";
import { responderAsistente, type TurnoAsistente } from "@/lib/asistente/responder";

export async function preguntarAsistente(
  historial: TurnoAsistente[],
): Promise<{ ok: true; texto: string } | { ok: false; error: string }> {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "La sesión venció." };
  const limpio = (Array.isArray(historial) ? historial : [])
    .filter((m) => m && (m.rol === "user" || m.rol === "assistant") && typeof m.texto === "string")
    .map((m) => ({ rol: m.rol, texto: m.texto.trim() }))
    .filter((m) => m.texto.length > 0)
    .slice(-12);
  const ultimo = limpio.at(-1);
  if (!ultimo || ultimo.rol !== "user") return { ok: false, error: "Escribe una pregunta." };

  try {
    const { texto } = await responderAsistente({ modulos: sesion.modulos, historial: limpio });
    return { ok: true, texto };
  } catch (e) {
    console.error("[asistente]", e instanceof Error ? e.message : "falló");
    return { ok: false, error: "No pude consultar en este momento. Inténtalo de nuevo." };
  }
}
