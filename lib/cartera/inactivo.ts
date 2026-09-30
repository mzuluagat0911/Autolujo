// Carro improductivo: desde la fecha no se abre letra diaria.
// El saldo que ya debía, y el acuerdo si lo tiene, siguen en el cobro
// mientras el contrato siga activo. Archivar el caso lo saca del cobro.
// La fecha vive en un evento; no hace falta columna nueva.

import { createServerSupabase } from "@/lib/supabase/server";
import { esDomingo, hoyPanama, sumarDias } from "./fecha";
import { pausaDeVehiculo, quitarLetrasDeLaPausa, reponerLetras } from "./pausa-productiva";

const DETALLE_ANULADA = "inactivo-anulado";

export type Inactivacion = {
  vehiculoId: string;
  /** Primer día sin letra diaria. */
  desde: string;
};

export function inactivacionVigente(dev: Inactivacion | null | undefined, fecha: string): boolean {
  return Boolean(dev && fecha >= dev.desde);
}

/** Entre semana no corre letra nueva. El acuerdo y el saldo pendiente sí. */
export function ajustarCobroInactivo<T extends {
  diaLibre?: boolean;
  hoy: string;
}>(entrada: T, dev: Inactivacion | null | undefined): T {
  if (!inactivacionVigente(dev, entrada.hoy)) return entrada;
  return {
    ...entrada,
    diaLibre: Boolean(entrada.diaLibre) || !esDomingo(entrada.hoy),
  };
}

function partes(detalle: string): string | null {
  if (!detalle.startsWith("inactivo:")) return null;
  const fecha = detalle.slice("inactivo:".length);
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
}

/** Inactivaciones abiertas: el carro sigue en Improductivo y el último evento trae fecha. */
export async function inactivacionesAbiertas(): Promise<Map<string, Inactivacion>> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculo_eventos")
    .select("vehiculo_id, detalle, created_at")
    .or(`detalle.like.inactivo:%,detalle.eq.${DETALLE_ANULADA}`)
    .order("created_at", { ascending: false });
  const out = new Map<string, Inactivacion>();
  if (error || !data) {
    if (error) console.error("[inactivo] eventos", error.message);
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
  const improductivo = new Set(
    ((vehs ?? []) as { id: string; estado: string }[])
      .filter((v) => v.estado === "improductivo")
      .map((v) => v.id),
  );
  for (const [id, desde] of candidatos) {
    if (!improductivo.has(id)) continue;
    out.set(id, { vehiculoId: id, desde });
  }
  return out;
}

export async function inactivacionDeVehiculo(vehiculoId: string | null | undefined): Promise<Inactivacion | null> {
  if (!vehiculoId) return null;
  const map = await inactivacionesAbiertas();
  return map.get(vehiculoId) ?? null;
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

export async function aplicarInactivacion(input: {
  vehiculoId: string;
  fecha: string | null;
}): Promise<{ ok: boolean; msg: string }> {
  const desde = String(input.fecha ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return { ok: false, msg: "Indicá desde cuándo se inactiva el carro." };
  }
  const hoy = hoyPanama();
  const sb = createServerSupabase();
  const previa = await inactivacionDeVehiculo(input.vehiculoId);
  const pausa = await pausaDeVehiculo(input.vehiculoId);
  if (pausa) {
    await sb.from("vehiculo_eventos").insert({
      vehiculo_id: input.vehiculoId,
      fecha: desde,
      tipo: "otro",
      titulo: "Retorno productivo",
      detalle: "retorno-productivo",
      origen: "manual",
    });
  }

  const guardado = await sb.from("vehiculos").update({ estado: "improductivo" }).eq("id", input.vehiculoId);
  if (guardado.error) return { ok: false, msg: guardado.error.message };

  if (!previa || previa.desde !== desde) {
    const { error } = await sb.from("vehiculo_eventos").insert({
      vehiculo_id: input.vehiculoId,
      fecha: desde,
      tipo: "otro",
      titulo: "Inactivo",
      detalle: `inactivo:${desde}`,
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
      : " Desde ese día no corre letra diaria. Si queda deuda, se sigue cobrando hasta que pague o hasta que archives el caso.";
  return { ok: true, msg: `Inactivo desde el ${desde}.${extra}${cuando}` };
}
