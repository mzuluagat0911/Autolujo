"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  resolverContratoPorCarro,
  obtenerConversacion,
  registrarMensaje,
  ventanaAbierta,
} from "@/lib/cartera/pipeline";
import { money } from "@/lib/cartera/estado-cuenta";
import { hoyPanama, pagadoAtDesdeForm, horaPanama } from "@/lib/cartera/fecha";
import { normalizarTelefono } from "@/lib/cartera/telefono";
import { sendText } from "@/lib/whatsapp/client";

/**
 * Resuelve un pago de la cola de conciliación.
 * - conciliar: lo marca aplicado (opcionalmente a un contrato).
 * - rechazar: lo descarta (ej. comprobante inválido o duplicado).
 */
export async function resolverPago(formData: FormData): Promise<void> {
  const pagoId = String(formData.get("pago_id") ?? "");
  const accion = String(formData.get("accion") ?? "");
  const contratoId = String(formData.get("contrato_id") ?? "").trim() || null;
  if (!pagoId) throw new Error("Falta el pago.");

  const nuevoEstado =
    accion === "conciliar" ? "conciliado" : accion === "rechazar" ? "rechazado" : null;
  if (!nuevoEstado) throw new Error("Acción inválida.");

  const sb = createServerSupabase();
  const patch: Record<string, unknown> = { estado_conciliacion: nuevoEstado };
  if (contratoId) patch.contrato_id = contratoId;

  const { error } = await sb.from("pagos").update(patch).eq("id", pagoId);
  if (error) throw new Error(error.message);

  revalidatePath("/cartera/pagos");
  revalidatePath("/");
}

export type ResultadoPagoManual = { ok: boolean; msg: string };

/**
 * Registra un pago PRESENCIAL hecho en la oficina (efectivo o datáfono).
 * El pago se ancla al CARRO (que resuelve el contrato activo), queda como
 * `manual` (ya cuenta en el saldo), el agente se entera internamente y, si la
 * ventana de WhatsApp está abierta, se le avisa al cliente que ya se recibió.
 */
export async function registrarPagoManual(
  _prev: ResultadoPagoManual | null,
  formData: FormData,
): Promise<ResultadoPagoManual> {
  const carro = String(formData.get("carro") ?? "").trim();
  const montoRaw = String(formData.get("monto") ?? "").replace(",", ".").trim();
  const metodo = String(formData.get("metodo") ?? "").trim(); // "efectivo" | "tarjeta"
  const fecha = String(formData.get("fecha") ?? "").trim() || hoyPanama();
  const hora = String(formData.get("hora") ?? "").trim() || horaPanama();
  const pagadoAt = pagadoAtDesdeForm(fecha, hora);

  const monto = Number(montoRaw);
  if (!carro) return { ok: false, msg: "Escribe el número de carro." };
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, msg: "El monto no es válido." };
  if (metodo !== "efectivo" && metodo !== "tarjeta")
    return { ok: false, msg: "Elige el método (efectivo o tarjeta)." };

  const sb = createServerSupabase();

  // 1) Carro → contrato activo.
  const r = await resolverContratoPorCarro(carro);
  if (r.estado === "sin_carro") return { ok: false, msg: `No encontré el carro ${carro}.` };
  if (r.estado === "sin_contrato") return { ok: false, msg: `El carro ${carro} no tiene un contrato activo.` };
  if (r.estado === "ambiguo") return { ok: false, msg: `El carro ${carro} tiene varios contratos activos; revísalo a mano.` };

  // 2) Datos del cliente (para avisarle y para el panel).
  const { data: contrato } = await sb
    .from("contratos")
    .select("cliente:clientes(nombre, whatsapp, telefono), vehiculo:vehiculos(numero)")
    .eq("id", r.contratoId as string)
    .maybeSingle();
  const cliente = (contrato as { cliente?: { nombre?: string; whatsapp?: string | null; telefono?: string | null } } | null)?.cliente;
  const nombre = cliente?.nombre?.split(" ")[0] ?? "";
  // Canónico 507XXXXXXXX: si no, se abriría una conversación paralela a la real.
  const waNumero = normalizarTelefono(cliente?.whatsapp ?? cliente?.telefono);

  // 3) Registrar el pago (manual → ya cuenta en el saldo, sin conciliar).
  const metodoLabel = metodo === "efectivo" ? "efectivo" : "tarjeta (datáfono)";
  const { error } = await sb.from("pagos").insert({
    contrato_id: r.contratoId,
    cliente_id: r.clienteId,
    fecha,
    pagado_at: pagadoAt,
    monto,
    metodo,
    numero_carro: carro,
    origen: "manual",
    estado_conciliacion: "manual",
    notas: `Pago presencial en oficina — ${metodoLabel}. Registrado por el equipo.`,
  });
  if (error) return { ok: false, msg: error.message };

  // 4) Que el agente quede enterado + avisar al cliente si se puede.
  let avisado = false;
  if (waNumero) {
    try {
      const conv = await obtenerConversacion(waNumero);
      // Nota interna: el agente ve que este cliente ya pagó en oficina hoy.
      await registrarMensaje({
        conversacionId: conv.id,
        direccion: "out",
        tipo: "system",
        texto: `Pago en oficina registrado: ${money(monto)} en ${metodoLabel} (Carro ${carro}).`,
      });

      const texto = nombre
        ? `¡Listo, ${nombre}! Recibimos tu pago de ${money(monto)} en la oficina (${metodoLabel}). Ya quedó registrado en tu cuenta del Carro ${carro}. ¡Gracias! 🙌`
        : `Recibimos tu pago de ${money(monto)} en la oficina (${metodoLabel}). Ya quedó registrado en tu cuenta del Carro ${carro}. ¡Gracias! 🙌`;

      const { data: vent } = await sb
        .from("conversaciones")
        .select("ultimo_entrante_at")
        .eq("id", conv.id)
        .maybeSingle();
      const ultimoEntrante = (vent as { ultimo_entrante_at?: string | null } | null)?.ultimo_entrante_at ?? null;

      if (ventanaAbierta(ultimoEntrante)) {
        await sendText(waNumero, texto);
        await registrarMensaje({ conversacionId: conv.id, direccion: "out", tipo: "text", texto });
        avisado = true;
      }
    } catch {
      // El pago ya quedó registrado; el aviso es best-effort en el piloto.
    }
  }

  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  revalidatePath("/");

  const base = `Pago de ${money(monto)} registrado en el Carro ${carro} (${metodoLabel}).`;
  return {
    ok: true,
    msg: avisado
      ? `${base} Le avisamos al cliente por WhatsApp. ✅`
      : `${base} No se pudo avisar por WhatsApp (fuera de la ventana de 24h); el equipo puede confirmarle al pasar. ✅`,
  };
}
