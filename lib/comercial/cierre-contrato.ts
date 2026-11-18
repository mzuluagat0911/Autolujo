import { normalizarTelefono } from "@/lib/cartera/telefono";
import { createServerSupabase } from "@/lib/supabase/server";
import { cancelarSeguimientosComercial, registrarEventoComercial } from "./chats";

/** Si ese WhatsApp ya escribió al comercial, el chat queda como contrato. */
export async function marcarGanadoSiVinoPorChat(wa: string | null | undefined): Promise<boolean> {
  const canon = normalizarTelefono(wa);
  if (!canon) return false;
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("conversaciones_comercial")
    .select("id, etapa")
    .eq("wa_numero", canon)
    .maybeSingle();
  if (error || !data || data.etapa === "ganado") return false;
  const ahora = new Date().toISOString();
  const guardado = await sb
    .from("conversaciones_comercial")
    .update({
      etapa: "ganado",
      resultado: "Contrato",
      cerrado_at: ahora,
      seguimiento_at: null,
      updated_at: ahora,
    })
    .eq("id", data.id);
  if (guardado.error) return false;
  await cancelarSeguimientosComercial(data.id, "Se hizo el contrato.");
  await registrarEventoComercial(data.id, "contrato", null, { resultado: "Contrato" });
  return true;
}

/** Los contratos recientes que coinciden con un chat de ventas cuentan como ganados. */
export async function cuadrarGanadosConContratos(): Promise<void> {
  const sb = createServerSupabase();
  const desde = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("contratos")
    .select("cliente:clientes(whatsapp, telefono)")
    .gte("created_at", desde)
    .limit(400);
  if (error || !data) return;
  const numeros = new Set<string>();
  for (const row of data as {
    cliente:
      | { whatsapp?: string | null; telefono?: string | null }
      | { whatsapp?: string | null; telefono?: string | null }[]
      | null;
  }[]) {
    const cliente = Array.isArray(row.cliente) ? row.cliente[0] : row.cliente;
    const wa = normalizarTelefono(cliente?.whatsapp) ?? normalizarTelefono(cliente?.telefono);
    if (wa) numeros.add(wa);
  }
  const lista = [...numeros];
  for (let i = 0; i < lista.length; i += 80) {
    const chunk = lista.slice(i, i + 80);
    const chats = await sb
      .from("conversaciones_comercial")
      .select("wa_numero, etapa")
      .in("wa_numero", chunk)
      .neq("etapa", "ganado");
    if (chats.error) continue;
    for (const chat of chats.data ?? []) {
      await marcarGanadoSiVinoPorChat(String(chat.wa_numero ?? ""));
    }
  }
}
