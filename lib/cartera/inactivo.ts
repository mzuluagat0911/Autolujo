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
  /** Primer día en que vuelve la letra. Vacío = sigue sin letra. */
  hasta: string | null;
};

export function inactivacionVigente(dev: Inactivacion | null | undefined, fecha: string): boolean {
  if (!dev || fecha < dev.desde) return false;
  if (dev.hasta && fecha >= dev.hasta) return false;
  return true;
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

function fechaOk(v: string | undefined): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

/** `inactivo:YYYY-MM-DD` o `inactivo:YYYY-MM-DD:YYYY-MM-DD` (el segundo día ya se cobra). */
function partes(detalle: string): { desde: string; hasta: string | null } | null {
  if (!detalle.startsWith("inactivo:")) return null;
  const [desde, hasta] = detalle.slice("inactivo:".length).split(":");
  if (!fechaOk(desde)) return null;
  if (hasta && !fechaOk(hasta)) return null;
  return { desde, hasta: hasta || null };
}

function detalleInactivo(desde: string, hasta: string | null): string {
  return hasta ? `inactivo:${desde}:${hasta}` : `inactivo:${desde}`;
}

/**
 * Ventanas de improductivo. Una ventana con fecha de cobro sigue valiendo
 * aunque el carro ya esté activo: así el devengo no vuelve a cargar esos días.
 * Sin fecha de cobro, solo cuenta si el carro sigue en Improductivo.
 */
export async function inactivacionesAbiertas(): Promise<Map<string, Inactivacion>> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
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
    const ventana = partes(detalle);
    return ventana ? [[id, ventana] as const] : [];
  });
  if (candidatos.length === 0) return out;

  const { data: vehs } = await sb
    .from("vehiculos")
    .select("id, estado")
    .in("id", candidatos.map(([id]) => id));
  const estadoDe = new Map(
    ((vehs ?? []) as { id: string; estado: string }[]).map((v) => [v.id, v.estado]),
  );
  for (const [id, ventana] of candidatos) {
    const est = estadoDe.get(id) ?? "";
    if (ventana.hasta && ventana.hasta <= hoy && est === "improductivo") {
      await sb.from("vehiculos").update({ estado: "activo" }).eq("id", id);
      await reponerLetras(id, ventana.hasta, hoy);
    }
    if (!ventana.hasta && est !== "improductivo") continue;
    out.set(id, { vehiculoId: id, desde: ventana.desde, hasta: ventana.hasta });
  }
  return out;
}

export async function inactivacionDeVehiculo(vehiculoId: string | null | undefined): Promise<Inactivacion | null> {
  if (!vehiculoId) return null;
  const map = await inactivacionesAbiertas();
  return map.get(vehiculoId) ?? null;
}

async function anotar(vehiculoId: string, desde: string, hasta: string | null): Promise<string | null> {
  const sb = createServerSupabase();
  const { error } = await sb.from("vehiculo_eventos").insert({
    vehiculo_id: vehiculoId,
    fecha: desde,
    tipo: "otro",
    titulo: hasta ? "Improductivo con regreso" : "Inactivo",
    detalle: detalleInactivo(desde, hasta),
    origen: "manual",
  });
  return error ? error.message : null;
}

/** Al volver a Activo: la letra corre desde hoy y los días improductivos no se rellenan. */
export async function cerrarInactivacion(vehiculoId: string, hoy = hoyPanama()): Promise<void> {
  const previa = await inactivacionDeVehiculo(vehiculoId);
  if (!previa || previa.hasta) return;
  const fin = sumarDias(hoy, -1);
  if (previa.desde <= fin) await quitarLetrasDeLaPausa(vehiculoId, previa.desde, fin);
  await reponerLetras(vehiculoId, hoy, hoy);
  await anotar(vehiculoId, previa.desde, hoy);
}

export async function aplicarInactivacion(input: {
  vehiculoId: string;
  /** Primer día sin letra. */
  fecha: string | null;
  /** Primer día en que vuelve la letra. Vacío = sigue sin letra. */
  cobrarDesde?: string | null;
}): Promise<{ ok: boolean; msg: string }> {
  const desde = String(input.fecha ?? "").trim();
  const cobrar = String(input.cobrarDesde ?? "").trim();
  if (!fechaOk(desde)) {
    return { ok: false, msg: "Indicá desde cuándo no se cobra la letra." };
  }
  if (cobrar && !fechaOk(cobrar)) {
    return { ok: false, msg: "La fecha desde la que se cobra no es válida." };
  }
  if (cobrar && cobrar <= desde) {
    return { ok: false, msg: "La fecha de cobro tiene que ser después del día en que deja de cobrar." };
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

  const yaCobra = Boolean(cobrar && cobrar <= hoy);
  const guardado = await sb
    .from("vehiculos")
    .update({ estado: yaCobra ? "activo" : "improductivo" })
    .eq("id", input.vehiculoId);
  if (guardado.error) return { ok: false, msg: guardado.error.message };

  const igual =
    previa &&
    previa.desde === desde &&
    (previa.hasta ?? "") === (cobrar || "");
  if (!igual) {
    const nota = await anotar(input.vehiculoId, desde, cobrar || null);
    if (nota) return { ok: false, msg: nota };
  }

  if (previa && previa.desde < desde) {
    const fin = sumarDias(desde, -1);
    const tope = fin < hoy ? fin : hoy;
    if (previa.desde <= tope) await reponerLetras(input.vehiculoId, previa.desde, tope);
  }

  const finSinLetra = cobrar ? sumarDias(cobrar, -1) : hoy;
  const hastaQuitar = finSinLetra < hoy ? finSinLetra : hoy;
  const quitadas =
    desde <= hastaQuitar ? await quitarLetrasDeLaPausa(input.vehiculoId, desde, hastaQuitar) : 0;
  if (yaCobra) await reponerLetras(input.vehiculoId, cobrar, hoy);

  const extra =
    quitadas > 0
      ? ` Se quitaron ${quitadas} ${quitadas === 1 ? "letra" : "letras"} de esos días.`
      : "";
  if (cobrar && yaCobra) {
    return {
      ok: true,
      msg: `Sin letra del ${desde} al ${sumarDias(cobrar, -1)}. Desde el ${cobrar} volvió a productivo y corre la letra.${extra}`,
    };
  }
  if (cobrar) {
    return {
      ok: true,
      msg: `Sin letra desde el ${desde}. El ${cobrar} vuelve la letra. Hasta ese día se sigue cobrando la deuda que ya tenía.${extra}`,
    };
  }
  const cuando =
    desde > hoy
      ? ` Queda para el ${desde}. Hasta el día anterior se cobra la letra normal.`
      : " Desde ese día no corre letra diaria. Si queda deuda, se sigue cobrando hasta que pague o hasta que archives el caso.";
  return { ok: true, msg: `Sin letra desde el ${desde}.${extra}${cuando}` };
}
