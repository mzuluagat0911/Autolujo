import { ventanaAbierta } from "@/lib/cartera/pipeline";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendTemplate, sendText } from "@/lib/whatsapp/client";
import { idMensajeEnviado } from "./entrega";
import { enviosAutomaticos, modoAgente, numeroEnPiloto } from "./piloto";
import { plantillaSeguimiento } from "./plantillas";
import {
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
  interes: string | null;
  temperatura: TemperaturaLead;
  ultimo_entrante_at: string | null;
  modo_atencion: string;
  cerrado_at: string | null;
};

function textoSeguimiento(c: ConversacionSeguimiento, intento: number): string {
  const nombre = c.nombre?.trim();
  const saludo = nombre ? `Hola, ${nombre}.` : "Hola.";
  const interes = c.interes ? ` sobre ${c.interes}` : "";
  if (c.temperatura === "caliente" && intento === 1) {
    return `${saludo} Le escribo para continuar${interes}. ¿Quiere que le deje una cita en Juan Díaz o La Chorrera?`;
  }
  if (intento >= 3) {
    return `${saludo} Quedo pendiente por si todavía desea avanzar${interes}. Si quiere, le ayudo a dejar una cita.`;
  }
  return `${saludo} Le doy seguimiento${interes}. ¿Todavía desea que le ayude a avanzar?`;
}

export async function ejecutarSeguimientosComercial(): Promise<{
  enviados: number;
  cancelados: number;
  fallidos: number;
  pausado?: boolean;
}> {
  if (!enviosAutomaticos() || modoAgente() !== "on") {
    return { enviados: 0, cancelados: 0, fallidos: 0, pausado: true };
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
  if (error || !data?.length) return { enviados: 0, cancelados: 0, fallidos: error ? 1 : 0 };

  const seguimientos = data as Seguimiento[];
  const ids = [...new Set(seguimientos.map((s) => s.conversacion_id))];
  const { data: conversaciones } = await sb
    .from("conversaciones_comercial")
    .select("id, wa_numero, nombre, interes, temperatura, ultimo_entrante_at, modo_atencion, cerrado_at")
    .in("id", ids);
  const porId = new Map(
    ((conversaciones ?? []) as ConversacionSeguimiento[]).map((c) => [c.id, c]),
  );

  let enviados = 0;
  let cancelados = 0;
  let fallidos = 0;
  const phoneId = process.env.WHATSAPP_COMERCIAL_PHONE_NUMBER_ID;

  for (const seguimiento of seguimientos) {
    const c = porId.get(seguimiento.conversacion_id);
    if (c && !numeroEnPiloto(c.wa_numero)) continue;
    if (!c || c.modo_atencion === "humano" || c.cerrado_at || seguimiento.intento > 3) {
      await sb
        .from("seguimientos_comercial")
        .update({
          estado: "cancelado",
          motivo_cancelado: "El lead ya no admite seguimiento automático.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", seguimiento.id)
        .eq("estado", "pendiente");
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

    const textoLibre = textoSeguimiento(c, seguimiento.intento);
    const plantilla = plantillaSeguimiento(c.nombre, c.interes);
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
      if (seguimiento.intento < 3) {
        await programarSiguienteSeguimiento(c.id, c.temperatura);
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo enviar.";
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

  return { enviados, cancelados, fallidos };
}
