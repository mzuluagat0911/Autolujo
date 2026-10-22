// Al archivar un caso, la última letra es el último día que entra a la deuda.
// Después de esa fecha no se abre cuota. El saldo que queda lo cobra el agente.

import { createServerSupabase } from "@/lib/supabase/server";
import { cuotaDeFecha } from "./cuota";
import { esDomingo, hoyPanama } from "./fecha";

const PREFIJO = "caso-archivado:";

export function detalleCasoArchivado(fecha: string, contratoId: string, motivo = ""): string {
  const base = `${PREFIJO}${fecha}:${contratoId}`;
  const nota = motivo.replace(/\s+/g, " ").trim();
  return nota ? `${base}\n${nota}` : base;
}

/** La nota va en la línea de abajo para no partir el id del contrato. */
export function leerCasoArchivado(detalle: string): { fecha: string; contratoId: string; motivo: string } | null {
  if (!detalle.startsWith(PREFIJO)) return null;
  const resto = detalle.slice(PREFIJO.length);
  const corte = resto.indexOf("\n");
  const cabeza = (corte >= 0 ? resto.slice(0, corte) : resto).trim();
  const motivo = corte >= 0 ? resto.slice(corte + 1).trim() : "";
  const sep = cabeza.indexOf(":");
  if (sep < 0) return null;
  const fecha = cabeza.slice(0, sep);
  const contratoId = cabeza.slice(sep + 1).trim();
  if (!fechaValida(fecha) || !contratoId) return null;
  return { fecha, contratoId, motivo };
}

function fechaValida(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha);
}

/** Quita letras posteriores y asegura la del último día, si ya llegó. */
export async function dejarUltimaLetra(contratoId: string, ultima: string): Promise<string | null> {
  if (!fechaValida(ultima)) return "La fecha de la última letra no es válida.";
  const sb = createServerSupabase();
  const { data: posteriores, error: selErr } = await sb
    .from("cargos")
    .select("id")
    .eq("contrato_id", contratoId)
    .eq("tipo", "renta")
    .gt("fecha", ultima);
  if (selErr) return selErr.message;
  const ids = ((posteriores ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length > 0) {
    const { error } = await sb.from("cargos").delete().in("id", ids);
    if (error) return error.message;
  }

  if (esDomingo(ultima) || ultima > hoyPanama()) return null;

  const { data: ya } = await sb
    .from("cargos")
    .select("id")
    .eq("contrato_id", contratoId)
    .eq("tipo", "renta")
    .eq("fecha", ultima)
    .limit(1);
  if ((ya ?? []).length > 0) return null;

  const { data: contrato, error: cErr } = await sb
    .from("contratos")
    .select("letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .eq("id", contratoId)
    .maybeSingle();
  if (cErr) return cErr.message;
  const row = contrato as {
    letra_diaria: number;
    descuento_puntual: number | null;
    cobra_domingo: boolean | null;
    cuota_domingo: number | null;
  } | null;
  if (!row) return "No encontré el contrato para cargar la última letra.";
  const monto = cuotaDeFecha(row, ultima);
  if (monto <= 0) return null;
  const { error: insErr } = await sb.from("cargos").insert({
    contrato_id: contratoId,
    fecha: ultima,
    tipo: "renta",
    concepto: "Cuota diaria",
    monto,
  });
  return insErr?.message ?? null;
}

/** Letras que todavía toca abrir: el caso ya está archivado y la fecha es la última, o anterior. */
export async function filasUltimaLetra(
  fecha: string,
  yaTiene: Set<string>,
): Promise<Record<string, unknown>[]> {
  if (esDomingo(fecha)) return [];
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculo_eventos")
    .select("detalle, created_at")
    .like("detalle", `${PREFIJO}%`)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  const vistos = new Set<string>();
  const pendientes: { contratoId: string }[] = [];
  for (const row of data as { detalle: string }[]) {
    const caso = leerCasoArchivado(row.detalle);
    if (!caso || vistos.has(caso.contratoId)) continue;
    vistos.add(caso.contratoId);
    if (fecha > caso.fecha || yaTiene.has(caso.contratoId)) continue;
    pendientes.push({ contratoId: caso.contratoId });
  }
  if (pendientes.length === 0) return [];

  const ids = pendientes.map((p) => p.contratoId);
  const { data: contratos } = await sb
    .from("contratos")
    .select("id, estado, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .in("id", ids)
    .eq("estado", "suspendido");
  const filas: Record<string, unknown>[] = [];
  for (const c of (contratos ?? []) as {
    id: string;
    letra_diaria: number;
    descuento_puntual: number | null;
    cobra_domingo: boolean | null;
    cuota_domingo: number | null;
  }[]) {
    const monto = cuotaDeFecha(c, fecha);
    if (monto <= 0) continue;
    filas.push({
      contrato_id: c.id,
      fecha,
      tipo: "renta",
      concepto: "Cuota diaria",
      monto,
    });
  }
  return filas;
}
