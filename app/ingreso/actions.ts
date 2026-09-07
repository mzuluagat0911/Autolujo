"use server";

import { redirect } from "next/navigation";
import { createAuthSupabase } from "@/lib/supabase/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { hayEquipo } from "@/lib/equipo/sesion";

export type ResultadoIngreso = { ok: boolean; msg: string };

export async function entrar(
  _prev: ResultadoIngreso | null,
  formData: FormData,
): Promise<ResultadoIngreso> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const clave = String(formData.get("clave") ?? "");
  const next = String(formData.get("next") ?? "/cartera");
  if (!email || !clave) return { ok: false, msg: "Escriba correo y clave." };

  const auth = await createAuthSupabase();
  const { error } = await auth.auth.signInWithPassword({ email, password: clave });
  if (error) return { ok: false, msg: "Correo o clave no calzan." };

  const { data } = await auth.auth.getUser();
  if (!data.user) return { ok: false, msg: "No se pudo abrir la sesión." };

  const sb = createServerSupabase();
  const { data: row } = await sb
    .from("equipo")
    .select("activo")
    .eq("id", data.user.id)
    .maybeSingle();
  const activo = (row as { activo?: boolean } | null)?.activo;
  if (!activo) {
    await auth.auth.signOut();
    return { ok: false, msg: "Esa cuenta no está activa. Pida acceso al administrador." };
  }

  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/cartera";
  redirect(dest);
}

export async function crearPrimerAdmin(
  _prev: ResultadoIngreso | null,
  formData: FormData,
): Promise<ResultadoIngreso> {
  if (await hayEquipo()) return { ok: false, msg: "Ya hay equipo. Entre con su correo." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const clave = String(formData.get("clave") ?? "");
  if (!nombre || !email || clave.length < 8) {
    return { ok: false, msg: "Nombre, correo y una clave de al menos 8 caracteres." };
  }

  const sb = createServerSupabase();
  const creado = await sb.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
  });
  if (creado.error || !creado.data.user) {
    return { ok: false, msg: creado.error?.message ?? "No pude crear el usuario." };
  }

  const { error } = await sb.from("equipo").insert({
    id: creado.data.user.id,
    email,
    nombre,
    rol: "admin",
    activo: true,
  });
  if (error) return { ok: false, msg: error.message };

  const auth = await createAuthSupabase();
  const { error: e2 } = await auth.auth.signInWithPassword({ email, password: clave });
  if (e2) return { ok: false, msg: "Se creó, pero no pude entrar. Intente de nuevo." };
  redirect("/cartera");
}

export async function salir(): Promise<void> {
  const auth = await createAuthSupabase();
  await auth.auth.signOut();
  redirect("/ingreso");
}
