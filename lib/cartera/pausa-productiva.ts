// Carro en chapistería, mantenimiento o colisión: desde la fecha de ingreso
// no corre letra diaria ni acuerdo diario. El saldo que ya debía sí se cobra.
// Al volver a productivo (cualquier otro estado) la letra del día vuelve.

import { createServerSupabase } from "@/lib/supabase/server";
import { esDomingo, hoyPanama, sumarDias } from "./fecha";
import { cuotaDeFecha, type TerminosCuota } from "./cuota";

export const ESTADOS_PAUSA = ["mantenimiento", "chapisteria", "colision"] as const;
export type EstadoPausa = (typeof ESTADOS_PAUSA)[number];

const DETALLE_RETORNO = "retorno-productivo";

export type PausaAbierta = {
  vehiculoId: string;
  estado: EstadoPausa;
  /** Primer día improductivo. */
  desde: string;
  /** Día en que vuelve a productivo. Ese día ya corre letra y acuerdo. Vacío = sigue en pausa. */
  hasta: string | null;
};

export function esEstadoPausa(estado: string | null | undefined): estado is EstadoPausa {
  return estado === "mantenimiento" || estado === "chapisteria" || estado === "colision";
}

export function etiquetaPausa(estado: string | null | undefined): string {
  if (estado === "chapisteria") return "Chapistería";
  if (estado === "mantenimiento") return "Mantenimiento";
  if (estado === "colision") return "Colisión";
  return "Taller";
}

function detallePausa(estado: EstadoPausa, hasta: string | null): string {
  return hasta ? `pausa-productiva:${estado}:${hasta}` : `pausa-productiva:${estado}`;
}

function partesDetalle(detalle: string): { estado: EstadoPausa; hasta: string | null } | null {
  const partes = detalle.split(":");
  if (partes[0] !== "pausa-productiva" || !esEstadoPausa(partes[1])) return null;
  const hasta = partes[2] && /^\d{4}-\d{2}-\d{2}$/.test(partes[2]) ? partes[2] : null;
  return { estado: partes[1], hasta };
}

/**
 * La pausa corre desde el ingreso, inclusive, hasta el día anterior a la
 * activación. El día de activación el carro ya es productivo.
 * Sin fecha de activación sigue en pausa.
 */
export function pausaVigente(pausa: PausaAbierta | null | undefined, fecha: string): boolean {
  if (!pausa || fecha < pausa.desde) return false;
  if (pausa.hasta && fecha >= pausa.hasta) return false;
  return true;
}

/**
 * Mientras la pausa está vigente: acuerdo del día en cero.
 * Entre semana la letra de hoy tampoco corre (`diaLibre`).
 * El domingo no se marca día libre: eso achicaría la tajada al balde entero.
 * El saldo anterior (letras ya cargadas, domingo, recargos) no se toca.
 */
export function ajustarCobroPausa<T extends {
  diaLibre?: boolean;
  acuerdoHoy: number;
  faltaAcuerdo: number;
  hoy: string;
}>(entrada: T, pausa: PausaAbierta | null | undefined): T {
  if (!pausaVigente(pausa, entrada.hoy)) return entrada;
  return {
    ...entrada,
    diaLibre: Boolean(entrada.diaLibre) || !esDomingo(entrada.hoy),
    acuerdoHoy: 0,
    faltaAcuerdo: 0,
  };
}

/** Pausas abiertas. Si la activación ya llegó, el carro pasa a activo en esta lectura. */
export async function pausasAbiertas(): Promise<Map<string, PausaAbierta>> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const { data, error } = await sb
    .from("vehiculo_eventos")
    .select("vehiculo_id, fecha, detalle, created_at")
    .or(`detalle.eq.${DETALLE_RETORNO},detalle.like.pausa-productiva:*`)
    .order("created_at", { ascending: false });
  const out = new Map<string, PausaAbierta>();
  if (error || !data) {
    if (error) console.error("[pausa-productiva] eventos", error.message);
    return out;
  }

  const ultimo = new Map<string, { fecha: string; detalle: string }>();
  for (const row of data as { vehiculo_id: string; fecha: string; detalle: string }[]) {
    if (!row.vehiculo_id || ultimo.has(row.vehiculo_id)) continue;
    ultimo.set(row.vehiculo_id, { fecha: row.fecha, detalle: row.detalle });
  }
  const candidatos = [...ultimo.entries()].flatMap(([id, ev]) => {
    const partes = partesDetalle(ev.detalle);
    return partes ? [[id, { fecha: ev.fecha, ...partes }] as const] : [];
  });
  if (candidatos.length === 0) return out;

  const { data: vehs } = await sb
    .from("vehiculos")
    .select("id, estado")
    .in("id", candidatos.map(([id]) => id));
  const estadoDe = new Map(
    ((vehs ?? []) as { id: string; estado: string }[]).map((v) => [v.id, v.estado]),
  );

  for (const [id, ev] of candidatos) {
    const est = estadoDe.get(id) ?? "";
    if (est === "activo" || est === "entregado" || est === "por_entregar") continue;
    if (ev.hasta && ev.hasta <= hoy) {
      await cerrarPausa(id, ev.hasta, true);
      continue;
    }
    out.set(id, { vehiculoId: id, estado: ev.estado, desde: ev.fecha, hasta: ev.hasta });
  }
  return out;
}

