// Persistencia de salidas al interior: etiquetar el pago, cargo del rubro y aval.

import { createServerSupabase } from "@/lib/supabase/server";
import { fechaContable, hoyPanama } from "./fecha";
import {
  DESTINO_OTRO_ID,
  destinoPorId,
  destinoPorNombre,
  inferirDestinoPorMonto,
  partirMontoInterior,
  type DestinoInterior,
} from "./salidas-interior";
import type { AsignacionPago, ResultadoPago } from "./types";

export type SalidaFila = {
  id: string;
  contrato_id: string;
  pago_id: string | null;
  destino: string;
  destino_id: string;
  monto: number;
  fecha: string;
  fecha_hasta?: string | null;
  fuera_tabla?: boolean;
  gps_estado?: string | null;
  gps_nota?: string | null;
  estado: string;
  aval_at: string | null;
  aval_por: string | null;
};

export function esPagoSalidaInterior(p: {
  rubro?: string | null;
  destino_interior?: string | null;
  asignaciones?: unknown;
}): boolean {
  if (p.rubro === "salida_interior") return true;
  if (p.destino_interior) return true;
  const asigs = extraerAsignaciones(p.asignaciones);
  return asigs.some((a) => a.tipo === "salida_interior");
}

export function montoQueCubreCuota(p: {
  monto: number;
  rubro?: string | null;
  destino_interior?: string | null;
  asignaciones?: unknown;
}): number {
  const total = Number(p.monto) || 0;
  const asigs = extraerAsignaciones(p.asignaciones);
  const interior = asigs
    .filter((a) => a.tipo === "salida_interior")
    .reduce((s, a) => s + Number(a.aplicado || 0), 0);
  if (interior > 0.009) return Math.max(0, Math.round((total - interior) * 100) / 100);
  if (p.rubro === "salida_interior") {
    const dest = destinoDePago(p.destino_interior);
    if (dest) return partirMontoInterior(total, dest.monto).resto;
    return 0;
  }
  return total;
}

function extraerAsignaciones(raw: unknown): AsignacionPago[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw as AsignacionPago[];
  const o = raw as ResultadoPago;
  return Array.isArray(o.asignaciones) ? o.asignaciones : [];
}

export function destinoDePago(destinoInterior: string | null | undefined): DestinoInterior | null {
  if (!destinoInterior) return null;
  return destinoPorId(destinoInterior) ?? destinoPorNombre(destinoInterior);
}

export async function etiquetarPagoSalida(
  pagoId: string,
  dest: DestinoInterior,
): Promise<void> {
  const sb = createServerSupabase();
  const { error } = await sb
    .from("pagos")
    .update({ rubro: "salida_interior", destino_interior: dest.id })
    .eq("id", pagoId);
  if (error && /rubro|destino_interior/i.test(error.message)) {
    const { data } = await sb.from("pagos").select("notas").eq("id", pagoId).maybeSingle();
    const notas = (data as { notas: string | null } | null)?.notas;
    await sb
      .from("pagos")
      .update({
        notas: [notas, `RUBRO: salida_interior ${dest.nombre} $${dest.monto}`].filter(Boolean).join(" "),
      })
      .eq("id", pagoId);
  }
}

export async function inferirSalidaDelChat(opts: {
  pagoId: string;
  monto: number;
  textos: string[];
}): Promise<DestinoInterior | null> {
  const dest = inferirDestinoPorMonto(opts.monto, opts.textos);
  if (!dest) return null;
  await etiquetarPagoSalida(opts.pagoId, dest);
  return dest;
}

