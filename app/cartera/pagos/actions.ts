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
import { recalcularRecargo } from "@/lib/cartera/devengo";
import { aplicarPagoEnObligaciones, revertirPagoEnObligaciones, textoComoSeAplico } from "@/lib/cartera/aplicar-pago";
import { avisarPagoConciliado } from "@/lib/cartera/avisar-conciliacion";
import { hoyPanama, pagadoAtDesdeForm, horaPanama, fechaContable, sumarDias } from "@/lib/cartera/fecha";
import { normalizarTelefono } from "@/lib/cartera/telefono";
import { sendText } from "@/lib/whatsapp/client";
import { destinoLibre, destinoPorId, type DestinoInterior } from "@/lib/cartera/salidas-interior";
import { darAvalSalida, etiquetarPagoSalida, idsVehiculoYCliente } from "@/lib/cartera/salidas-aplicar";

function destDesdeForm(formData: FormData, monto: number): DestinoInterior | null {
  const destinoId = String(formData.get("destino_interior") ?? "").trim();
  if (!destinoId) return null;
  if (destinoId === "otro") {
    const nombre = String(formData.get("destino_otro") ?? "").trim();
    if (!nombre) return null;
    return destinoLibre(nombre, monto);
  }
  return destinoPorId(destinoId);
}

function hastaDesdeForm(formData: FormData, fecha: string): string | null {
  const hasta = String(formData.get("fecha_hasta") ?? "").trim();
  if (hasta && hasta >= fecha) return hasta;
  const dias = Number(String(formData.get("dias_viaje") ?? "1"));
  if (Number.isFinite(dias) && dias > 1) return sumarDias(fecha, Math.min(Math.floor(dias), 14) - 1);
  return null;
}

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

  if (nuevoEstado === "rechazado") {
    await revertirPagoEnObligaciones(pagoId);
  }

  const { data: pago, error } = await sb
    .from("pagos")
    .update(patch)
    .eq("id", pagoId)
    .select("contrato_id, pagado_at")
    .maybeSingle();
  if (error) throw new Error(error.message);

  // Mientras el comprobante estuvo pendiente, el recargo de ese día quedó
  // congelado. Ya hay desenlace: si el pago era bueno se confirma la gracia,
  // si era malo entra el recargo que se le perdonó esa noche.
  const p = pago as { contrato_id: string | null; pagado_at: string | null } | null;
  if (p?.contrato_id && p.pagado_at) {
    await recalcularRecargo(p.contrato_id, fechaContable(p.pagado_at));
  }
  if (nuevoEstado === "conciliado") {
    try {
      const aplicado = await aplicarPagoEnObligaciones(pagoId);
      try {
        await avisarPagoConciliado(pagoId, aplicado);
      } catch (e) {
        console.error("[pagos] aviso WA", e);
      }
    } catch (e) {
      console.error("[pagos] waterfall", e);
    }
  }

  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  revalidatePath("/cartera/vehiculos");
  revalidatePath("/cartera/extractos");
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
  const dest = destDesdeForm(formData, Number.isFinite(monto) ? monto : 0);
  const fechaHasta = dest ? hastaDesdeForm(formData, fecha) : null;
  if (String(formData.get("destino_interior") ?? "") === "otro" && !dest) {
    return { ok: false, msg: "Escribe el destino que no está en la tabla." };
  }
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
  const notasOficina = dest
    ? `Pago presencial en oficina — ${metodoLabel}. Salida al interior: ${dest.nombre}.`
    : `Pago presencial en oficina — ${metodoLabel}. Registrado por el equipo.`;
  const basePago = {
    contrato_id: r.contratoId,
    cliente_id: r.clienteId,
    fecha,
    pagado_at: pagadoAt,
    monto,
    metodo,
    numero_carro: carro,
    origen: "manual",
    estado_conciliacion: "manual",
    notas: notasOficina,
  };
  let pagoInsert = (
    await sb
      .from("pagos")
      .insert({
        ...basePago,
        rubro: dest ? "salida_interior" : null,
        destino_interior: dest ? dest.id : null,
      })
      .select("id")
      .single()
  );
  if (pagoInsert.error && /rubro|destino_interior/i.test(pagoInsert.error.message)) {
    pagoInsert = await sb.from("pagos").insert(basePago).select("id").single();
  }
  const error = pagoInsert.error;
  if (error) return { ok: false, msg: error.message };
  const pagoId = (pagoInsert.data as { id: string } | null)?.id;
  if (!pagoId) return { ok: false, msg: "No se pudo crear el pago." };
  if (dest) {
    try {
      await etiquetarPagoSalida(pagoId, dest);
      const { registrarSalidaPendiente } = await import("@/lib/cartera/salidas-aplicar");
      const ids = await idsVehiculoYCliente(r.contratoId as string);
      await registrarSalidaPendiente({
        contratoId: r.contratoId as string,
        vehiculoId: ids.vehiculoId,
        clienteId: r.clienteId,
        pagoId,
        dest,
        monto,
        pagadoAt,
        fechaHasta,
      });
    } catch {
      /* columnas 0019 pueden faltar; ya va en notas */
    }
  }

  // Si pagó en oficina antes de las 7 p.m. pero el equipo lo registró después,
  // el cron ya le habría puesto el recargo. Se recalcula con la hora real.
  await recalcularRecargo(r.contratoId as string, fecha);
  let como = "";
  try {
    const aplicado = await aplicarPagoEnObligaciones(pagoId);
    if (aplicado) como = textoComoSeAplico(aplicado, money);
  } catch (e) {
    console.error("[pagos] waterfall manual", e);
  }

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
        texto: dest
          ? `Pago en oficina de salida a ${dest.nombre}: ${money(monto)} (${metodoLabel}, carro ${carro}). Aval dado.`
          : `Pago en oficina registrado: ${money(monto)} en ${metodoLabel} (Carro ${carro}).${como ? ` ${como}` : ""}`,
      });

      const cierre = dest
        ? `Quedó como salida a ${dest.nombre}, no a la cuota. Ya tiene el aval.`
        : como
          ? `${como} Quedó en el carro ${carro}.`
          : `Quedó en el carro ${carro}.`;
      const texto = nombre
        ? `Listo ${nombre}, recibimos ${money(monto)} en oficina (${metodoLabel}). ${cierre}`
        : `Recibimos ${money(monto)} en oficina (${metodoLabel}). ${cierre}`;

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
  revalidatePath("/cartera/vehiculos");
  revalidatePath("/cartera/extractos");
  revalidatePath("/");

  const base = dest
    ? `Pago de ${money(monto)} a salida ${dest.nombre} en el carro ${carro}. Aval dado.`
    : `Pago de ${money(monto)} registrado en el Carro ${carro} (${metodoLabel}).`;
  return {
    ok: true,
    msg: avisado
      ? `${base} Le avisamos al cliente por WhatsApp. ✅`
      : `${base} No se pudo avisar por WhatsApp (fuera de la ventana de 24h); el equipo puede confirmarle al pasar. ✅`,
  };
}