export async function pausaDeVehiculo(vehiculoId: string | null | undefined): Promise<PausaAbierta | null> {
  if (!vehiculoId) return null;
  const map = await pausasAbiertas();
  return map.get(vehiculoId) ?? null;
}

/** Colisión puede no estar en el enum todavía: se guarda como improductivo y el evento dice Colisión. */
async function guardarEstadoVehiculo(
  vehiculoId: string,
  estado: string,
): Promise<{ ok: true; estadoDb: string } | { ok: false; msg: string }> {
  const sb = createServerSupabase();
  const primero = await sb.from("vehiculos").update({ estado }).eq("id", vehiculoId);
  if (!primero.error) return { ok: true, estadoDb: estado };
  if (estado === "colision" && /enum|invalid|estado/i.test(primero.error.message)) {
    const segundo = await sb.from("vehiculos").update({ estado: "improductivo" }).eq("id", vehiculoId);
    if (!segundo.error) return { ok: true, estadoDb: "improductivo" };
    return { ok: false, msg: segundo.error.message };
  }
  return { ok: false, msg: primero.error.message };
}

export async function quitarLetrasDeLaPausa(vehiculoId: string, desde: string, hasta: string): Promise<number> {
  if (desde > hasta) return 0;
  const sb = createServerSupabase();
  const { data: contrato } = await sb
    .from("contratos")
    .select("id")
    .eq("vehiculo_id", vehiculoId)
    .eq("estado", "activo")
    .maybeSingle();
  const contratoId = (contrato as { id: string } | null)?.id;
  if (!contratoId) return 0;
  const { data: rentas } = await sb
    .from("cargos")
    .select("id")
    .eq("contrato_id", contratoId)
    .eq("tipo", "renta")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  const ids = ((rentas ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { error } = await sb.from("cargos").delete().in("id", ids);
  if (error) return 0;
  return ids.length;
}

export async function reponerLetras(vehiculoId: string, desde: string, hasta: string): Promise<void> {
  if (desde > hasta) return;
  const sb = createServerSupabase();
  const { data: contrato } = await sb
    .from("contratos")
    .select("id, fecha_inicio, fecha_inicio_letra, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo")
    .eq("vehiculo_id", vehiculoId)
    .eq("estado", "activo")
    .maybeSingle();
  const row = contrato as (TerminosCuota & {
    id: string;
    fecha_inicio: string;
    fecha_inicio_letra: string | null;
  }) | null;
  if (!row) return;
  const inicioLetra = (row.fecha_inicio_letra && row.fecha_inicio_letra.trim()) || row.fecha_inicio;
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    if (esDomingo(fecha) || fecha < inicioLetra) continue;
    const { data: ya } = await sb
      .from("cargos")
      .select("id")
      .eq("contrato_id", row.id)
      .eq("fecha", fecha)
      .eq("tipo", "renta")
      .limit(1);
    if ((ya ?? []).length > 0) continue;
    const monto = cuotaDeFecha(row, fecha);
    if (monto <= 0) continue;
    await sb.from("cargos").insert({
      contrato_id: row.id,
      fecha,
      tipo: "renta",
      concepto: "Cuota diaria",
      monto,
    });
  }
}

async function cerrarPausa(vehiculoId: string, activacion: string, reponer: boolean): Promise<void> {
  const sb = createServerSupabase();
  const guardado = await guardarEstadoVehiculo(vehiculoId, "activo");
  if (!guardado.ok) return;
  await sb.from("vehiculo_eventos").insert({
    vehiculo_id: vehiculoId,
    fecha: activacion,
    tipo: "otro",
    titulo: "Retorno productivo",
    detalle: DETALLE_RETORNO,
    origen: "manual",
  });
  if (reponer) await reponerLetras(vehiculoId, activacion, hoyPanama());
}

function finDeLetrasQuitadas(desde: string, hasta: string | null, hoy: string): string | null {
  const tope = hasta ? sumarDias(hasta, -1) : hoy;
  const fin = tope < hoy ? tope : hoy;
  return desde <= fin ? fin : null;
}

async function anotarPausa(
  vehiculoId: string,
  estado: EstadoPausa,
  desde: string,
  hasta: string | null,
): Promise<string | null> {
  const sb = createServerSupabase();
  const tipo =
    estado === "mantenimiento" ? "mantenimiento" : estado === "chapisteria" ? "chapisteria" : "novedad";
  const { error } = await sb.from("vehiculo_eventos").insert({
    vehiculo_id: vehiculoId,
    fecha: desde,
    tipo,
    titulo: etiquetaPausa(estado),
    detalle: detallePausa(estado, hasta),
    origen: "manual",
  });
  return error ? error.message : null;
}

export async function aplicarEstadoProductivo(input: {
  vehiculoId: string;
  estado: string;
  fechaIngreso: string | null;
  fechaActivacion?: string | null;
  fechaDevolucion?: string | null;
}): Promise<{ ok: boolean; msg: string }> {
  const estado = String(input.estado ?? "").trim();
  const hoy = hoyPanama();
  const sb = createServerSupabase();

  if (estado === "entregado") {
    const { aplicarDevolucion } = await import("./devolucion");
    return aplicarDevolucion({
      vehiculoId: input.vehiculoId,
      fecha: input.fechaDevolucion ?? null,
    });
  }

  if (esEstadoPausa(estado)) {
    const desde = String(input.fechaIngreso ?? "").trim();
    const activacion = String(input.fechaActivacion ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      return { ok: false, msg: "Indicá la fecha de ingreso al taller." };
    }
    if (activacion && !/^\d{4}-\d{2}-\d{2}$/.test(activacion)) {
      return { ok: false, msg: "La fecha de activación no es válida." };
    }
    if (activacion && activacion < desde) {
      return { ok: false, msg: "La activación no puede ser antes del ingreso." };
    }
    const hasta = activacion || null;
    const previa = await pausaDeVehiculo(input.vehiculoId);

    if (hasta && hasta <= hoy) {
      const fin = finDeLetrasQuitadas(desde, hasta, hoy);
      if (fin) await quitarLetrasDeLaPausa(input.vehiculoId, desde, fin);
      const nota = await anotarPausa(input.vehiculoId, estado, desde, hasta);
      if (nota) return { ok: false, msg: nota };
      await cerrarPausa(input.vehiculoId, hasta, true);
      const tramo =
        desde < hasta
          ? `${etiquetaPausa(estado)} del ${desde} al ${sumarDias(hasta, -1)}. `
          : "";
      return {
        ok: true,
        msg: `${tramo}Desde el ${hasta} volvió a productivo: corre letra y acuerdo diario.`,
      };
    }

    if (previa && previa.estado === estado && previa.desde === desde && (previa.hasta ?? "") === (hasta ?? "")) {
      const guardado = await guardarEstadoVehiculo(input.vehiculoId, estado);
      if (!guardado.ok) return { ok: false, msg: guardado.msg };
      return { ok: true, msg: "" };
    }
    const guardado = await guardarEstadoVehiculo(input.vehiculoId, estado);
    if (!guardado.ok) return { ok: false, msg: guardado.msg };
    const nota = await anotarPausa(input.vehiculoId, estado, desde, hasta);
    if (nota) return { ok: false, msg: nota };
    const fin = finDeLetrasQuitadas(desde, hasta, hoy);
    const quitadas = fin ? await quitarLetrasDeLaPausa(input.vehiculoId, desde, fin) : 0;
    const extra =
      quitadas > 0
        ? ` Se quitaron ${quitadas} ${quitadas === 1 ? "letra" : "letras"} de la pausa.`
        : "";
    const cuando = hasta
      ? desde > hoy
        ? ` Queda del ${desde} al ${sumarDias(hasta, -1)}. Hasta el ingreso se cobra normal. El ${hasta} vuelve a productivo.`
        : ` Vuelve a productivo el ${hasta}. Hasta el día anterior no corre letra ni acuerdo diario.`
      : desde > hoy
        ? ` Queda programado para el ${desde}. Hasta ese día se cobra normal. Sin fecha de activación sigue en pausa.`
        : " Sin fecha de activación sigue en pausa: no corre letra ni acuerdo diario. El saldo que ya debía sigue en el cobro.";
    return {
      ok: true,
      msg: `${etiquetaPausa(estado)} desde ${desde}.${extra}${cuando}`,
    };
  }

  const previa = await pausaDeVehiculo(input.vehiculoId);
  const guardado = await guardarEstadoVehiculo(input.vehiculoId, estado || "activo");
  if (!guardado.ok) return { ok: false, msg: guardado.msg };
  if (previa) {
    await sb.from("vehiculo_eventos").insert({
      vehiculo_id: input.vehiculoId,
      fecha: hoy,
      tipo: "otro",
      titulo: "Retorno productivo",
      detalle: DETALLE_RETORNO,
      origen: "manual",
    });
    if ((estado || "activo") === "activo") await reponerLetras(input.vehiculoId, hoy, hoy);
    return {
      ok: true,
      msg: "El carro volvió a productivo hoy. Desde hoy corre otra vez la letra y el acuerdo diario.",
    };
  }
  return { ok: true, msg: "" };
}
