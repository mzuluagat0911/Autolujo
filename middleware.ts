import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = new Set(["/", "/privacidad", "/terminos", "/ingreso"]);

function esPublica(path: string): boolean {
  if (PUBLICAS.has(path)) return true;
  if (path.startsWith("/api/whatsapp")) return true;
  if (path.startsWith("/api/cron")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (esPublica(path)) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(list) {
        for (const c of list) req.cookies.set(c.name, c.value);
        res = NextResponse.next({ request: req });
        for (const c of list) res.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  // Sin migración / sin admin aún: no cerramos la plataforma.
  const { data: locked, error: lockErr } = await supabase.rpc("equipo_requiere_sesion");
  if (lockErr || locked !== true) return res;

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const dest = req.nextUrl.clone();
    dest.pathname = "/ingreso";
    dest.searchParams.set("next", path);
    return NextResponse.redirect(dest);
  }

  const { data: row } = await supabase.from("equipo").select("rol, activo").eq("id", data.user.id).maybeSingle();
  const eq = row as { rol?: string; activo?: boolean } | null;
  if (!eq?.activo) {
    const dest = req.nextUrl.clone();
    dest.pathname = "/ingreso";
    dest.searchParams.set("next", path);
    return NextResponse.redirect(dest);
  }

  if ((path === "/usuarios" || path.startsWith("/usuarios/")) && eq.rol !== "admin") {
    return NextResponse.redirect(new URL("/cartera", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
