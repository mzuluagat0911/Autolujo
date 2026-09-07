// Aviso al cliente cuando un pago queda conciliado (extracto o botón humano).
// Best-effort: si no hay WhatsApp o la ventana de 24h está cerrada, no falla.

import { createServerSupabase } from "@/lib/supabase/server";
import { sendText } from "@/lib/whatsapp/client";
import { money } from "./estado-cuenta";
import { textoComoSeAplico } from "./aplicar-pago";
import type { ResultadoPago } from "./types";
import { normalizarTelefono } from "./telefono";
import {
  obtenerConversacion,
  registrarMensaje,
  ventanaAbierta,
} from "./pipeline";

export async function avisarPagoConciliado(
  pagoId: string,
  aplicado?: ResultadoPago | null,
): Promise<boolean> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select(
      "id, monto, numero_carro, contrato_id, cliente_id, origen, estado_conciliacion, cliente:clientes(nombre, whatsapp, telefono)",
    )
    .eq("id", pagoId)
    .maybeSingle();

  const pago = data as {
    monto: number;
    numero_carro: string | null;
    contrato_id: string | null;
    origen: string | null;
    estado_conciliacion: string;
    cliente: { nombre?: string; whatsapp?: string | null; telefono?: string | null } | null;
  } | null;

  if (!pago || pago.estado_conciliacion !== "conciliado") return false;

  let cliente = pago.cliente;
  if (!cliente && pago.contrato_id) {
    const { data: c } = await sb
      .from("contratos")
      .select("cliente:clientes(nombre, whatsapp, telefono)")
      .eq("id", pago.contrato_id)
      .maybeSingle();
    cliente =
      (c as { cliente?: typeof cliente } | null)?.cliente ?? null;
  }

  const waNumero = normalizarTelefono(cliente?.whatsapp ?? cliente?.telefono);
  if (!waNumero) return false;

  const nombre = cliente?.nombre?.split(" ")[0] ?? "";
  const carro = pago.numero_carro ? ` carro ${pago.numero_carro}` : "";
  const como = aplicado ? ` ${textoComoSeAplico(aplicado, money)}` : "";
  const texto = nombre
    ? `Listo ${nombre}, confirmamos tu pago de ${money(Number(pago.monto))}${carro}.${como} Ya quedó conciliado con el banco.`
    : `Confirmamos tu pago de ${money(Number(pago.monto))}${carro}.${como} Ya quedó conciliado con el banco.`;

  try {
    const conv = await obtenerConversacion(waNumero);
    await registrarMensaje({
      conversacionId: conv.id,
      direccion: "out",
      tipo: "system",
      texto: `Pago conciliado: ${money(Number(pago.monto))}${carro}.${como}`,
    });

    const { data: vent } = await sb
      .from("conversaciones")
      .select("ultimo_entrante_at")
      .eq("id", conv.id)
      .maybeSingle();
    const ultimo =
      (vent as { ultimo_entrante_at?: string | null } | null)?.ultimo_entrante_at ?? null;

    if (!ventanaAbierta(ultimo)) return false;

    await sendText(waNumero, texto);
    await registrarMensaje({
      conversacionId: conv.id,
      direccion: "out",
      tipo: "text",
      texto,
    });
    return true;
  } catch (e) {
    console.error("[avisar-conciliacion]", e);
    return false;
  }
}