export async function upsertSalidaAutorizada(opts: {
  contratoId: string;
  vehiculoId?: string | null;
  clienteId?: string | null;
  pagoId: string;
  dest: DestinoInterior;
  monto: number;
  fecha: string;
  fechaHasta?: string | null;
  estado: "pendiente_aval" | "autorizada";
  avalPor?: string | null;
}): Promise<string | null> {
  const sb = createServerSupabase();
  const fuera = opts.dest.id === DESTINO_OTRO_ID;
  const hasta =
    opts.fechaHasta && opts.fechaHasta >= opts.fecha ? opts.fechaHasta : null;
  const { data: ya } = await sb
    .from("salidas_autorizadas")
    .select("id, estado")
    .eq("pago_id", opts.pagoId)
    .maybeSingle();
  const prev = ya as { id: string; estado: string } | null;
  const extra: Record<string, unknown> = {
    fuera_tabla: fuera,
    destino: opts.dest.nombre,
    destino_id: opts.dest.id,
    monto: opts.monto,
  };
  if (hasta) extra.fecha_hasta = hasta;
  if (prev) {
    if (opts.estado === "autorizada" && prev.estado !== "autorizada") {
      await sb
        .from("salidas_autorizadas")
        .update({
          estado: "autorizada",
          aval_at: new Date().toISOString(),
          aval_por: opts.avalPor ?? "sistema",
          ...extra,
        })
        .eq("id", prev.id);
    }
    await registrarAlertasOperativas({
      salidaId: prev.id,
      fecha: opts.fecha,
      fechaHasta: hasta ?? opts.fecha,
      vehiculoId: opts.vehiculoId ?? null,
      dest: opts.dest,
    });
    return prev.id;
  }
  const row = {
    contrato_id: opts.contratoId,
    vehiculo_id: opts.vehiculoId ?? null,
    cliente_id: opts.clienteId ?? null,
    pago_id: opts.pagoId,
    destino: opts.dest.nombre,
    destino_id: opts.dest.id,
    monto: opts.monto,
    fecha: opts.fecha,
    fecha_hasta: hasta ?? opts.fecha,
    fuera_tabla: fuera,
    estado: opts.estado,
    aval_at: opts.estado === "autorizada" ? new Date().toISOString() : null,
    aval_por: opts.estado === "autorizada" ? (opts.avalPor ?? "sistema") : null,
  };
  const { data, error } = await sb.from("salidas_autorizadas").insert(row).select("id").maybeSingle();
  if (error) {
    console.error("[salidas] no pude guardar", error.message);
    return null;
  }
  const id = (data as { id: string } | null)?.id ?? null;
  if (id) {
    await registrarAlertasOperativas({
      salidaId: id,
      fecha: opts.fecha,
      fechaHasta: hasta,
      vehiculoId: opts.vehiculoId ?? null,
      dest: opts.dest,
    });
  }
  return id;
}

async function registrarAlertasOperativas(opts: {
  salidaId: string;
  fecha: string;
  fechaHasta: string;
  vehiculoId: string | null;
  dest: DestinoInterior;
}): Promise<void> {
  const sb = createServerSupabase();
  const { data: veh } = opts.vehiculoId
    ? await sb.from("vehiculos").select("numero").eq("id", opts.vehiculoId).maybeSingle()
    : { data: null };
  const etiqueta = (veh as { numero?: string } | null)?.numero ?? null;
  const dias = Math.round(
    (new Date(`${opts.fechaHasta}T12:00:00Z`).getTime() - new Date(`${opts.fecha}T12:00:00Z`).getTime()) /
      86_400_000,
  ) + 1;
  if (opts.dest.id === DESTINO_OTRO_ID) {
    await upsertAlertaSalida({
      fecha: opts.fecha,
      tipo: "fuera_tabla",
      salidaId: opts.salidaId,
      vehiculoId: opts.vehiculoId,
      etiqueta,
      motivo: `Destino fuera de tabla: ${opts.dest.nombre} · $${opts.dest.monto}. Cotizar / confirmar.`,
    });
  }
  if (dias > 1) {
    await upsertAlertaSalida({
      fecha: opts.fecha,
      tipo: "multidia",
      salidaId: opts.salidaId,
      vehiculoId: opts.vehiculoId,
      etiqueta,
      motivo: `Viaje de ${dias} días a ${opts.dest.nombre} (${opts.fecha} → ${opts.fechaHasta}).`,
    });
  }
}

