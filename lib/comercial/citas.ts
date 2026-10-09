// Visitas del comercial. Una cita abierta por chat: reagendar actualiza esa fila.

import { createServerSupabase } from "@/lib/supabase/server";
import { fechaConDia, hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import { sedePorId, validarHorario, type SedeId } from "./sedes";
import { sendText } from "@/lib/whatsapp/client";

export type ConfirmacionCita = "pendiente" | "chat" | "llamada";

export type CitaComercial = {
  id: string;
  conversacionId: string | null;
  waNumero: string;
  nombre: string;
  celular: string | null;
  sede: SedeId;
  fecha: string;
  hora: string;
  lugar: string | null;
  confirmacion: ConfirmacionCita;
  estado: "programada" | "cancelada";
  anuncio: string | null;
  campanaId: string | null;
};

export type PedidoCita = {
  accion: "ninguna" | "agendar" | "reagendar" | "confirmar" | "no_puede";
  nombre: string | null;
  sede: SedeId | null;
  fecha: string | null;
  hora: string | null;
  lugar: string | null;
  celular: string | null;
};

function tablaAusente(message: string): boolean {
  return /citas_comercial|schema cache|could not find the table/i.test(message);
}

function fila(row: Record<string, unknown>): CitaComercial {
  const sede = row.sede === "chorrera" ? "chorrera" : "juan_diaz";
  const confirmacion = row.confirmacion === "chat" || row.confirmacion === "llamada" ? row.confirmacion : "pendiente";
  return {
    id: String(row.id),
    conversacionId: (row.conversacion_id as string | null) ?? null,
    waNumero: String(row.wa_numero ?? ""),
    nombre: String(row.nombre ?? ""),
    celular: (row.celular as string | null) ?? null,
    sede,
    fecha: String(row.fecha ?? "").slice(0, 10),
    hora: String(row.hora ?? "").slice(0, 5),
    lugar: (row.lugar as string | null) ?? null,
    confirmacion,
    estado: row.estado === "cancelada" ? "cancelada" : "programada",
    anuncio: (row.anuncio as string | null) ?? null,
    campanaId: (row.campana_id as string | null) ?? null,
  };
}

export async function listarCitas(): Promise<{ citas: CitaComercial[]; error: string | null }> {
  try {
    const sb = createServerSupabase();
    const desde = sumarDias(hoyPanama(), -1);
    const { data, error } = await sb
      .from("citas_comercial")
      .select("*")
      .gte("fecha", desde)
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true })
      .limit(200);
    if (error) {
      return {
        citas: [],
        error: tablaAusente(error.message)
          ? "Falta la migración 0038. Las citas todavía no tienen tabla."
          : error.message,
      };
    }
    return { citas: ((data ?? []) as Record<string, unknown>[]).map(fila), error: null };
  } catch (e) {
    return { citas: [], error: e instanceof Error ? e.message : "No pude leer las citas." };
  }
}

export async function citaAbierta(conversacionId: string): Promise<CitaComercial | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("citas_comercial")
    .select("*")
    .eq("conversacion_id", conversacionId)
    .eq("estado", "programada")
    .order("fecha", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return fila(data[0] as Record<string, unknown>);
}

function telefonoVisible(wa: string, celular: string | null): string {
  const raw = (celular || wa).replace(/\D/g, "");
  const d = raw.startsWith("507") ? raw.slice(3) : raw;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return celular || wa;
}

export function textoConfirmacion(cita: {
  nombre: string;
  sede: SedeId;
  fecha: string;
  hora: string;
  waNumero: string;
  celular: string | null;
}): string {
  const sede = sedePorId(cita.sede);
  return `Listo, ${cita.nombre}. Queda el ${fechaConDia(cita.fecha)} a las ${cita.hora} en ${sede?.nombre ?? "la sede"}. El celular queda ${telefonoVisible(cita.waNumero, cita.celular)}. El día antes le escribo para confirmar, y el mismo día le mando cómo llegar.`;
}