export async function asignarPagoASalida(formData: FormData): Promise<void> {
  const pagoId = String(formData.get("pago_id") ?? "");
  const montoHint = Number(String(formData.get("monto") ?? "").replace(",", ".")) || 0;
  const dest = destDesdeForm(formData, montoHint);
  if (!pagoId || !dest) throw new Error("Falta el destino de la salida.");
  await etiquetarPagoSalida(pagoId, dest);
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("id, contrato_id, cliente_id, monto, pagado_at, estado_conciliacion")
    .eq("id", pagoId)
    .maybeSingle();
  const p = data as {
    contrato_id: string | null;
    cliente_id: string | null;
    monto: number;
    pagado_at: string;
    estado_conciliacion: string;
  } | null;
  if (p?.contrato_id) {
    const ids = await idsVehiculoYCliente(p.contrato_id);
    const { registrarSalidaPendiente } = await import("@/lib/cartera/salidas-aplicar");
    await registrarSalidaPendiente({
      contratoId: p.contrato_id,
      vehiculoId: ids.vehiculoId,
      clienteId: p.cliente_id,
      pagoId,
      dest,
      monto: Number(p.monto) || dest.monto,
      pagadoAt: p.pagado_at,
      fechaHasta: hastaDesdeForm(formData, fechaContable(p.pagado_at)),
    });
    if (p.estado_conciliacion === "conciliado" || p.estado_conciliacion === "manual") {
      await aplicarPagoEnObligaciones(pagoId);
    }
  }
  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  revalidatePath("/cartera/vehiculos");
  revalidatePath("/cartera/extractos");
}

export async function accionDarAval(formData: FormData): Promise<void> {
  const salidaId = String(formData.get("salida_id") ?? "").replace(/^salida:/, "");
  if (!salidaId) throw new Error("Falta la salida.");
  await darAvalSalida(salidaId, "equipo");
  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  revalidatePath("/cartera/vehiculos");
  revalidatePath("/cartera/extractos");
}