export async function upsertAlertaSalida(opts: {
  fecha: string;
  tipo: string;
  salidaId?: string | null;
  vehiculoId?: string | null;
  etiqueta?: string | null;
  motivo: string;
}): Promise<void> {
  const sb = createServerSupabase();
  const { error } = await sb.from("salidas_alertas").insert({
    fecha: opts.fecha,
    tipo: opts.tipo,
    salida_id: opts.salidaId ?? null,
    vehiculo_id: opts.vehiculoId ?? null,
    etiqueta: opts.etiqueta ?? null,
    motivo: opts.motivo,
  });
  if (error && !/duplicate|unique|23505/i.test(error.message)) {
    console.error("[salidas] alerta", error.message);
  }
}

export async function asegurarCargoSalida(opts: {
  contratoId: string;
  pagoId: string;
  dest: DestinoInterior;
  monto: number;
  fecha: string;
}): Promise<void> {
  const sb = createServerSupabase();
  const { data: ya } = await sb
    .from("cargos")
    .select("id")
    .eq("pago_id", opts.pagoId)
    .eq("concepto_codigo", "SALIDA_INT")
    .limit(1);
  if ((ya ?? []).length > 0) return;
  const { error } = await sb.from("cargos").insert({
    contrato_id: opts.contratoId,
    fecha: opts.fecha,
    tipo: "otras",
    concepto_codigo: "SALIDA_INT",
    concepto: `Salida al interior — ${opts.dest.nombre}`,
    monto: opts.monto,
    pago_id: opts.pagoId,
  });
  if (error && /pago_id|SALIDA_INT|concepto_codigo/i.test(error.message)) {
    console.error("[salidas] cargo no creado (¿migración 0019?)", error.message);
  }
}

export async function borrarCargoSalidaDelPago(pagoId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb.from("cargos").delete().eq("pago_id", pagoId).eq("concepto_codigo", "SALIDA_INT");
  await sb.from("salidas_autorizadas").update({ estado: "rechazada" }).eq("pago_id", pagoId);
}

export async function registrarSalidaPendiente(opts: {
  contratoId: string;
  vehiculoId?: string | null;
  clienteId?: string | null;
  pagoId: string;
  dest: DestinoInterior;
  monto: number;
  pagadoAt: string;
  fechaHasta?: string | null;
}): Promise<void> {
  const { interior } = partirMontoInterior(opts.monto, opts.dest.monto);
  const fecha = fechaContable(opts.pagadoAt) || hoyPanama();
  await upsertSalidaAutorizada({
    contratoId: opts.contratoId,
    vehiculoId: opts.vehiculoId,
    clienteId: opts.clienteId,
    pagoId: opts.pagoId,
    dest: opts.dest,
    monto: interior,
    fecha,
    fechaHasta: opts.fechaHasta,
    estado: "pendiente_aval",
  });
}

export async function darAvalSalida(salidaId: string, por = "equipo"): Promise<void> {
  const sb = createServerSupabase();
  const { error } = await sb
    .from("salidas_autorizadas")
    .update({ estado: "autorizada", aval_at: new Date().toISOString(), aval_por: por })
    .eq("id", salidaId);
  if (error) throw new Error(error.message);
}

export async function salidasPendientesAval(): Promise<
  { id: string; titulo: string; motivo: string; desde: string }[]
> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("salidas_autorizadas")
      .select(
        "id, destino, monto, created_at, contrato:contratos(vehiculo:vehiculos(numero))",
      )
      .eq("estado", "pendiente_aval")
      .order("created_at", { ascending: true })
      .limit(40);
    if (error) return [];
    return ((data ?? []) as {
      id: string;
      destino: string;
      monto: number;
      created_at: string;
      contrato: { vehiculo: { numero: string } | null } | null;
    }[]).map((s) => ({
      id: `salida:${s.id}`,
      titulo: s.contrato?.vehiculo?.numero
        ? `Carro ${s.contrato.vehiculo.numero}`
        : "Salida al interior",
      motivo: `Aval pendiente · ${s.destino} · $${Number(s.monto)}`,
      desde: s.created_at,
    }));
  } catch {
    return [];
  }
}

export async function salidasDePagos(pagoIds: string[]): Promise<Map<string, SalidaFila>> {
  const out = new Map<string, SalidaFila>();
  if (pagoIds.length === 0) return out;
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("salidas_autorizadas")
      .select("id, contrato_id, pago_id, destino, destino_id, monto, fecha, estado, aval_at, aval_por")
      .in("pago_id", pagoIds);
    if (error) return out;
    for (const s of (data ?? []) as SalidaFila[]) {
      if (s.pago_id) out.set(s.pago_id, s);
    }
  } catch {
    /* tabla aún no existe */
  }
  return out;
}