export async function aplicarPedidoCita(opts: {
  conversacionId: string;
  waNumero: string;
  pedido: PedidoCita | null;
  anuncio: string | null;
  campanaId: string | null;
}): Promise<{ mensaje: string | null }> {
  const pedido = opts.pedido;
  if (!pedido || pedido.accion === "ninguna") return { mensaje: null };
  const abierta = await citaAbierta(opts.conversacionId);

  if (pedido.accion === "confirmar") {
    if (!abierta) return { mensaje: "No le veo una cita abierta. ¿En qué sede y a qué hora quiere pasar?" };
    const sb = createServerSupabase();
    const { error } = await sb
      .from("citas_comercial")
      .update({ confirmacion: "chat", updated_at: new Date().toISOString() })
      .eq("id", abierta.id);
    if (error) return { mensaje: null };
    return { mensaje: `Quedó confirmada, ${abierta.nombre}. Lo esperamos el ${fechaConDia(abierta.fecha)} a las ${abierta.hora}.` };
  }

  if (pedido.accion === "no_puede" && !pedido.fecha && !pedido.hora) {
    return {
      mensaje: abierta
        ? `Sin problema. ¿Qué otro día y a qué hora le queda mejor? En ${sedePorId(abierta.sede)?.nombre ?? "la sede"} se cita dentro del horario.`
        : "Cuénteme qué día y a qué hora le queda mejor y se la dejo.",
    };
  }

  const sede = pedido.sede ?? abierta?.sede ?? null;
  const fecha = pedido.fecha ?? (pedido.accion === "reagendar" ? null : abierta?.fecha ?? null);
  const hora = pedido.hora ?? (pedido.accion === "reagendar" ? null : abierta?.hora ?? null);
  const nombre = (pedido.nombre ?? abierta?.nombre ?? "").trim();
  const lugar = (pedido.lugar ?? abierta?.lugar ?? "").trim();
  const celular = (pedido.celular ?? abierta?.celular ?? "").trim() || null;

  if (!sede) return { mensaje: "¿En cuál sede le queda mejor, Juan Díaz o La Chorrera?" };
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { mensaje: "¿Qué día quiere la cita?" };
  if (fecha < hoyPanama()) return { mensaje: "Ese día ya pasó. Dígame un día de hoy en adelante." };
  if (!hora) return { mensaje: "¿A qué hora le queda bien? Puede ser en punto o a la media." };
  const horario = validarHorario(sede, fecha, hora);
  if (horario) return { mensaje: horario };
  if (nombre.length < 2) return { mensaje: "¿Con qué nombre dejo la cita?" };
  if (lugar.length < 2) return { mensaje: "¿De qué lugar es usted? Con eso le confirmo si la zona está dentro del alcance." };

  const sb = createServerSupabase();
  const ahora = new Date().toISOString();
  const campos = {
    nombre,
    celular,
    sede,
    fecha,
    hora,
    lugar,
    confirmacion: "pendiente" as const,
    estado: "programada" as const,
    anuncio: opts.anuncio,
    campana_id: opts.campanaId,
    aviso_vispera_at: null,
    aviso_dia_at: null,
    aviso_error: null,
    updated_at: ahora,
  };
  const guardado = abierta
    ? await sb.from("citas_comercial").update(campos).eq("id", abierta.id).select("*").single()
    : await sb
        .from("citas_comercial")
        .insert({
          ...campos,
          conversacion_id: opts.conversacionId,
          wa_numero: opts.waNumero,
        })
        .select("*")
        .single();
  if (guardado.error) {
    if (tablaAusente(guardado.error.message)) return { mensaje: null };
    return { mensaje: null };
  }
  const cita = fila(guardado.data as Record<string, unknown>);
  return {
    mensaje: textoConfirmacion({
      nombre: cita.nombre,
      sede: cita.sede,
      fecha: cita.fecha,
      hora: cita.hora,
      waNumero: cita.waNumero,
      celular: cita.celular,
    }),
  };
}

export async function confirmarCitaPorLlamada(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = createServerSupabase();
  const { error } = await sb
    .from("citas_comercial")
    .update({ confirmacion: "llamada", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function enviarAvisosCitas(): Promise<{ vispera: number; dia: number; fallos: number }> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const manana = sumarDias(hoy, 1);
  const phoneId = process.env.WHATSAPP_COMERCIAL_PHONE_NUMBER_ID;
  const { data, error } = await sb
    .from("citas_comercial")
    .select("*")
    .eq("estado", "programada")
    .in("fecha", [hoy, manana]);
  if (error || !data) return { vispera: 0, dia: 0, fallos: 0 };

  let vispera = 0;
  let dia = 0;
  let fallos = 0;
  for (const raw of data as Record<string, unknown>[]) {
    const cita = fila(raw);
    const sede = sedePorId(cita.sede);
    const esHoy = cita.fecha === hoy;
    const ya = esHoy ? raw.aviso_dia_at : raw.aviso_vispera_at;
    if (ya) continue;
    const texto = esHoy
      ? `${cita.nombre}, hoy lo esperamos a las ${cita.hora} en ${sede?.nombre ?? "la sede"}. Cómo llegar: ${sede?.maps ?? ""}`
      : `${cita.nombre}, le confirmo la cita de mañana ${fechaConDia(cita.fecha)} a las ${cita.hora} en ${sede?.nombre ?? "la sede"}. Responda SÍ para dejarla confirmada. Si no puede, dígame otro día y la movemos.`;
    let avisoError: string | null = null;
    try {
      if (!phoneId) throw new Error("Falta el número comercial.");
      await sendText(cita.waNumero, texto, phoneId);
      if (cita.conversacionId) {
        await sb.from("mensajes_comercial").insert({
          conversacion_id: cita.conversacionId,
          direccion: "out",
          texto,
        });
      }
      if (esHoy) dia += 1;
      else vispera += 1;
    } catch (e) {
      avisoError = e instanceof Error ? e.message : "No pude enviar el aviso.";
      fallos += 1;
    }
    await sb
      .from("citas_comercial")
      .update({
        ...(avisoError
          ? {}
          : esHoy
            ? { aviso_dia_at: new Date().toISOString() }
            : { aviso_vispera_at: new Date().toISOString() }),
        aviso_error: avisoError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cita.id);
  }
  return { vispera, dia, fallos };
}
