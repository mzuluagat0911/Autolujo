// Metas mensuales de cobranza (asignadas por el admin).

import { createServerSupabase } from "@/lib/supabase/server";
import { inicioMes } from "./fecha";

export type MetaCobranza = {
  mes: string; // YYYY-MM-DD (día 1)
  meta100: number;
  nota: string | null;
  updatedAt: string | null;
};

export function mesClave(fechaOMes: string): string {
  // "2026-09" o "2026-09-15" → "2026-09-01"
  if (/^\d{4}-\d{2}$/.test(fechaOMes)) return `${fechaOMes}-01`;
  return inicioMes(fechaOMes);
}

export async function metaCobranzaDeMes(fechaOMes: string): Promise<MetaCobranza | null> {
  const mes = mesClave(fechaOMes);
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("metas_cobranza")
      .select("mes, meta_100, nota, updated_at")
      .eq("mes", mes)
      .maybeSingle();
    if (error) {
      // Tabla aún no migrada → sin meta asignada.
      if (/metas_cobranza|does not exist|schema cache/i.test(error.message)) return null;
      throw error;
    }
    if (!data) return null;
    const row = data as {
      mes: string;
      meta_100: number;
      nota: string | null;
      updated_at: string | null;
    };
    return {
      mes: row.mes,
      meta100: Number(row.meta_100),
      nota: row.nota,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export async function listarMetasCobranza(limite = 18): Promise<MetaCobranza[]> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("metas_cobranza")
      .select("mes, meta_100, nota, updated_at")
      .order("mes", { ascending: false })
      .limit(limite);
    if (error) return [];
    return ((data ?? []) as {
      mes: string;
      meta_100: number;
      nota: string | null;
      updated_at: string | null;
    }[]).map((r) => ({
      mes: r.mes,
      meta100: Number(r.meta_100),
      nota: r.nota,
      updatedAt: r.updated_at,
    }));
  } catch {
    return [];
  }
}

export async function upsertMetaCobranza(opts: {
  mes: string;
  meta100: number;
  nota?: string | null;
  creadoPor?: string | null;
}): Promise<{ ok: boolean; msg: string }> {
  const mes = mesClave(opts.mes);
  const meta100 = Math.round(Number(opts.meta100) * 100) / 100;
  if (!(meta100 > 0)) return { ok: false, msg: "La meta debe ser mayor que cero." };

  const sb = createServerSupabase();
  const { error } = await sb.from("metas_cobranza").upsert(
    {
      mes,
      meta_100: meta100,
      nota: opts.nota?.trim() || null,
      creado_por: opts.creadoPor ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "mes" },
  );
  if (error) {
    if (/metas_cobranza|does not exist|schema cache/i.test(error.message)) {
      return {
        ok: false,
        msg: "Falta la migración 0022 en Supabase (tabla metas_cobranza).",
      };
    }
    return { ok: false, msg: error.message };
  }
  return { ok: true, msg: "Meta guardada." };
}
