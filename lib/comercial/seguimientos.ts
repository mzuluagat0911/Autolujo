import { ventanaAbierta } from "@/lib/cartera/pipeline";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendTemplate, sendText } from "@/lib/whatsapp/client";
import { idMensajeEnviado } from "./entrega";
import { enviosAutomaticos, modoAgente, numeroEnPiloto } from "./piloto";
import { plantillaAunNoLista, plantillaSeguimiento } from "./plantillas";
import { INTENTO_ARCHIVO, textoSeguimientoLead } from "./lead";
import {
  archivarLeadSinRespuesta,
  programarSiguienteSeguimiento,
  registrarSalidaComercial,
  type TemperaturaLead,
} from "./chats";

type Seguimiento = {
  id: string;
  conversacion_id: string;
  intento: number;
};

type ConversacionSeguimiento = {
  id: string;
  wa_numero: string;
  nombre: string | null;
  proxima_accion: string | null;
  etapa: string | null;
  temperatura: TemperaturaLead;
  ultimo_entrante_at: string | null;
  modo_atencion: string;
  cerrado_at: string | null;
};

const ETAPA_SIN_SEGUIMIENTO = new Set(["cita", "visito", "ganado", "perdido"]);

export async function ejecutarSeguimientosComercial(): Promise<{
  enviados: number;
  cancelados: number;
  archivados: number;
  fallidos: number;
  pausado?: boolean;
}> {
  if (!enviosAutomaticos() || modoAgente() !== "on") {
    return { enviados: 0, cancelados: 0, archivados: 0, fallidos: 0, pausado: true };
  }
  const sb = createServerSupabase();
  const ahora = new Date().toISOString();
  const { data, error } = await sb
    .from("seguimientos_comercial")
    .select("id, conversacion_id, intento")
    .eq("estado", "pendiente")
    .lte("programado_at", ahora)
    .order("programado_at", { ascending: true })
    .limit(25);
  if (error || !data?.length) return { enviados: 0, cancelados: 0, archivados: 0, fallidos: error ? 1 : 0 };

  const seguimientos = data as Seguimiento[];
  const ids = [...new Set(seguimientos.map((s) => s.conversacion_id))];
  const { data: conversaciones } = await sb
    .from("conversaciones_comercial")
    .select("id, wa_numero, nombre, proxima_accion, etapa, temperatura, ultimo_entrante_at, modo_atencion, cerrado_at")
    .in("id", ids);
  const porId = new Map(
    ((conversaciones ?? []) as ConversacionSeguimiento[]).map((c) => [c.id, c]),
  );

  let enviados = 0;
  let cancelados = 0;
  let archivados = 0;
  let fallidos = 0;
  const conCita = new Set<string>();
  if (ids.length > 0) {
    const abiertas = await sb
      .from("citas_comercial")
      .select("conversacion_id")
      .in("conversacion_id", ids)
      .eq("estado", "programada");
    if (!abiertas.error) {
      for (const row of (abiertas.data ?? []) as { conversacion_id: string | null }[]) {
        if (row.conversacion_id) conCita.add(row.conversacion_id);
      }
    }
  }
  const phoneId = process.env.WHATSAPP_COMERCIAL_PHONE_NUMBER_ID;

  for (const seguimiento of seguimientos) {
    const c = porId.get(seguimiento.conversacion_id);
    if (c && !numeroEnPiloto(c.wa_numero)) continue;
    const sinSeguimiento =
      ETAPA_SIN_SEGUIMIENTO.has(c?.etapa ?? "") || conCita.has(seguimiento.conversacion_id);
    if (!c || c.modo_atencion === "humano" || c.cerrado_at || sinSeguimiento || seguimiento.intento > INTENTO_ARCHIVO) {
      await sb
        .from("seguimientos_comercial")
        .update({
          estado: "cancelado",
          motivo_cancelado: "El lead ya no admite seguimiento automático.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", seguimiento.id)
        .eq("estado", "pendiente");
      if (c) {
        await sb
          .from("conversaciones_comercial")
          .update({ seguimiento_at: null, updated_at: new Date().toISOString() })
          .eq("id", c.id);
      }
      cancelados += 1;
      continue;
    }

    const reclamado = await sb
      .from("seguimientos_comercial")
      .update({ estado: "enviando", updated_at: new Date().toISOString() })
      .eq("id", seguimiento.id)
      .eq("estado", "pendiente")
      .select("id")
      .maybeSingle();
    if (!reclamado.data) continue;

    if (seguimiento.intento === INTENTO_ARCHIVO) {
      await archivarLeadSinRespuesta(c.id);
      await sb
        .from("seguimientos_comercial")
        .update({
          estado: "cancelado",
          motivo_cancelado: "Se archivó el chat: no respondió.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", seguimiento.id);
      archivados += 1;
      continue;
    }

    const textoLibre = textoSeguimientoLead({
      nombre: c.nombre,
      proximaAccion: c.proxima_accion,
      intento: seguimiento.intento,
    });
    const plantilla = plantillaSeguimiento(c.nombre, seguimiento.intento);
    const texto = ventanaAbierta(c.ultimo_entrante_at) ? textoLibre : plantilla.texto;
    try {
      if (!phoneId) throw new Error("Falta WHATSAPP_COMERCIAL_PHONE_NUMBER_ID.");
      const json = ventanaAbierta(c.ultimo_entrante_at)
        ? await sendText(c.wa_numero, texto, phoneId)
        : await sendTemplate(c.wa_numero, plantilla.name, "es", plantilla.componentes, phoneId);
      await registrarSalidaComercial(c.id, texto, { waMessageId: idMensajeEnviado(json) });
      await sb
        .from("seguimientos_comercial")
        .update({
          estado: "enviado",
          texto,
          enviado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", seguimiento.id);
      await sb
        .from("conversaciones_comercial")
        .update({
          intentos_seguimiento: seguimiento.intento,
          ultimo_seguimiento_at: new Date().toISOString(),
          seguimiento_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      enviados += 1;
      if (seguimiento.intento < INTENTO_ARCHIVO) {
        await programarSiguienteSeguimiento(c.id, c.temperatura);
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo enviar.";
      if (!ventanaAbierta(c.ultimo_entrante_at) && plantillaAunNoLista(mensaje)) {
        await sb
          .from("seguimientos_comercial")
          .update({
            estado: "pendiente",
            error: mensaje.slice(0, 1000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", seguimiento.id);
        continue;
      }
      await sb
        .from("seguimientos_comercial")
        .update({
          estado: "fallido",
          error: mensaje.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", seguimiento.id);
      await sb
        .from("conversaciones_comercial")
        .update({ seguimiento_at: null, updated_at: new Date().toISOString() })
        .eq("id", c.id);
      fallidos += 1;
    }
  }

  return { enviados, cancelados, archivados, fallidos };
}