export async function salidasRecientes(limite = 25): Promise<SalidaFila[]> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("salidas_autorizadas")
      .select("id, contrato_id, pago_id, destino, destino_id, monto, fecha, estado, aval_at, aval_por")
      .order("created_at", { ascending: false })
      .limit(limite);
    if (error) return [];
    return (data ?? []) as SalidaFila[];
  } catch {
    return [];
  }
}

export async function salidasDelContrato(contratoId: string, limite = 8): Promise<SalidaFila[]> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("salidas_autorizadas")
      .select("id, contrato_id, pago_id, destino, destino_id, monto, fecha, estado, aval_at, aval_por")
      .eq("contrato_id", contratoId)
      .order("fecha", { ascending: false })
      .limit(limite);
    if (error) return [];
    return (data ?? []) as SalidaFila[];
  } catch {
    return [];
  }
}

export type SalidaHoyVista = {
  id: string;
  vehiculoId: string | null;
  numero: string | null;
  destino: string;
  monto: number;
  estadoAval: string;
  estadoPago: string | null;
  pagoId: string | null;
  fecha?: string;
  fechaHasta?: string | null;
  fueraTabla?: boolean;
  gpsEstado?: string | null;
  gpsNota?: string | null;
};

function textoPago(estado: string | null): string {
  if (estado === "conciliado") return "cruzado con el banco";
  if (estado === "manual") return "oficina";
  if (estado === "pendiente") return "pendiente por conciliar";
  return "pago registrado";
}

export function lineaSalidaHoy(s: SalidaHoyVista): string {
  const carro = s.numero ? `Carro ${s.numero}` : "Carro";
  const aval = s.estadoAval === "autorizada" ? "aval dado" : "sin aval";
  const dias =
    s.fecha && s.fechaHasta && s.fechaHasta > s.fecha ? ` · ${s.fecha} a ${s.fechaHasta}` : "";
  const extra = s.fueraTabla ? " · destino fuera de tabla" : "";
  const gps = s.gpsNota ? ` · ${s.gpsNota}` : "";
  return `${carro} hoy con salida a ${s.destino}${dias}${extra} · ${textoPago(s.estadoPago)} · ${aval}${gps}`;
}

export function lineaSalidaCruce(s: SalidaHoyVista): string {
  const carro = s.numero ? `Carro ${s.numero}` : "Carro";
  const aval = s.estadoAval === "autorizada" ? "aval dado" : "sin aval";
  return `${carro} · salida a ${s.destino} · ${textoPago(s.estadoPago)} · ${aval}`;
}

