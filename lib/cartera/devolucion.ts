// Carro devuelto: desde la fecha de devolución no se abre letra diaria.
// El saldo que ya debía, y el acuerdo si lo tiene, siguen en el cobro.
// La fecha vive en un evento; no hace falta columna nueva.

import { createServerSupabase } from "@/lib/supabase/server";
import { esDomingo, hoyPanama, sumarDias } from "./fecha";
import { pausaDeVehiculo, quitarLetrasDeLaPausa, reponerLetras } from "./pausa-productiva";

const DETALLE_ANULADA = "devolucion-anulada";

export type Devolucion = {
  vehiculoId: string;
  /** Primer día sin letra diaria. */
  desde: string;
};

export function devolucionVigente(dev: Devolucion | null | undefined, fecha: string): boolean {
  return Boolean(dev && fecha >= dev.desde);
}

/**
 * Entre semana, la letra de hoy no corre. El domingo no se marca día libre:
 * eso achicaría la tajada del balde. El acuerdo del día no se toca.
 */
export function ajustarCobroDevolucion<T extends {
  diaLibre?: boolean;
  hoy: string;
}>(entrada: T, dev: Devolucion | null | undefined): T {
  if (!devolucionVigente(dev, entrada.hoy)) return entrada;
  return {
    ...entrada,
    diaLibre: Boolean(entrada.diaLibre) || !esDomingo(entrada.hoy),
  };
}

function partes(detalle: string): string | null {
  if (!detalle.startsWith("devolucion:")) return null;
  const fecha = detalle.slice("devolucion:".length);
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
}

/** Devoluciones abiertas: el carro sigue en Entregado y el último evento trae fecha. */
export async function devolucionesAbiertas(): Promise<Map<string, Devolucion>> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculo_eventos")
    .select("vehiculo_id, detalle, created_at")
    .or(`detalle.like.devolucion:%,detalle.eq.${DETALLE_ANULADA}`)
    .order("created_at", { ascending: false });
  const out = new Map<string, Devolucion>();
  if (error || !data) {
    if (error) console.error("[devolucion] eventos", error.message);
    return out;
  }

  const ultimo = new Map<string, string>();
  for (const row of data as { vehiculo_id: string; detalle: string }[]) {
    if (!row.vehiculo_id || ultimo.has(row.vehiculo_id)) continue;
    ultimo.set(row.vehiculo_id, row.detalle);
  }
  const candidatos = [...ultimo.entries()].flatMap(([id, detalle]) => {
    const desde = partes(detalle);
    return desde ? [[id, desde] as const] : [];
  });
  if (candidatos.length === 0) return out;

  const { data: vehs } = await sb
    .from("vehiculos")
    .select("id, estado")
    .in("id", candidatos.map(([id]) => id));
  const entregado = new Set(
    ((vehs ?? []) as { id: string; estado: string }[])
      .filter((v) => v.estado === "entregado")
      .map((v) => v.id),
  );
  for (const [id, desde] of candidatos) {
    if (!entregado.has(id)) continue;
    out.set(id, { vehiculoId: id, desde });
  }
  return out;
}

export async function devolucionDeVehiculo(vehiculoId: string | null | undefined): Promise<Devolucion | null> {
  if (!vehiculoId) return null;
  const map = await devolucionesAbiertas();
  return map.get(vehiculoId) ?? null;
}

async function soltarPausa(vehiculoId: string, fecha: string): Promise<void> {
  const previa = await pausaDeVehiculo(vehiculoId);
  if (!previa) return;
  const sb = createServerSupabase();
  await sb.from("vehiculo_eventos").insert({
    vehiculo_id: vehiculoId,
    fecha,
    tipo: "otro",
    titulo: "Retorno productivo",
    detalle: "retorno-productivo",
    origen: "manual",
  });
}

async function ajustarLetras(vehiculoId: string, anterior: string | null, desde: string, hoy: string): Promise<number> {
  if (anterior && anterior < desde) {
    const fin = sumarDias(desde, -1);
    const hasta = fin < hoy ? fin : hoy;
    if (anterior <= hasta) await reponerLetras(vehiculoId, anterior, hasta);
  }
  if (desde > hoy) return 0;
  return quitarLetrasDeLaPausa(vehiculoId, desde, hoy);
}

export async function aplicarDevolucion(input: {
  vehiculoId: string;
  fecha: string | null;
}): Promise<{ ok: boolean; msg: string }> {
  const desde = String(input.fecha ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return { ok: false, msg: "Indicá la fecha de devolución." };
  }
  const hoy = hoyPanama();
  const sb = createServerSupabase();
  const previa = await devolucionDeVehiculo(input.vehiculoId);
  await soltarPausa(input.vehiculoId, desde);

  const guardado = await sb.from("vehiculos").update({ estado: "entregado" }).eq("id", input.vehiculoId);
  if (guardado.error) return { ok: false, msg: guardado.error.message };

  if (!previa || previa.desde !== desde) {
    const { error } = await sb.from("vehiculo_eventos").insert({
      vehiculo_id: input.vehiculoId,
      fecha: desde,
      tipo: "devolucion",
      titulo: "Devolución",
      detalle: `devolucion:${desde}`,
      origen: "manual",
    });
    if (error) return { ok: false, msg: error.message };
  }

  const quitadas = await ajustarLetras(input.vehiculoId, previa?.desde ?? null, desde, hoy);
  const extra =
    quitadas > 0
      ? ` Se quitaron ${quitadas} ${quitadas === 1 ? "letra" : "letras"} desde esa fecha.`
      : "";
  const cuando =
    desde > hoy
      ? ` Queda para el ${desde}. Hasta el día anterior se cobra la letra normal.`
      : " Desde ese día no corre letra diaria. El saldo que ya debía sigue en el cobro.";
  return { ok: true, msg: `Devolución el ${desde}.${extra}${cuando}` };
}
