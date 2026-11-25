"use server";

import { revalidatePath } from "next/cache";
import { sesionEquipo } from "@/lib/equipo/sesion";
import {
  carrosParaAgenda,
  cerrarCitaTaller,
  crearCitaTaller,
  listarCitasTaller,
  marcarAsistenciaCita,
  notasDeCita,
  registrarNotaCita,
  type EstadoCitaTaller,
  type TipoCitaTaller,
} from "@/lib/operaciones/agenda";
import type { SedeTaller } from "@/lib/operaciones/sede-entrega";

async function exigirOperaciones() {
  const sesion = await sesionEquipo();
  if (!sesion) return { ok: false as const, msg: "Tenés que iniciar sesión.", sesion: null };
  if (!sesion.modulos.includes("operaciones") && !sesion.modulos.includes("cartera")) {
    return { ok: false as const, msg: "No tenés permiso de operaciones.", sesion: null };
  }
  return { ok: true as const, msg: "", sesion };
}

export async function cargarAgenda(opts?: {
  desde?: string;
  hasta?: string;
  sucursal?: SedeTaller | "todas";
  estado?: EstadoCitaTaller | "abiertas" | "todas";
}) {
  return listarCitasTaller(opts);
}

export async function cargarCarrosAgenda() {
  return carrosParaAgenda();
}

export async function cargarNotasCita(citaId: string) {
  return notasDeCita(citaId);
}

export async function crearCitaAction(formData: FormData) {
  const gate = await exigirOperaciones();
  if (!gate.ok || !gate.sesion) return { ok: false as const, msg: gate.msg };

  const montoRaw = String(formData.get("monto_cliente") ?? "").trim();
  const r = await crearCitaTaller({
    vehiculoId: String(formData.get("vehiculo_id") ?? ""),
    tipo: String(formData.get("tipo") ?? "") as TipoCitaTaller,
    fecha: String(formData.get("fecha") ?? ""),
    horaTexto: String(formData.get("hora_texto") ?? "") || null,
    sucursal: (String(formData.get("sucursal") ?? "") || null) as SedeTaller | null,
    trabajo: String(formData.get("trabajo") ?? "") || null,
    montoCliente: montoRaw ? Number(montoRaw.replace(",", ".")) : null,
    comentario: String(formData.get("comentario") ?? "") || null,
    creadoPor: gate.sesion.id,
  });
  if (r.ok) revalidatePath("/operaciones/agenda");
  return r;
}

export async function marcarAsistenciaAction(formData: FormData) {
  const gate = await exigirOperaciones();
  if (!gate.ok || !gate.sesion) return { ok: false as const, msg: gate.msg };
  const estado = String(formData.get("estado") ?? "") as "llego" | "no_llego" | "cancelada";
  if (!["llego", "no_llego", "cancelada"].includes(estado)) {
    return { ok: false as const, msg: "Estado inválido." };
  }
  const r = await marcarAsistenciaCita({
    citaId: String(formData.get("cita_id") ?? ""),
    estado,
    comentario: String(formData.get("comentario") ?? "") || null,
    actorId: gate.sesion.id,
  });
  if (r.ok) revalidatePath("/operaciones/agenda");
  return r;
}

export async function cerrarCitaAction(formData: FormData) {
  const gate = await exigirOperaciones();
  if (!gate.ok || !gate.sesion) return { ok: false as const, msg: gate.msg };
  const kmRaw = String(formData.get("km") ?? "").trim();
  const r = await cerrarCitaTaller({
    citaId: String(formData.get("cita_id") ?? ""),
    comentario: String(formData.get("comentario") ?? "") || null,
    km: kmRaw ? Number(kmRaw.replace(",", ".")) : null,
    actorId: gate.sesion.id,
  });
  if (r.ok) {
    revalidatePath("/operaciones/agenda");
    revalidatePath("/operaciones/mantenimiento");
    revalidatePath("/operaciones/hoja-vida");
  }
  return r;
}

export async function notaCitaAction(formData: FormData) {
  const gate = await exigirOperaciones();
  if (!gate.ok || !gate.sesion) return { ok: false as const, msg: gate.msg };
  const r = await registrarNotaCita(
    String(formData.get("cita_id") ?? ""),
    String(formData.get("comentario") ?? ""),
    gate.sesion.id,
  );
  if (r.ok) revalidatePath("/operaciones/agenda");
  return r;
}
