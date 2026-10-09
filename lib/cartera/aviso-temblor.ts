// Aviso único del 10 de octubre de 2026, 8:00 a.m. Panamá.
// Plantilla Meta `aviso_temblor_puesta_al_dia`. Un mensaje por celular.

import { sendTemplate } from "@/lib/whatsapp/client";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "./fecha";
import { normalizarTelefono } from "./telefono";
import { espejarEnChat } from "./pipeline";

export const TEMPLATE_TEMBLOR = "aviso_temblor_puesta_al_dia";
export const FECHA_AVISO_TEMBLOR = "2026-10-10";

export const TEXTO_AVISO_TEMBLOR = `Buen día. 🙏 Esperamos que usted y su familia se encuentren bien después del temblor ocurrido en Panamá.

Entendemos que algunas personas pueden estar atravesando situaciones difíciles. Si ayer no pudo realizar su pago, por favor, infórmenos cómo se pondrá al día con la cuenta pendiente: adicionando $5 diarios a su cuenta habitual o cancelando el saldo pendiente el domingo.

Agradecemos su compromiso y esperamos que todos se encuentren bien. 🙏`;

async function wabaId(): Promise<string | null> {
  const directo = process.env.WHATSAPP_WABA_ID?.trim();
  if (directo) return directo;
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return null;
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}?fields=whatsapp_business_account`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { whatsapp_business_account?: { id?: string } };
  return json.whatsapp_business_account?.id ?? null;
}

async function plantillaAprobada(): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const waba = await wabaId();
  if (!token || !waba) return false;
  const url = new URL(`https://graph.facebook.com/v21.0/${waba}/message_templates`);
  url.searchParams.set("name", TEMPLATE_TEMBLOR);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return false;
  const json = (await res.json()) as { data?: { name?: string; status?: string }[] };
  return (json.data ?? []).some((t) => t.name === TEMPLATE_TEMBLOR && t.status === "APPROVED");
}

async function numeros(): Promise<string[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("contratos")
    .select("cliente:clientes(whatsapp)")
    .eq("estado", "activo");
  if (error) throw new Error(error.message);
  const vistos = new Set<string>();
  for (const row of (data ?? []) as { cliente: { whatsapp: string | null } | { whatsapp: string | null }[] | null }[]) {
    const cliente = Array.isArray(row.cliente) ? row.cliente[0] : row.cliente;
    const tel = normalizarTelefono(cliente?.whatsapp ?? "");
    if (tel) vistos.add(tel);
  }
  return [...vistos];
}

async function yaRecibieron(): Promise<Set<string>> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("mensajes")
    .select("conversacion:conversaciones(wa_numero)")
    .eq("direccion", "out")
    .ilike("texto", "%temblor ocurrido en Panamá%")
    .gte("created_at", `${FECHA_AVISO_TEMBLOR}T05:00:00.000Z`);
  const out = new Set<string>();
  for (const row of (data ?? []) as {
    conversacion: { wa_numero: string | null } | { wa_numero: string | null }[] | null;
  }[]) {
    const conv = Array.isArray(row.conversacion) ? row.conversacion[0] : row.conversacion;
    const tel = normalizarTelefono(conv?.wa_numero ?? "");
    if (tel) out.add(tel);
  }
  return out;
}

export async function enviarAvisoTemblor(): Promise<{
  enviado: boolean;
  motivo?: string;
  total: number;
  enviados: number;
  fallidos: number;
  yaEstaban: number;
}> {
  if (hoyPanama() !== FECHA_AVISO_TEMBLOR) {
    return { enviado: false, motivo: "Este aviso solo sale el 10 de octubre de 2026.", total: 0, enviados: 0, fallidos: 0, yaEstaban: 0 };
  }
  if (!(await plantillaAprobada())) {
    return {
      enviado: false,
      motivo: "La plantilla aviso_temblor_puesta_al_dia todavía no está aprobada en Meta.",
      total: 0,
      enviados: 0,
      fallidos: 0,
      yaEstaban: 0,
    };
  }
  const todos = await numeros();
  const previos = await yaRecibieron();
  const pendientes = todos.filter((n) => !previos.has(n));
  let enviados = 0;
  let fallidos = 0;
  const TANDA = 10;
  for (let i = 0; i < pendientes.length; i += TANDA) {
    const tanda = pendientes.slice(i, i + TANDA);
    const res = await Promise.allSettled(
      tanda.map(async (tel) => {
        await sendTemplate(tel, TEMPLATE_TEMBLOR, "es");
        await espejarEnChat(tel, TEXTO_AVISO_TEMBLOR, "sistema");
      }),
    );
    for (const r of res) {
      if (r.status === "fulfilled") enviados++;
      else fallidos++;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { enviado: true, total: todos.length, enviados, fallidos, yaEstaban: previos.size };
}
