"use server";

import { revalidatePath } from "next/cache";
import { sesionEquipo } from "@/lib/equipo/sesion";
import {
  carrosParaAgenda,
  crearCitaTaller,
  listarCitasTaller,
  marcarAsistenciaCita,
  notasDeCita,
  registrarNotaCita,
  type EstadoCitaTaller,
  type TipoCitaTaller,
} from "@/lib/operaciones/agenda";
import type { SedeTaller } from "@/lib/operaciones/sede-entrega";
import {
  FOTOS_MINIMAS,
  guardarRegistroTaller,
  listarRegistrosDelDia,
  subirFotosRegistro,
} from "@/lib/operaciones/registro-taller";
import { createServerSupabase } from "@/lib/supabase/server";

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

export async function cargarAtendidosHoy() {
  return listarRegistrosDelDia();
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

function num(fd: FormData, key: string): number | null {
  const raw = String(fd.get(key) ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function cerrarCitaAction(formData: FormData) {
  const gate = await exigirOperaciones();
  if (!gate.ok || !gate.sesion) return { ok: false as const, msg: gate.msg };

  const citaId = String(formData.get("cita_id") ?? "").trim();
  if (!citaId) return { ok: false as const, msg: "Falta la cita." };

  const sb = createServerSupabase();
  const { data: cita, error } = await sb
    .from("citas_taller")
    .select("id, vehiculo_id, cliente_id, tipo, fecha, sucursal, estado")
    .eq("id", citaId)
    .maybeSingle();
  if (error || !cita) return { ok: false as const, msg: error?.message ?? "No encontré la cita." };
  const c = cita as {
    id: string;
    vehiculo_id: string;
    cliente_id: string | null;
    tipo: TipoCitaTaller;
    fecha: string;
    sucursal: SedeTaller;
    estado: string;
  };
  if (c.estado === "hecha") return { ok: false as const, msg: "Esa cita ya estaba hecha." };

  const files = formData.getAll("fotos").filter((x): x is File => x instanceof File && x.size > 0);
  const stickerIdx = Number(String(formData.get("sticker_idx") ?? "-1"));
  if (files.length < FOTOS_MINIMAS) {
    return { ok: false as const, msg: `Subí al menos ${FOTOS_MINIMAS} fotos.` };
  }

  const tempKey = `tmp-${gate.sesion.id}-${Date.now()}`;
  let fotoPaths: { path: string; esSticker: boolean }[] = [];
  try {
    const buffers = await Promise.all(
      files.map(async (f, i) => ({
        bytes: Buffer.from(await f.arrayBuffer()),
        mime: f.type || "image/jpeg",
        name: f.name || `foto-${i}.jpg`,
        esSticker: i === stickerIdx,
      })),
    );
    fotoPaths = await subirFotosRegistro(tempKey, buffers);
  } catch (e) {
    return {
      ok: false as const,
      msg: e instanceof Error ? e.message : "No pude subir las fotos.",
    };
  }

  const itemsKit = formData
    .getAll("items_kit")
    .map((x) => String(x).trim())
    .filter(Boolean);

  const r = await guardarRegistroTaller({
    citaId: c.id,
    vehiculoId: c.vehiculo_id,
    clienteId: c.cliente_id,
    tipo: c.tipo,
    fecha: String(c.fecha).slice(0, 10),
    sucursal: c.sucursal,
    km: num(formData, "km"),
    asistencia: "llego",
    fullFiltroAc: formData.get("full_filtro_ac") === "on",
    fullFiltroMotor: formData.get("full_filtro_motor") === "on",
    fullFiltroAceite: formData.get("full_filtro_aceite") === "on",
    fullCuartosAceite: formData.get("full_cuartos_aceite") === "on",
    fullAjusteLiquidos: formData.get("full_ajuste_liquidos") === "on",
    promoGratis: formData.get("promo_gratis") === "on",
    montoCobrado: num(formData, "monto_cobrado"),
    stickerOk: formData.get("sticker_ok") === "on",
    carroLimpio:
      formData.get("carro_limpio") === "si"
        ? true
        : formData.get("carro_limpio") === "no"
          ? false
          : null,
    transmision: (String(formData.get("transmision") ?? "") || null) as
      | "manual"
      | "automatico"
      | null,
    montoClienteKit: num(formData, "monto_cliente_kit"),
    itemsKit,
    trabajo: String(formData.get("trabajo") ?? "") || null,
    operativo:
      formData.get("operativo") === "si"
        ? true
        : formData.get("operativo") === "no"
          ? false
          : null,
    costoEdison: num(formData, "costo_edison"),
    comentario: String(formData.get("comentario") ?? "") || null,
    avisoCarteraMulta: formData.get("aviso_cartera_multa") === "on",
    motivoMulta: String(formData.get("motivo_multa") ?? "") || null,
    origen: "agenda_web",
    creadoPor: gate.sesion.id,
    fotoPaths,
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
