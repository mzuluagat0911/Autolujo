import { createAuthSupabase } from "@/lib/supabase/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import type { RolEquipo, SesionEquipo } from "./tipos";

function fila(r: { id: string; email: string; nombre: string; rol: string; activo: boolean }): SesionEquipo | null {
  if (!r.activo) return null;
  const rol: RolEquipo = r.rol === "admin" ? "admin" : "cartera";
  return { id: r.id, email: r.email, nombre: r.nombre, rol };
}

export async function sesionEquipo(): Promise<SesionEquipo | null> {
  try {
    const auth = await createAuthSupabase();
    const { data } = await auth.auth.getUser();
    if (!data.user) return null;
    const sb = createServerSupabase();
    const { data: row } = await sb
      .from("equipo")
      .select("id, email, nombre, rol, activo")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!row) return null;
    return fila(row as { id: string; email: string; nombre: string; rol: string; activo: boolean });
  } catch {
    return null;
  }
}

export async function hayEquipo(): Promise<boolean> {
  try {
    const sb = createServerSupabase();
    const { count, error } = await sb.from("equipo").select("id", { count: "exact", head: true });
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}
