import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createAuthSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  const jar = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(list) {
        try {
          for (const c of list) jar.set(c.name, c.value, c.options);
        } catch {
          /* set desde Server Component: el middleware ya refresca */
        }
      },
    },
  });
}