export async function salidasDelDia(fecha: string): Promise<SalidaHoyVista[]> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("salidas_autorizadas")
      .select(
        "id, destino, monto, estado, pago_id, vehiculo_id, fecha, fecha_hasta, fuera_tabla, gps_estado, gps_nota, vehiculo:vehiculos(numero), pago:pagos(estado_conciliacion, numero_carro)",
      )
      .lte("fecha", fecha)
      .neq("estado", "rechazada")
      .order("created_at", { ascending: false })
      .limit(80);
    if (error && /fecha_hasta|fuera_tabla|gps_/i.test(error.message)) {
      const retry = await sb
        .from("salidas_autorizadas")
        .select(
          "id, destino, monto, estado, pago_id, vehiculo_id, vehiculo:vehiculos(numero), pago:pagos(estado_conciliacion, numero_carro)",
        )
        .eq("fecha", fecha)
        .neq("estado", "rechazada");
      if (retry.error) return [];
      return ((retry.data ?? []) as {
        id: string;
        destino: string;
        monto: number;
        estado: string;
        pago_id: string | null;
        vehiculo_id: string | null;
        vehiculo: { numero: string } | null;
        pago: { estado_conciliacion: string; numero_carro: string | null } | null;
      }[]).map((s) => ({
        id: s.id,
        vehiculoId: s.vehiculo_id,
        numero: s.vehiculo?.numero ?? s.pago?.numero_carro ?? null,
        destino: s.destino,
        monto: Number(s.monto),
        estadoAval: s.estado,
        estadoPago: s.pago?.estado_conciliacion ?? null,
        pagoId: s.pago_id,
      }));
    }
    if (error) return [];
    return ((data ?? []) as {
      id: string;
      destino: string;
      monto: number;
      estado: string;
      pago_id: string | null;
      vehiculo_id: string | null;
      fecha: string;
      fecha_hasta: string | null;
      fuera_tabla: boolean | null;
      gps_estado: string | null;
      gps_nota: string | null;
      vehiculo: { numero: string } | null;
      pago: { estado_conciliacion: string; numero_carro: string | null } | null;
    }[])
      .filter((s) => {
        const hasta = s.fecha_hasta ?? s.fecha;
        return s.fecha <= fecha && fecha <= hasta;
      })
      .map((s) => ({
        id: s.id,
        vehiculoId: s.vehiculo_id,
        numero: s.vehiculo?.numero ?? s.pago?.numero_carro ?? null,
        destino: s.destino,
        monto: Number(s.monto),
        estadoAval: s.estado,
        estadoPago: s.pago?.estado_conciliacion ?? null,
        pagoId: s.pago_id,
        fecha: s.fecha,
        fechaHasta: s.fecha_hasta ?? s.fecha,
        fueraTabla: Boolean(s.fuera_tabla),
        gpsEstado: s.gps_estado,
        gpsNota: s.gps_nota,
      }));
  } catch {
    return [];
  }
}

/** Comprobantes de salida que el extracto todavía tiene que cruzar. */
export async function salidasPendientesBanco(): Promise<SalidaHoyVista[]> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("salidas_autorizadas")
      .select(
        "id, destino, monto, estado, pago_id, vehiculo_id, vehiculo:vehiculos(numero), pago:pagos(estado_conciliacion, numero_carro)",
      )
      .neq("estado", "rechazada")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return [];
    return ((data ?? []) as {
      id: string;
      destino: string;
      monto: number;
      estado: string;
      pago_id: string | null;
      vehiculo_id: string | null;
      vehiculo: { numero: string } | null;
      pago: { estado_conciliacion: string; numero_carro: string | null } | null;
    }[])
      .filter((s) => s.pago?.estado_conciliacion === "pendiente")
      .map((s) => ({
        id: s.id,
        vehiculoId: s.vehiculo_id,
        numero: s.vehiculo?.numero ?? s.pago?.numero_carro ?? null,
        destino: s.destino,
        monto: Number(s.monto),
        estadoAval: s.estado,
        estadoPago: "pendiente",
        pagoId: s.pago_id,
      }));
  } catch {
    return [];
  }
}

export async function salidasAlertasPendientes(): Promise<
  { id: string; titulo: string; motivo: string; desde: string; tipo: string }[]
> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("salidas_alertas")
      .select("id, tipo, etiqueta, motivo, created_at")
      .is("vista_at", null)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return [];
    return ((data ?? []) as {
      id: string;
      tipo: string;
      etiqueta: string | null;
      motivo: string;
      created_at: string;
    }[]).map((a) => ({
      id: `salerta:${a.id}`,
      titulo: a.etiqueta ? `Carro ${a.etiqueta}` : "Salida / GPS",
      motivo: a.motivo,
      desde: a.created_at,
      tipo: a.tipo,
    }));
  } catch {
    return [];
  }
}

export async function marcarAlertaSalidaVista(id: string): Promise<void> {
  const raw = id.replace(/^salerta:/, "");
  const sb = createServerSupabase();
  await sb.from("salidas_alertas").update({ vista_at: new Date().toISOString() }).eq("id", raw);
}

export async function idsVehiculoYCliente(
  contratoId: string,
): Promise<{ vehiculoId: string | null; clienteId: string | null }> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("contratos")
    .select("vehiculo_id, cliente_id")
    .eq("id", contratoId)
    .maybeSingle();
  const r = data as { vehiculo_id: string | null; cliente_id: string | null } | null;
  return { vehiculoId: r?.vehiculo_id ?? null, clienteId: r?.cliente_id ?? null };
}
