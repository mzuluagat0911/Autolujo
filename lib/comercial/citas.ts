// Visitas del comercial. Una cita abierta por chat: reagendar actualiza esa fila.

import { ventanaAbierta } from "@/lib/cartera/pipeline";
import { createServerSupabase } from "@/lib/supabase/server";
import { fechaConDia, hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import { avisoCitaPendiente } from "./avisos-cita";
import { horaAMinutos, minutosAHora, sedePorId, validarHorario, ventanaCita, type SedeId } from "./sedes";
import { sendTemplate, sendText } from "@/lib/whatsapp/client";
import { idMensajeEnviado } from "./entrega";
import { enviosAutomaticos, modoAgente, numeroEnPiloto } from "./piloto";
import { nombreDeWhatsApp } from "./lead";
import {
  aceptaSiguienteHorario,
  clienteDiceQueNoLlega,
  franjaHoraria,
  horaComercial,
  pedidoRepiteCita,
  preguntaLaHora,
  telefonoVisible,
  textoEsConfirmacion,
} from "./cita-pedido";
import { enviarVideoSede } from "./video-sede";
import { plantillaCita } from "./plantillas";

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
  asistencia: "pendiente" | "asistio" | "no_asistio";
  anuncio: string | null;
  campanaId: string | null;
};

