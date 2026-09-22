// Alcance operativo de cartera: qué empresas ve el panel y reciben envíos.
// Fuente de verdad: tabla `cartera_alcance` (admin).
// Vacía = todas. GPS / rastreo no usa esto.
// Fallback: CARTERA_EMPRESAS en env solo si la tabla aún no existe.

import { createServerSupabase } from "@/lib/supabase/server";

export type AlcanceInfo = {
  /** null = todas las empresas */
  codigos: string[] | null;
  empresaIds: string[] | null;
};

function parseEnvFallback(): string[] | null {
  const raw = (process.env.CARTERA_EMPRESAS ?? "").trim();
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length ? list : null;
}

export async function leerAlcance(): Promise<AlcanceInfo> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("cartera_alcance")
      .select("empresa_id, empresa:empresas(codigo)");
    if (error) {
      if (/cartera_alcance|does not exist|schema cache/i.test(error.message)) {
        const env = parseEnvFallback();
        return { codigos: env, empresaIds: null };
      }
      throw error;
    }
    const rows = (data ?? []) as unknown as {
      empresa_id: string;
      empresa: { codigo: string } | null;
    }[];
    if (rows.length === 0) {
      return { codigos: null, empresaIds: null };
    }
    const codigos = rows
      .map((r) => r.empresa?.codigo?.toUpperCase())
      .filter((c): c is string => Boolean(c));
    return {
      codigos: codigos.length ? codigos : null,
      empresaIds: rows.map((r) => r.empresa_id),
    };
  } catch {
    return { codigos: parseEnvFallback(), empresaIds: null };
  }
}

/** Códigos permitidos, o null = todas. */
export async function empresasAlcanceCodigos(): Promise<string[] | null> {
  return (await leerAlcance()).codigos;
}

export function enAlcanceCodigo(
  codigo: string | null | undefined,
  allow: string[] | null,
): boolean {
  if (!allow) return true;
  if (!codigo) return false;
  return allow.includes(codigo.toUpperCase());
}

export async function filtrarPorAlcance<T extends { empresa: string | null }>(
  items: T[],
): Promise<T[]> {
  const allow = await empresasAlcanceCodigos();
  if (!allow) return items;
  return items.filter((e) => enAlcanceCodigo(e.empresa, allow));
}

/** Texto corto para banners: "GOLD" | "GOLD · KOWUA" | null si todas. */
export function etiquetaAlcance(codigos: string[] | null): string | null {
  if (!codigos || codigos.length === 0) return null;
  return codigos.join(" · ");
}

/**
 * Reemplaza el alcance. Lista vacía = todas (borra filas).
 * IDs deben existir en `empresas`.
 */
export async function guardarAlcance(opts: {
  empresaIds: string[];
  updatedBy?: string | null;
}): Promise<{ ok: boolean; msg: string }> {
  try {
    const sb = createServerSupabase();
    const { data: actual, error: listErr } = await sb
      .from("cartera_alcance")
      .select("empresa_id");
    if (listErr) {
      if (/cartera_alcance|does not exist|schema cache/i.test(listErr.message)) {
        return {
          ok: false,
          msg: "Falta la migración 0028_cartera_alcance en Supabase.",
        };
      }
      return { ok: false, msg: listErr.message };
    }
    const prev = ((actual ?? []) as { empresa_id: string }[]).map((r) => r.empresa_id);
    if (prev.length) {
      const { error: delErr } = await sb
        .from("cartera_alcance")
        .delete()
        .in("empresa_id", prev);
      if (delErr) return { ok: false, msg: delErr.message };
    }

    const uniq = [...new Set(opts.empresaIds.filter(Boolean))];
    if (uniq.length === 0) {
      return { ok: true, msg: "Alcance: todas las empresas." };
    }

    const rows = uniq.map((empresa_id) => ({
      empresa_id,
      updated_by: opts.updatedBy ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error: insErr } = await sb.from("cartera_alcance").insert(rows);
    if (insErr) return { ok: false, msg: insErr.message };
    return {
      ok: true,
      msg: `Alcance guardado · ${uniq.length} empresa${uniq.length === 1 ? "" : "s"}.`,
    };
  } catch (e) {
    return {
      ok: false,
      msg: e instanceof Error ? e.message : "No pude guardar el alcance.",
    };
  }
}
