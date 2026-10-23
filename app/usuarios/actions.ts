"use server";

import { revalidatePath } from "next/cache";
import { MODULOS, serializarRol, type ModuloId } from "@/lib/equipo/modulos";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { createServerSupabase } from "@/lib/supabase/server";

export type ResultadoUsuario = { ok: boolean; msg: string };

const IDS = new Set<string>(MODULOS.map((m) => m.id));

async function soloEquipo() {
  const s = await sesionEquipo();
  if (!s?.modulos.includes("equipo")) throw new Error("Solo quien administra el equipo.");
  return s;
}

function modulosDe(formData: FormData): ModuloId[] {
  return formData
    .getAll("modulo")
    .map((v) => String(v))
    .filter((id): id is ModuloId => IDS.has(id));
}

export async function crearUsuarioEquipo(
  _prev: ResultadoUsuario | null,
  formData: FormData,
): Promise<ResultadoUsuario> {
  await soloEquipo();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const clave = String(formData.get("clave") ?? "");
  const modulos = modulosDe(formData);
  if (!nombre || !email || clave.length < 8) {
    return { ok: false, msg: "Nombre, correo y clave de al menos 8 caracteres." };
  }
  if (modulos.length === 0) return { ok: false, msg: "Marcá al menos un módulo." };

  const sb = createServerSupabase();
  const creado = await sb.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
  });
  if (creado.error || !creado.data.user) {
    return { ok: false, msg: creado.error?.message ?? "No pude crear el acceso." };
  }
  const { error } = await sb.from("equipo").insert({
    id: creado.data.user.id,
    email,
    nombre,
    rol: serializarRol(modulos),
    activo: true,
  });
  if (error) return { ok: false, msg: error.message };
  revalidatePath("/usuarios");
  return { ok: true, msg: `Listo. ${nombre} ya puede entrar con ese correo.` };
}

export async function cambiarActivo(formData: FormData): Promise<void> {
  const yo = await soloEquipo();
  const id = String(formData.get("id") ?? "");
  const activo = String(formData.get("activo") ?? "") === "1";
  if (!id || id === yo.id) return;
  const sb = createServerSupabase();
  await sb.from("equipo").update({ activo }).eq("id", id);
  revalidatePath("/usuarios");
}

export async function guardarModulos(formData: FormData): Promise<ResultadoUsuario> {
  const yo = await soloEquipo();
  const id = String(formData.get("id") ?? "");
  const modulos = modulosDe(formData);
  if (!id || id === yo.id) return { ok: false, msg: "Tu acceso no se cambia desde aquí." };
  if (modulos.length === 0) return { ok: false, msg: "Marcá al menos un módulo." };
  const sb = createServerSupabase();
  const { error } = await sb.from("equipo").update({ rol: serializarRol(modulos) }).eq("id", id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath("/usuarios");
  return { ok: true, msg: "Permisos guardados." };
}