export type PedidoCita = {
  accion: "ninguna" | "agendar" | "reagendar" | "confirmar" | "no_puede" | "cancelar";
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

async function horasTomadas(
  sb: ReturnType<typeof createServerSupabase>,
  sede: SedeId,
  fecha: string,
  excludeId: string | null,
): Promise<Set<string>> {
  const { data } = await sb
    .from("citas_comercial")
    .select("id, hora")
    .eq("sede", sede)
    .eq("fecha", fecha)
    .eq("estado", "programada");
  const tomadas = new Set<string>();
  for (const row of (data ?? []) as { id?: string; hora?: string }[]) {
    if (excludeId && row.id === excludeId) continue;
    const h = String(row.hora ?? "").slice(0, 5);
    if (h) tomadas.add(h);
  }
  return tomadas;
}

function siguienteHueco(sede: SedeId, fecha: string, hora: string, tomadas: Set<string>): string | null {
  const ventana = ventanaCita(sede, fecha);
  const inicio = horaAMinutos(hora);
  if (!ventana || inicio == null) return null;
  for (let mins = inicio + 30; mins <= ventana.hasta; mins += 30) {
    const h = minutosAHora(mins);
    if (!tomadas.has(h)) return h;
  }
  return null;
}

async function resolverHorarioLibre(
  sb: ReturnType<typeof createServerSupabase>,
  opts: { sede: SedeId; fecha: string; hora: string; excludeId: string | null; textoCliente: string },
): Promise<{ hora: string | null; mensaje: string | null }> {
  const tomadas = await horasTomadas(sb, opts.sede, opts.fecha, opts.excludeId);
  if (!tomadas.has(opts.hora)) return { hora: opts.hora, mensaje: null };
  const siguiente = siguienteHueco(opts.sede, opts.fecha, opts.hora, tomadas);
  const sedeNombre = sedePorId(opts.sede)?.nombre ?? "la sede";
  if (!siguiente) {
    return {
      hora: null,
      mensaje: `Ese horario en ${sedeNombre} ya está lleno. ¿Qué otra hora le queda, en punto o a la media?`,
    };
  }
  if (aceptaSiguienteHorario(opts.textoCliente)) return { hora: siguiente, mensaje: null };
  if (preguntaLaHora(opts.textoCliente)) {
    return {
      hora: null,
      mensaje: `Quedaría a las ${horaComercial(siguiente)} en ${sedeNombre}. ¿Se la dejo?`,
    };
  }
  return {
    hora: null,
    mensaje: `Las ${horaComercial(opts.hora)} en ${sedeNombre} ya están tomadas. Le puedo dejar las ${horaComercial(siguiente)}. ¿Se las dejo?`,
  };
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
    asistencia: row.asistencia === "asistio" || row.asistencia === "no_asistio" ? row.asistencia : "pendiente",
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

async function ultimaCitaCancelada(conversacionId: string): Promise<CitaComercial | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("citas_comercial")
    .select("*")
    .eq("conversacion_id", conversacionId)
    .eq("estado", "cancelada")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return fila(data[0] as Record<string, unknown>);
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

export function textoConfirmacion(cita: {
  nombre: string;
  sede: SedeId;
  fecha: string;
  hora: string;
  waNumero: string;
  celular: string | null;
}): string {
  const sede = sedePorId(cita.sede);
  const nombre = nombreDeWhatsApp(cita.nombre);
  const cabeza = nombre ? `Listo, ${nombre}.` : "Listo.";
  return `${cabeza} Queda el ${fechaConDia(cita.fecha)} a las ${cita.hora} en ${sede?.nombre ?? "la sede"}. El celular queda ${telefonoVisible(cita.waNumero, cita.celular)}. El día antes le escribo para confirmar, y el mismo día le mando cómo llegar.`;
}

export async function aplicarPedidoCita(opts: {
  conversacionId: string;
  waNumero: string;
  pedido: PedidoCita | null;
  anuncio: string | null;
  campanaId: string | null;
  textoCliente?: string | null;
}): Promise<{ mensaje: string | null; agendo?: boolean }> {
  const pedido = opts.pedido;
  if (!pedido || pedido.accion === "ninguna") return { mensaje: null };
  const abierta = await citaAbierta(opts.conversacionId);

  if (pedido.accion === "confirmar") {
    if (!abierta) return { mensaje: "No le veo una cita abierta. ¿En qué sede y a qué hora quiere pasar?" };
    if (abierta.confirmacion === "chat" || abierta.confirmacion === "llamada") return { mensaje: null };
    if (opts.textoCliente && !textoEsConfirmacion(opts.textoCliente)) return { mensaje: null };
    const sb = createServerSupabase();
    const { error } = await sb
      .from("citas_comercial")
      .update({ confirmacion: "chat", updated_at: new Date().toISOString() })
      .eq("id", abierta.id);
    if (error) return { mensaje: null };
    const nombre = nombreDeWhatsApp(abierta.nombre);
    const cabeza = nombre ? `Quedó confirmada, ${nombre}.` : "Quedó confirmada.";
    return { mensaje: `${cabeza} Lo esperamos el ${fechaConDia(abierta.fecha)} a las ${abierta.hora}.` };
  }

  if (pedido.accion === "cancelar") {
    if (!abierta) return { mensaje: "No le veo una cita abierta para cancelar." };
    const sb = createServerSupabase();
    const ahora = new Date().toISOString();
    await sb.from("citas_comercial").update({ estado: "cancelada", updated_at: ahora }).eq("id", abierta.id);
    await sb
      .from("conversaciones_comercial")
      .update({
        etapa: "conversacion",
        proxima_accion: "Ofrecer otra fecha",
        seguimiento_at: null,
        updated_at: ahora,
      })
      .eq("id", opts.conversacionId);
    return { mensaje: `Listo, ${abierta.nombre}. Cancelé la cita del ${fechaConDia(abierta.fecha)}. Si quiere, le busco otro día.` };
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
  let nombre = (pedido.nombre ?? abierta?.nombre ?? "").trim();
  if (nombre.length < 2) {
    const ficha = await createServerSupabase()
      .from("conversaciones_comercial")
      .select("nombre")
      .eq("id", opts.conversacionId)
      .maybeSingle();
    const deFicha = String(ficha.data?.nombre ?? "").trim();
    if (deFicha.length >= 2) nombre = deFicha;
  }
  const lugar = (pedido.lugar ?? abierta?.lugar ?? "").trim();
  const celular = (pedido.celular ?? abierta?.celular ?? "").trim() || null;

  if (!sede) return { mensaje: "¿En cuál sede le queda mejor, Juan Díaz o La Chorrera?" };
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { mensaje: "¿Qué día quiere la cita?" };
  if (fecha < hoyPanama()) return { mensaje: "Ese día ya pasó. Dígame un día de hoy en adelante." };
  if (
    abierta
    && clienteDiceQueNoLlega(opts.textoCliente ?? "")
    && (pedido.hora ?? abierta.hora) === abierta.hora
    && (pedido.fecha ?? abierta.fecha) === abierta.fecha
    && (pedido.sede ?? abierta.sede) === abierta.sede
  ) {
    const nombreSede = sedePorId(abierta.sede)?.nombre ?? "la sede";
    const ventana = ventanaCita(abierta.sede, abierta.fecha);
    const hasta = ventana ? minutosAHora(ventana.hasta) : "12:00";
    return {
      mensaje: `Esa hora no le da. En ${nombreSede} ese día se cita hasta las ${hasta}. ¿Le sirve más temprano, Juan Díaz el domingo de 8 a 12, o un día de semana?`,
    };
  }
  if (!hora) {
    const franja = franjaHoraria(opts.textoCliente ?? "");
    if (franja === "manana") return { mensaje: "Por la mañana le dejo las 8, las 9 o las 10. ¿Cuál le sirve?" };
    if (franja === "tarde") {
      const dia = ventanaCita(sede, fecha);
      if (!dia || dia.hasta <= 12 * 60) {
        return { mensaje: "Ese día se cita hasta las 12:00. ¿Le sirve a las 10 o a las 11, o prefiere un día de semana por la tarde?" };
      }
      return { mensaje: "Por la tarde le dejo la 1, las 2 o las 3. ¿Cuál le sirve?" };
    }
    return { mensaje: "¿A qué hora le queda bien? Puede ser en punto o a la media." };
  }
  const horario = validarHorario(sede, fecha, hora);
  if (horario) return { mensaje: horario };
  const cancelada = await ultimaCitaCancelada(opts.conversacionId);
  if (
    cancelada
    && cancelada.sede === sede
    && cancelada.fecha === fecha
    && cancelada.hora.slice(0, 5) === hora.slice(0, 5)
  ) {
    const nombreSede = sedePorId(sede)?.nombre ?? "la sede";
    return {
      mensaje: `Esa hora ya no le quedaba. En ${nombreSede} ese día se cita dentro del horario. ¿Le sirve más temprano, Juan Díaz el domingo, o un día de semana?`,
    };
  }
  if (nombre.length < 2) return { mensaje: "¿Con qué nombre dejo la cita?" };
  if (lugar.length < 2) return { mensaje: "¿De qué lugar es usted? Con eso le confirmo si la zona está dentro del alcance." };
  if (
    pedidoRepiteCita(abierta, {
      accion: pedido.accion,
      sede,
      fecha,
      hora,
      nombre,
    })
  ) {
    return { mensaje: null, agendo: true };
  }

  const sb = createServerSupabase();
  const hueco = await resolverHorarioLibre(sb, {
    sede,
    fecha,
    hora,
    excludeId: abierta?.id ?? null,
    textoCliente: opts.textoCliente ?? "",
  });
  if (hueco.mensaje && !hueco.hora) return { mensaje: hueco.mensaje };
  const horaFinal = hueco.hora ?? hora;
  const ahora = new Date().toISOString();
  const campos = {
    nombre,
    celular,
    sede,
    fecha,
    hora: horaFinal,
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
  await sb
    .from("conversaciones_comercial")
    .update({
      etapa: "cita",
      nombre: cita.nombre,
      seguimiento_at: null,
      proxima_accion: `Confirmar asistencia el ${cita.fecha}`,
      updated_at: ahora,
    })
    .eq("id", opts.conversacionId);
  await sb
    .from("seguimientos_comercial")
    .update({
      estado: "cancelado",
      motivo_cancelado: "El lead agendó una cita.",
      updated_at: ahora,
    })
    .eq("conversacion_id", opts.conversacionId)
    .eq("estado", "pendiente");
  return {
    agendo: true,
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

export async function confirmarCitaPorLlamada(
  id: string,
  actorId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("citas_comercial")
    .update({ confirmacion: "llamada", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("conversacion_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data?.conversacion_id) {
    await sb.from("eventos_comercial").insert({
      conversacion_id: data.conversacion_id,
      actor_id: actorId ?? null,
      tipo: "cita_confirmada_llamada",
      detalle: { cita_id: id },
    });
  }
  return { ok: true };
}

function textoAviso(cita: CitaComercial, tipo: "24h" | "dia"): string {
  const sede = sedePorId(cita.sede);
  const lugar = `${sede?.nombre ?? "la sede"}. ${sede?.direccion ?? ""} ${sede?.maps ?? ""}`.trim();
  if (tipo === "dia") {
    return `${cita.nombre}, hoy lo esperamos a las ${cita.hora} en ${lugar}`;
  }
  return `${cita.nombre}, le confirmo la cita de mañana ${fechaConDia(cita.fecha)} a las ${cita.hora} en ${lugar}. Responda SÍ para confirmarla. Si no puede, dígame otro día o si desea cancelarla.`;
}

export async function enviarAvisosCitas(): Promise<{ vispera: number; dia: number; fallos: number }> {
  if (!enviosAutomaticos() || modoAgente() !== "on") return { vispera: 0, dia: 0, fallos: 0 };
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

  const ids = [...new Set((data as { conversacion_id?: string | null }[]).map((c) => c.conversacion_id).filter(Boolean))] as string[];
  const entradas = new Map<string, string | null>();
  if (ids.length) {
    const conv = await sb.from("conversaciones_comercial").select("id, ultimo_entrante_at").in("id", ids);
    for (const row of (conv.data ?? []) as { id: string; ultimo_entrante_at: string | null }[]) {
      entradas.set(row.id, row.ultimo_entrante_at);
    }
  }

  let vispera = 0;
  let dia = 0;
  let fallos = 0;
  for (const raw of data as Record<string, unknown>[]) {
    const cita = fila(raw);
    const tipo = avisoCitaPendiente({
      fecha: cita.fecha,
      hora: cita.hora,
      aviso24hAt: (raw.aviso_vispera_at as string | null) ?? null,
      avisoDiaAt: (raw.aviso_dia_at as string | null) ?? null,
    });
    if (!tipo || !numeroEnPiloto(cita.waNumero)) continue;
    const ventanaCerrada = cita.conversacionId
      ? !ventanaAbierta(entradas.get(cita.conversacionId) ?? null)
      : true;
    const toque = raw.updated_at ? new Date(String(raw.updated_at)).getTime() : 0;
    if (ventanaCerrada && raw.aviso_error && Date.now() - toque < 6 * 60 * 60 * 1000) continue;

    const modelo = plantillaCita(tipo, {
      nombre: cita.nombre,
      fechaTexto: fechaConDia(cita.fecha),
      hora: cita.hora,
      sede: sedePorId(cita.sede)?.nombre ?? "la sede",
    });
    const texto = ventanaCerrada ? modelo.texto : textoAviso(cita, tipo);
    let avisoError: string | null = null;
    try {
      if (!phoneId) throw new Error("Falta el número comercial.");
      const json = ventanaCerrada
        ? await sendTemplate(cita.waNumero, modelo.name, "es", modelo.componentes, phoneId)
        : await sendText(cita.waNumero, texto, phoneId);
      if (!ventanaCerrada && tipo === "dia" && phoneId) {
        try {
          await enviarVideoSede(cita.waNumero, cita.sede, phoneId, cita.conversacionId);
        } catch (e) {
          console.error("[citas] video del día:", e instanceof Error ? e.message : e);
        }
      }
      if (cita.conversacionId) {
        const espejo = await sb.from("mensajes_comercial").insert({
          conversacion_id: cita.conversacionId,
          direccion: "out",
          autor: "sistema",
          texto,
          ...(idMensajeEnviado(json) ? { wa_message_id: idMensajeEnviado(json) } : {}),
        });
        if (espejo.error && /autor|wa_message_id|schema cache/i.test(espejo.error.message)) {
          await sb.from("mensajes_comercial").insert({
            conversacion_id: cita.conversacionId,
            direccion: "out",
            texto,
          });
        }
      }
      if (tipo === "dia") dia += 1;
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
          : tipo === "dia"
            ? { aviso_dia_at: new Date().toISOString() }
            : { aviso_vispera_at: new Date().toISOString() }),
        aviso_error: avisoError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cita.id);
  }
  return { vispera, dia, fallos };
}

export async function marcarAsistenciaCita(
  id: string,
  asistencia: "asistio" | "no_asistio" | "cancelada",
  actorId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const sb = createServerSupabase();
  const ahora = new Date().toISOString();
  const patch =
    asistencia === "cancelada"
      ? { estado: "cancelada", updated_at: ahora }
      : { asistencia, updated_at: ahora };
  const { data, error } = await sb
    .from("citas_comercial")
    .update(patch)
    .eq("id", id)
    .select("conversacion_id, nombre, fecha")
    .maybeSingle();
  if (error && /asistencia/i.test(error.message)) {
    return { ok: false, error: "Falta aplicar la migración 0040 para registrar la asistencia." };
  }
  if (error) return { ok: false, error: error.message };
  if (data?.conversacion_id) {
    const manana = new Date(`${sumarDias(hoyPanama(), 1)}T10:00:00-05:00`).toISOString();
    await sb
      .from("conversaciones_comercial")
      .update({
        etapa: asistencia === "asistio" ? "visito" : "conversacion",
        proxima_accion:
          asistencia === "asistio"
            ? "Dar seguimiento a la visita"
            : asistencia === "no_asistio"
              ? "Reagendar: no asistió"
              : "Ofrecer otra fecha",
        seguimiento_at: asistencia === "cancelada" ? null : manana,
        updated_at: ahora,
      })
      .eq("id", data.conversacion_id);
    await sb.from("eventos_comercial").insert({
      conversacion_id: data.conversacion_id,
      actor_id: actorId,
      tipo: `cita_${asistencia}`,
      detalle: { cita_id: id },
    });
  }
  return { ok: true };
}
