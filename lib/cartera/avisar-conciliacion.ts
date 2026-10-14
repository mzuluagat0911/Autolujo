// Aviso al cliente cuando su pago queda VALIDADO Y RECIBIDO (conciliado contra
// el extracto del banco, o por el botón humano).
//
// Filosofía antifraude: al RECIBIR el comprobante nunca se confirma nada ("está
// en validación con el banco"). ESTE aviso es el único que dice "recibido", y
// solo se dispara cuando el pago ya está conciliado de verdad.
//
// Entrega: como la conciliación suele pasar horas/días después (cuando se sube
// el extracto), la ventana de 24h casi siempre está cerrada → se usa un TEMPLATE
// aprobado (`pago_confirmado`). Si la ventana está abierta, basta texto libre.
// Idempotente: no avisa dos veces el mismo pago.

import { createServerSupabase } from "@/lib/supabase/server";
import { sendText, sendTemplate } from "@/lib/whatsapp/client";
import { money } from "./estado-cuenta";
import type { ResultadoPago } from "./types";
import { normalizarTelefono } from "./telefono";
import { obtenerConversacion, registrarMensaje, ventanaAbierta } from "./pipeline";
import { envioPausadoContrato } from "./envio-pausa";

const TEMPLATE_CONFIRMACION = "pago_confirmado";

/** El título viejo del chat no es un número de carro. */
export function numeroCarroAviso(numero: string | null | undefined): string | null {
  const t = String(numero ?? "")
    .replace(/\s*\(número anterior\)\s*/gi, "")
    .replace(/^carro\s+/i, "")
    .trim();
  return t || null;
}

function componentesConfirmacion(nombre: string, monto: string, carro: string) {
  return [
    { type: "body", parameters: [nombre, monto, carro].map((t) => ({ type: "text", text: t })) },
  ];
}

/** ¿Ya le avisamos de este pago? Defensivo: si la columna no está migrada, no bloquea. */
async function yaAvisado(
  sb: ReturnType<typeof createServerSupabase>,
  pagoId: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from("pagos")
    .select("confirmado_notificado_at")
    .eq("id", pagoId)
    .maybeSingle();
  if (error) return false;
  return Boolean((data as { confirmado_notificado_at?: string | null } | null)?.confirmado_notificado_at);
}

async function marcarAvisado(sb: ReturnType<typeof createServerSupabase>, pagoId: string) {
  const { error } = await sb
    .from("pagos")
    .update({ confirmado_notificado_at: new Date().toISOString() })
    .eq("id", pagoId);
  if (error) console.error("[avisar-conciliacion] no pude marcar avisado:", error.message);
}

export async function avisarPagoConciliado(
  pagoId: string,
  _aplicado?: ResultadoPago | null,
): Promise<boolean> {
  const sb = createServerSupabase();

  if (await yaAvisado(sb, pagoId)) return false;

  const { data } = await sb
    .from("pagos")
    .select(
      "id, monto, numero_carro, contrato_id, cliente_id, estado_conciliacion, cliente:clientes(nombre, whatsapp, telefono)",
    )
    .eq("id", pagoId)
    .maybeSingle();

  type Persona = { nombre?: string; whatsapp?: string | null; telefono?: string | null };
  const pago = data as {
    monto: number;
    numero_carro: string | null;
    contrato_id: string | null;
    estado_conciliacion: string;
    cliente: Persona | null;
  } | null;

  if (!pago || pago.estado_conciliacion !== "conciliado") return false;
  if (await envioPausadoContrato(pago.contrato_id)) return false;

  // El aviso sale al dueño de la cuenta, no a la persona que quedó pegada en el
  // pago. Un chat cruzado guardaba a Edgar en un pago del G30 y el mensaje
  // se iba al otro teléfono.
  let cliente: Persona | null = null;
  let numeroCuenta: string | null = null;
  if (pago.contrato_id) {
    const { data: c } = await sb
      .from("contratos")
      .select("cliente:clientes(nombre, whatsapp, telefono), vehiculo:vehiculos(numero)")
      .eq("id", pago.contrato_id)
      .maybeSingle();
    const row = c as { cliente?: Persona | null; vehiculo?: { numero?: string | null } | null } | null;
    cliente = row?.cliente ?? null;
    numeroCuenta = row?.vehiculo?.numero ?? null;
  }
  if (!cliente) cliente = pago.cliente;

  const waNumero = normalizarTelefono(cliente?.whatsapp ?? cliente?.telefono);
  if (!waNumero) return false;

  const nombre = cliente?.nombre?.split(" ")[0] ?? "";
  const montoTxt = money(Number(pago.monto));
  const carroAviso = numeroCuenta || numeroCarroAviso(pago.numero_carro);
  const carroTxt = carroAviso ? `carro ${carroAviso}` : "su cuenta";
  // Trato de usted, directo, y con las palabras que pidió el negocio: "validado y recibido".
  const texto = nombre
    ? `${nombre}, confirmamos que su pago de ${montoTxt} (${carroTxt}) ya fue validado y recibido. Gracias.`
    : `Confirmamos que su pago de ${montoTxt} (${carroTxt}) ya fue validado y recibido. Gracias.`;

  try {
    const conv = await obtenerConversacion(waNumero);
    await registrarMensaje({
      conversacionId: conv.id,
      direccion: "out",
      tipo: "system",
      texto: `Pago validado y recibido: ${montoTxt} (${carroTxt}).`,
    });

    const { data: vent } = await sb
      .from("conversaciones")
      .select("ultimo_entrante_at")
      .eq("id", conv.id)
      .maybeSingle();
    const ultimo = (vent as { ultimo_entrante_at?: string | null } | null)?.ultimo_entrante_at ?? null;

    let enviado = false;
    if (ventanaAbierta(ultimo)) {
      // Ventana abierta: texto libre (natural, sin costo de template).
      await sendText(waNumero, texto);
      enviado = true;
    } else {
      // Ventana cerrada (lo normal al conciliar): template aprobado.
      try {
        await sendTemplate(
          waNumero,
          TEMPLATE_CONFIRMACION,
          "es",
          componentesConfirmacion(nombre || "cliente", montoTxt, carroTxt),
        );
        enviado = true;
      } catch (err) {
        // El template aún no está aprobado en Meta: se registra pero no truena.
        console.error("[avisar-conciliacion] template no disponible:", err instanceof Error ? err.message : err);
      }
    }

    if (enviado) {
      await registrarMensaje({ conversacionId: conv.id, direccion: "out", tipo: "text", texto });
      await marcarAvisado(sb, pagoId);
    }
    return enviado;
  } catch (e) {
    console.error("[avisar-conciliacion]", e);
    return false;
  }
}
