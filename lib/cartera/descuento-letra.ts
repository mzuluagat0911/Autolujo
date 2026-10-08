// Descuento de una parte de la letra de un día (taller unas horas, medio día).
// La letra del contrato no cambia. Solo baja la cuota de esa fecha.

import { createServerSupabase } from "@/lib/supabase/server";
import { cuotaDeFecha } from "./cuota";
import { esDomingo } from "./fecha";

const TITULO = "descuento-letra";

export type DescuentoLetra = {
  id: string;
  fecha: string;
  monto: number;
  motivo: string;
};

function fechaOk(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function money(n: number): string {
  const v = Math.round(n * 100) / 100;
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

/** Descuento anotado para un carro en una fecha. 0 si no hay. */
export async function descuentoLetraDe(vehiculoId: string, fecha: string): Promise<number> {
  if (!vehiculoId || !fechaOk(fecha)) return 0;
  const map = await descuentosLetraDelDia(fecha, [vehiculoId]);
  return map.get(vehiculoId) ?? 0;
}

/** Descuentos de letra vigentes en una fecha, por vehículo. */
export async function descuentosLetraDelDia(
  fecha: string,
  vehiculoIds?: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!fechaOk(fecha)) return out;
  const ids = (vehiculoIds ?? []).filter(Boolean);
  if (vehiculoIds && ids.length === 0) return out;
  const sb = createServerSupabase();
  let q = sb
    .from("vehiculo_eventos")
    .select("vehiculo_id, valor")
    .eq("titulo", TITULO)
    .eq("fecha", fecha);
  if (ids.length > 0) q = q.in("vehiculo_id", ids);
  const { data, error } = await q;
  if (error || !data) return out;
  for (const r of data as { vehiculo_id: string; valor: number | null }[]) {
    const n = Math.max(Number(r.valor) || 0, 0);
    if (n > 0.009) out.set(r.vehiculo_id, n);
  }
  return out;
}

export async function listarDescuentosLetra(vehiculoId: string): Promise<DescuentoLetra[]> {
  if (!vehiculoId) return [];
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculo_eventos")
    .select("id, fecha, valor, detalle")
    .eq("vehiculo_id", vehiculoId)
    .eq("titulo", TITULO)
    .order("fecha", { ascending: false })
    .limit(12);
  if (error || !data) return [];
  return (data as { id: string; fecha: string; valor: number | null; detalle: string | null }[]).map((r) => ({
    id: r.id,
    fecha: String(r.fecha).slice(0, 10),
    monto: Math.max(Number(r.valor) || 0, 0),
    motivo: (r.detalle ?? "").trim(),
  }));
}

/**
 * Anota el descuento y, si ese día ya tiene letra, la baja a letra − descuento.
 * Un día sin cargo espera al devengo, que crea la letra ya descontada.
 */
export async function aplicarDescuentoLetra(input: {
  vehiculoId: string;
  contratoId: string;
  fecha: string;
  monto: number;
  motivo: string;
}): Promise<{ ok: true; msg: string; queda: number } | { ok: false; msg: string }> {
  const vehiculoId = String(input.vehiculoId ?? "").trim();
  const contratoId = String(input.contratoId ?? "").trim();
  const fecha = String(input.fecha ?? "").trim();
  const motivo = String(input.motivo ?? "").trim();
  const monto = Math.round((Number(input.monto) || 0) * 100) / 100;
  if (!vehiculoId || !contratoId) return { ok: false, msg: "Elegí un carro con contrato activo." };
  if (!fechaOk(fecha)) return { ok: false, msg: "La fecha del descuento no es válida." };
  if (esDomingo(fecha)) {
    return { ok: false, msg: "El domingo no corre letra diaria. El descuento es de lunes a sábado." };
  }
  if (!(monto > 0.009)) return { ok: false, msg: "Indicá el valor del descuento." };
  if (motivo.length < 2) return { ok: false, msg: "Indicá el motivo del descuento." };

  const sb = createServerSupabase();
  const { data: contrato, error: cErr } = await sb
    .from("contratos")
    .select("id, vehiculo_id, estado, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .eq("id", contratoId)
    .maybeSingle();
  if (cErr || !contrato) return { ok: false, msg: "No encontré el contrato de este carro." };
  const row = contrato as {
    id: string;
    vehiculo_id: string;
    estado: string;
    letra_diaria: number;
    descuento_puntual: number | null;
    cobra_domingo: boolean | null;
    cuota_domingo: number | null;
  };
  if (row.vehiculo_id !== vehiculoId) return { ok: false, msg: "Ese contrato no es de este carro." };
  if (row.estado !== "activo") return { ok: false, msg: "El contrato no está activo." };

  const letra = cuotaDeFecha(row, fecha);
  if (letra <= 0.009) return { ok: false, msg: "Ese día este contrato no tiene letra." };
  if (monto > letra + 0.009) {
    return { ok: false, msg: `El descuento no puede pasar la letra de ese día (${money(letra)}).` };
  }
  const queda = Math.max(Math.round((letra - monto) * 100) / 100, 0);

  const { data: previos, error: pErr } = await sb
    .from("vehiculo_eventos")
    .select("id")
    .eq("vehiculo_id", vehiculoId)
    .eq("titulo", TITULO)
    .eq("fecha", fecha)
    .limit(1);
  if (pErr) return { ok: false, msg: pErr.message };
  const previoId = (previos ?? [])[0] as { id: string } | undefined;
  const nota = previoId
    ? await sb
        .from("vehiculo_eventos")
        .update({ valor: monto, detalle: motivo, tipo: "otro", origen: "manual" })
        .eq("id", previoId.id)
    : await sb.from("vehiculo_eventos").insert({
        vehiculo_id: vehiculoId,
        fecha,
        tipo: "otro",
        titulo: TITULO,
        detalle: motivo,
        valor: monto,
        origen: "manual",
      });
  if (nota.error) return { ok: false, msg: nota.error.message };

  const { data: cargos, error: gErr } = await sb
    .from("cargos")
    .select("id")
    .eq("contrato_id", contratoId)
    .eq("fecha", fecha)
    .eq("tipo", "renta")
    .limit(1);
  if (gErr) return { ok: false, msg: gErr.message };
  const cargoId = ((cargos ?? [])[0] as { id: string } | undefined)?.id;
  if (cargoId) {
    const concepto = `Cuota diaria · descuento ${money(monto)} · ${motivo}`;
    const { error } = await sb.from("cargos").update({ monto: queda, concepto }).eq("id", cargoId);
    if (error) return { ok: false, msg: error.message };
  }

  const cuando = fecha.split("-").reverse().join("/");
  return {
    ok: true,
    queda,
    msg: queda > 0.009
      ? `Letra del ${cuando}: ${money(queda)}. Descuento ${money(monto)} (${motivo}).`
      : `Letra del ${cuando}: $0. Ese día no se cobra letra (${motivo}).`,
  };
}
