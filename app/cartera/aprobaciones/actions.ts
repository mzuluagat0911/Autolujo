"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { createClienteConContrato } from "@/app/cartera/clientes/actions";
import {
  armarAltaSolicitud,
  formDataDesdePayload,
  obtenerSolicitudContrato,
  payloadDesdeFormData,
} from "@/lib/cartera/solicitudes-contrato";

export type ResultadoAlta = {
  ok: boolean;
  error?: string;
  msg?: string;
  clienteId?: string;
  solicitudId?: string;
  redirectTo?: string;
};

/** Comercial: guarda la solicitud. No crea cliente ni contrato. */
export async function crearSolicitudContrato(formData: FormData): Promise<ResultadoAlta> {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false, error: "Tenés que iniciar sesión." };
  if (!sesion.modulos.includes("comercial") && !sesion.modulos.includes("cartera")) {
    return { ok: false, error: "No tenés permiso para crear solicitudes." };
  }

  const armado = await armarAltaSolicitud({ formData, solicitanteId: sesion.id });
  if (!armado.ok) return { ok: false, error: armado.error };

  // Sin permiso de cobro: la propuesta de entrega no es pago. No dejes montos
  // "pagados" en el payload o al aprobar se inventa el cobro.
  const nombre = (sesion.nombre ?? "").toLowerCase();
  const puedeCobrar =
    sesion.modulos.includes("cartera")
    || nombre.includes("claudia")
    || nombre.includes("marcela");
  if (!puedeCobrar) {
    const payload = armado.fila.payload as Record<string, string>;
    // Solo deal: abono_en_entrega / extension_en_entrega. Sin montos "pagados".
    delete payload.abono_pagado;
    delete payload.extension_pagado;
    delete payload.panapass_pagado;
    delete payload.domingos_pagado;
    delete payload.prepago_letras;
    delete payload.prepago_domingos;
  }

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("solicitudes_contrato")
    .insert(armado.fila)
    .select("id")
    .single();
  if (error) {
    if (/solicitudes_contrato|schema cache/i.test(error.message)) {
      return { ok: false, error: "Falta aplicar la migración 0057 (solicitudes de contrato)." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/cartera/aprobaciones");
  revalidatePath("/comercial/contrato");
  return {
    ok: true,
    solicitudId: (data as { id: string }).id,
    msg: "Solicitud enviada a cartera. El cliente y el contrato se crean al aprobar.",
    redirectTo: `/comercial/contrato?aviso=${encodeURIComponent("Solicitud enviada a cartera para aprobación.")}`,
  };
}

/** Cartera: actualiza el payload de una solicitud pendiente (modificar antes de aprobar). */
export async function guardarSolicitudContrato(
  solicitudId: string,
  formData: FormData,
): Promise<ResultadoAlta> {
  const sesion = await sesionEquipo();
  if (!sesion?.modulos.includes("cartera")) {
    return { ok: false, error: "Solo cartera puede modificar solicitudes." };
  }
  const id = solicitudId.trim();
  if (!id) return { ok: false, error: "Falta la solicitud." };

  const actual = await obtenerSolicitudContrato(id);
  if (actual.error || !actual.fila) return { ok: false, error: actual.error ?? "No encontré esa solicitud." };
  if (actual.fila.estado !== "pendiente") {
    return { ok: false, error: "Esa solicitud ya no está pendiente." };
  }

  const armado = await armarAltaSolicitud({
    formData,
    solicitanteId: actual.fila.solicitanteId,
    excluirSolicitudId: id,
  });
  if (!armado.ok) return { ok: false, error: armado.error };

  const sb = createServerSupabase();
  const { error } = await sb
    .from("solicitudes_contrato")
    .update({ ...armado.fila, solicitante_id: actual.fila.solicitanteId })
    .eq("id", id)
    .eq("estado", "pendiente");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/cartera/aprobaciones");
  revalidatePath(`/cartera/aprobaciones/${id}`);
  return {
    ok: true,
    solicitudId: id,
    msg: "Solicitud actualizada.",
    redirectTo: `/cartera/aprobaciones/${id}?aviso=${encodeURIComponent("Cambios guardados.")}`,
  };
}

/** Cartera: aprueba (con el form actual o el payload guardado) y crea cliente + contrato. */
export async function aprobarSolicitudContrato(
  solicitudId: string,
  formData?: FormData,
): Promise<ResultadoAlta> {
  const sesion = await sesionEquipo();
  if (!sesion?.modulos.includes("cartera")) {
    return { ok: false, error: "Solo cartera puede aprobar solicitudes." };
  }
  const id = solicitudId.trim();
  if (!id) return { ok: false, error: "Falta la solicitud." };

  const actual = await obtenerSolicitudContrato(id);
  if (actual.error || !actual.fila) return { ok: false, error: actual.error ?? "No encontré esa solicitud." };
  if (actual.fila.estado !== "pendiente") {
    return { ok: false, error: "Esa solicitud ya no está pendiente." };
  }

  let fd = formData ?? formDataDesdePayload(actual.fila.payload);
  if (formData) {
    // Guardar cambios del form junto con la aprobación.
    const armado = await armarAltaSolicitud({
      formData,
      solicitanteId: actual.fila.solicitanteId,
      excluirSolicitudId: id,
    });
    if (!armado.ok) return { ok: false, error: armado.error };
    const sb = createServerSupabase();
    await sb
      .from("solicitudes_contrato")
      .update({ ...armado.fila, solicitante_id: actual.fila.solicitanteId })
      .eq("id", id)
      .eq("estado", "pendiente");
    fd = formData;
  }

  const alta = await createClienteConContrato(fd);
  if (!alta.ok) return { ok: false, error: alta.error ?? "No pude crear el cliente y el contrato." };

  const sb = createServerSupabase();
  const { error } = await sb
    .from("solicitudes_contrato")
    .update({
      estado: "aprobada",
      aprobador_id: sesion.id,
      aprobado_at: new Date().toISOString(),
      cliente_id: alta.clienteId ?? null,
      updated_at: new Date().toISOString(),
      payload: formData ? payloadDesdeFormData(formData) : actual.fila.payload,
    })
    .eq("id", id)
    .eq("estado", "pendiente");
  if (error) {
    return {
      ok: true,
      clienteId: alta.clienteId,
      msg: `${alta.msg ?? "Contrato creado."} (No pude marcar la solicitud como aprobada: ${error.message})`,
      redirectTo: alta.clienteId ? `/cartera/clientes/${alta.clienteId}` : undefined,
    };
  }

  revalidatePath("/cartera/aprobaciones");
  revalidatePath(`/cartera/aprobaciones/${id}`);
  revalidatePath("/comercial/contrato");
  return {
    ok: true,
    clienteId: alta.clienteId,
    solicitudId: id,
    msg: alta.msg ?? "Solicitud aprobada. Cliente y contrato creados.",
    redirectTo: alta.clienteId
      ? `/cartera/clientes/${alta.clienteId}`
      : `/cartera/aprobaciones?aviso=${encodeURIComponent("Solicitud aprobada.")}`,
  };
}

/** Wrapper para el form de detalle: el id va en el FormData. */
export async function aprobarSolicitudDesdeForm(formData: FormData): Promise<ResultadoAlta> {
  const id = String(formData.get("solicitud_id") ?? "").trim();
  return aprobarSolicitudContrato(id, formData);
}

export async function guardarSolicitudDesdeForm(formData: FormData): Promise<ResultadoAlta> {
  const id = String(formData.get("solicitud_id") ?? "").trim();
  return guardarSolicitudContrato(id, formData);
}

export async function rechazarSolicitudContrato(formData: FormData): Promise<ResultadoAlta> {
  const sesion = await sesionEquipo();
  if (!sesion?.modulos.includes("cartera")) {
    return { ok: false, error: "Solo cartera puede rechazar solicitudes." };
  }
  const id = String(formData.get("solicitud_id") ?? "").trim();
  const motivo = String(formData.get("motivo_rechazo") ?? "").trim();
  if (!id) return { ok: false, error: "Falta la solicitud." };
  if (motivo.length < 3) return { ok: false, error: "Escribí por qué se rechaza (mínimo 3 caracteres)." };

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("solicitudes_contrato")
    .update({
      estado: "rechazada",
      motivo_rechazo: motivo,
      aprobador_id: sesion.id,
      aprobado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Esa solicitud ya no está pendiente." };

  revalidatePath("/cartera/aprobaciones");
  revalidatePath(`/cartera/aprobaciones/${id}`);
  return {
    ok: true,
    solicitudId: id,
    msg: "Solicitud rechazada.",
    redirectTo: `/cartera/aprobaciones?aviso=${encodeURIComponent("Solicitud rechazada.")}`,
  };
}
