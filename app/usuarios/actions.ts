"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionEquipo } from "@/lib/equipo/sesion";
import type { RolEquipo } from "@/lib/equipo/tipos";

export type ResultadoUsuario = { ok: boolean; msg: string };

async function soloAdmin() {
  const s = await sesionEquipo();
  if (!s || s.rol !== "admin") throw new Error("Solo el administrador.");
  return s;
}

export async function crearUsuarioEquipo(
  _prev: ResultadoUsuario | null,
  formData: FormData,
): Promise<ResultadoUsuario> {
  await soloAdmin();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const clave = String(formData.get("clave") ?? "");
  const rol = String(formData.get("rol") ?? "cartera") === "admin" ? "admin" : "cartera";
  if (!nombre || !email || clave.length < 8) {
    return { ok: false, msg: "Nombre, correo y clave de al menos 8 caracteres." };
  }

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
    rol,
    activo: true,
  });
  if (error) return { ok: false, msg: error.message };
  revalidatePath("/usuarios");
  return { ok: true, msg: `Listo. ${nombre} ya puede entrar con ese correo.` };
}

export async function cambiarActivo(formData: FormData): Promise<void> {
  const yo = await soloAdmin();
  const id = String(formData.get("id") ?? "");
  const activo = String(formData.get("activo") ?? "") === "1";
  if (!id || id === yo.id) return;
  const sb = createServerSupabase();
  await sb.from("equipo").update({ activo }).eq("id", id);
  revalidatePath("/usuarios");
}

export async function cambiarRol(formData: FormData): Promise<void> {
  const yo = await soloAdmin();
  const id = String(formData.get("id") ?? "");
  const rol = (String(formData.get("rol") ?? "cartera") === "admin" ? "admin" : "cartera") as RolEquipo;
  if (!id || id === yo.id) return;
  const sb = createServerSupabase();
  await sb.from("equipo").update({ rol }).eq("id", id);
  revalidatePath("/usuarios");
}
