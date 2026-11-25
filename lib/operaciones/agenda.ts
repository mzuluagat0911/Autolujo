// Agenda de taller para Néstor: citar, confirmar llegada, notas y ancla de vuelta.

import { createServerSupabase } from "@/lib/supabase/server";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import { DIAS_REVISION_MENSUAL } from "./alertas";
import { etiquetaSedeTaller, sedeEntregaDelCarro, type SedeTaller } from "./sede-entrega";

export const TIPOS_CITA_TALLER = [
  { value: "revision_mensual", label: "Revisión mensual" },
  { value: "mantenimiento_6000", label: "Mantenimiento 6.000 km" },
  { value: "kit_tiempos", label: "Kit de tiempos" },
  { value: "atf", label: "Aceite ATF (50.000)" },
  { value: "mecanica", label: "Cita mecánica" },
] as const;

export type TipoCitaTaller = (typeof TIPOS_CITA_TALLER)[number]["value"];

export const ESTADOS_CITA_TALLER = [
  { value: "programada", label: "Programada" },
  { value: "llego", label: "Llegó" },
  { value: "no_llego", label: "No llegó" },
  { value: "cancelada", label: "Cancelada" },
  { value: "hecha", label: "Hecha" },
] as const;

export type EstadoCitaTaller = (typeof ESTADOS_CITA_TALLER)[number]["value"];

export type CitaTaller = {
  id: string;
  vehiculoId: string;
  carro: string;
  clienteId: string | null;
  clienteNombre: string | null;
  contacto: string | null;
  tipo: TipoCitaTaller;
  fecha: string;
  horaTexto: string | null;
  sucursal: SedeTaller;
  sucursalEtiqueta: string;
  trabajo: string | null;
  montoCliente: number | null;
  estado: EstadoCitaTaller;
  kmAlAtender: number | null;
  proximaFecha: string | null;
  comentario: string | null;
  atendidoAt: string | null;
  createdAt: string;
};

export type NotaCitaTaller = {
  id: string;
  texto: string;
  autorNombre: string | null;
  createdAt: string;
};

export type CarroAgenda = {
  vehiculoId: string;
  label: string;
  clienteId: string | null;
  clienteNombre: string | null;
  sede: SedeTaller | null;
};

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function filaDe(row: Record<string, unknown>): CitaTaller {
  const veh = uno(row.vehiculo as {
    numero?: string;
    empresa?: { codigo?: string } | { codigo?: string }[] | null;
  } | null);
  const empRaw = veh?.empresa;
  const emp = Array.isArray(empRaw) ? empRaw[0]?.codigo ?? null : empRaw?.codigo ?? null;
  const cli = uno(row.cliente as { id?: string; nombre?: string; whatsapp?: string | null; telefono?: string | null } | null);
  const sucursal = (row.sucursal as SedeTaller) || "juan_diaz";
  return {
    id: String(row.id),
    vehiculoId: String(row.vehiculo_id),
    carro: etiquetaCarroUi(emp, veh?.numero ?? "?"),
    clienteId: (row.cliente_id as string | null) ?? cli?.id ?? null,
    clienteNombre: cli?.nombre ?? null,
    contacto: cli?.whatsapp ?? cli?.telefono ?? null,
    tipo: row.tipo as TipoCitaTaller,
    fecha: String(row.fecha).slice(0, 10),
    horaTexto: (row.hora_texto as string | null) ?? null,
    sucursal,
    sucursalEtiqueta: etiquetaSedeTaller(sucursal),
    trabajo: (row.trabajo as string | null) ?? null,
    montoCliente: row.monto_cliente != null ? Number(row.monto_cliente) : null,
    estado: row.estado as EstadoCitaTaller,
    kmAlAtender: row.km_al_atender != null ? Number(row.km_al_atender) : null,
    proximaFecha: row.proxima_fecha ? String(row.proxima_fecha).slice(0, 10) : null,
    comentario: (row.comentario as string | null) ?? null,
    atendidoAt: (row.atendido_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

const SELECT =
  "id, vehiculo_id, cliente_id, tipo, fecha, hora_texto, sucursal, trabajo, monto_cliente, estado, km_al_atender, proxima_fecha, comentario, atendido_at, created_at, vehiculo:vehiculos(numero, empresa:empresas(codigo)), cliente:clientes(id, nombre, whatsapp, telefono)";

export function etiquetaTipoCita(tipo: string): string {
  return TIPOS_CITA_TALLER.find((t) => t.value === tipo)?.label ?? tipo;
}

export async function listarCitasTaller(opts: {
  desde?: string;
  hasta?: string;
  sucursal?: SedeTaller | "todas";
  estado?: EstadoCitaTaller | "abiertas" | "todas";
} = {}): Promise<{ filas: CitaTaller[]; error: string | null }> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const desde = opts.desde ?? hoy;
  const hasta = opts.hasta ?? sumarDias(hoy, 14);
  let q = sb
    .from("citas_taller")
    .select(SELECT)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true })
    .order("sucursal", { ascending: true })
    .limit(300);
  if (opts.sucursal && opts.sucursal !== "todas") q = q.eq("sucursal", opts.sucursal);
  if (opts.estado === "abiertas" || !opts.estado) {
    q = q.in("estado", ["programada", "llego", "no_llego"]);
  } else if (opts.estado !== "todas") {
    q = q.eq("estado", opts.estado);
  }
  const { data, error } = await q;
  if (error) {
    if (/citas_taller|schema cache/i.test(error.message)) {
      return { filas: [], error: "Falta aplicar la migración 0058 (agenda de taller)." };
    }
    return { filas: [], error: error.message };
  }
  return { filas: ((data ?? []) as Record<string, unknown>[]).map(filaDe), error: null };
}

export async function notasDeCita(citaId: string): Promise<NotaCitaTaller[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("citas_taller_notas")
    .select("id, texto, created_at, autor:equipo!citas_taller_notas_autor_id_fkey(nombre)")
    .eq("cita_id", citaId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => {
    const autor = uno(r.autor as { nombre?: string } | null);
    return {
      id: String(r.id),
      texto: String(r.texto ?? ""),
      autorNombre: autor?.nombre ?? null,
      createdAt: String(r.created_at ?? ""),
    };
  });
}

export async function carrosParaAgenda(): Promise<CarroAgenda[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("contratos")
    .select("cliente_id, vehiculo_id, cliente:clientes(nombre), vehiculo:vehiculos(id, numero, empresa:empresas(codigo))")
    .eq("estado", "activo")
    .limit(500);
  const rows = (data ?? []) as unknown as {
    cliente_id: string;
    vehiculo_id: string;
    cliente: { nombre: string } | { nombre: string }[] | null;
    vehiculo:
      | {
          id: string;
          numero: string;
          empresa: { codigo: string } | { codigo: string }[] | null;
        }
      | {
          id: string;
          numero: string;
          empresa: { codigo: string } | { codigo: string }[] | null;
        }[]
      | null;
  }[];
  const ids = rows.map((r) => r.vehiculo_id).filter(Boolean);
  const { sedesEntregaDe } = await import("./sede-entrega");
  const sedes = await sedesEntregaDe(ids);
  const out: CarroAgenda[] = [];
  for (const r of rows) {
    const veh = uno(r.vehiculo);
    if (!veh) continue;
    const empRaw = veh.empresa;
    const emp = Array.isArray(empRaw) ? empRaw[0]?.codigo ?? null : empRaw?.codigo ?? null;
    const cli = uno(r.cliente);
    out.push({
      vehiculoId: veh.id,
      label: `${etiquetaCarroUi(emp, veh.numero)}${cli?.nombre ? ` · ${cli.nombre}` : ""}`,
      clienteId: r.cliente_id ?? null,
      clienteNombre: cli?.nombre ?? null,
      sede: sedes.get(veh.id) ?? null,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export async function crearCitaTaller(input: {
  vehiculoId: string;
  clienteId?: string | null;
  tipo: TipoCitaTaller;
  fecha: string;
  horaTexto?: string | null;
  sucursal?: SedeTaller | null;
  trabajo?: string | null;
  montoCliente?: number | null;
  comentario?: string | null;
  creadoPor?: string | null;
}): Promise<{ ok: true; id: string; msg: string } | { ok: false; msg: string }> {
  const vehiculoId = String(input.vehiculoId ?? "").trim();
  const fecha = String(input.fecha ?? "").trim();
  if (!vehiculoId) return { ok: false, msg: "Elegí el carro." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, msg: "La fecha no es válida." };
  if (!TIPOS_CITA_TALLER.some((t) => t.value === input.tipo)) {
    return { ok: false, msg: "Indicá el tipo de cita." };
  }

  let sucursal = input.sucursal ?? null;
  if (!sucursal) sucursal = await sedeEntregaDelCarro(vehiculoId);
  if (!sucursal) {
    return {
      ok: false,
      msg: "Ese carro no tiene sede de entrega. Indicá Juan Díaz o La Chorrera.",
    };
  }

  const sb = createServerSupabase();
  let clienteId = input.clienteId ?? null;
  if (!clienteId) {
    const { data: c } = await sb
      .from("contratos")
      .select("cliente_id")
      .eq("vehiculo_id", vehiculoId)
      .eq("estado", "activo")
      .maybeSingle();
    clienteId = (c as { cliente_id: string } | null)?.cliente_id ?? null;
  }

  const { data, error } = await sb
    .from("citas_taller")
    .insert({
      vehiculo_id: vehiculoId,
      cliente_id: clienteId,
      tipo: input.tipo,
      fecha,
      hora_texto: input.horaTexto?.trim() || null,
      sucursal,
      trabajo: input.trabajo?.trim() || null,
      monto_cliente: input.montoCliente ?? null,
      comentario: input.comentario?.trim() || null,
      creado_por: input.creadoPor ?? null,
      actualizado_por: input.creadoPor ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (/citas_taller|schema cache/i.test(error.message)) {
      return { ok: false, msg: "Falta aplicar la migración 0058 (agenda de taller)." };
    }
    return { ok: false, msg: error.message };
  }

  const nota = input.comentario?.trim();
  if (nota && data) {
    await sb.from("citas_taller_notas").insert({
      cita_id: (data as { id: string }).id,
      autor_id: input.creadoPor ?? null,
      texto: nota,
    });
  }

  return {
    ok: true,
    id: (data as { id: string }).id,
    msg: `Cita en ${etiquetaSedeTaller(sucursal)} para el ${fecha.split("-").reverse().join("/")}.`,
  };
}

async function agregarNota(citaId: string, texto: string, autorId: string | null) {
  const limpio = texto.trim();
  if (!limpio) return;
  const sb = createServerSupabase();
  await sb.from("citas_taller_notas").insert({
    cita_id: citaId,
    autor_id: autorId,
    texto: limpio,
  });
  await sb
    .from("citas_taller")
    .update({ comentario: limpio, actualizado_por: autorId, updated_at: new Date().toISOString() })
    .eq("id", citaId);
}

export async function registrarNotaCita(
  citaId: string,
  texto: string,
  autorId: string | null,
): Promise<{ ok: true; msg: string } | { ok: false; msg: string }> {
  if (!citaId) return { ok: false, msg: "Falta la cita." };
  if (!texto.trim()) return { ok: false, msg: "Escribí el comentario." };
  await agregarNota(citaId, texto, autorId);
  return { ok: true, msg: "Comentario guardado." };
}

export async function marcarAsistenciaCita(input: {
  citaId: string;
  estado: "llego" | "no_llego" | "cancelada";
  comentario?: string | null;
  actorId?: string | null;
}): Promise<{ ok: true; msg: string } | { ok: false; msg: string }> {
  const sb = createServerSupabase();
  const { data: cita, error } = await sb
    .from("citas_taller")
    .select("id, estado")
    .eq("id", input.citaId)
    .maybeSingle();
  if (error || !cita) return { ok: false, msg: error?.message ?? "No encontré la cita." };
  if ((cita as { estado: string }).estado === "hecha") {
    return { ok: false, msg: "Esa cita ya quedó hecha." };
  }
  const { error: upErr } = await sb
    .from("citas_taller")
    .update({
      estado: input.estado,
      actualizado_por: input.actorId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.citaId);
  if (upErr) return { ok: false, msg: upErr.message };
  if (input.comentario?.trim()) await agregarNota(input.citaId, input.comentario, input.actorId ?? null);
  const label =
    input.estado === "llego" ? "Marcada como llegó." : input.estado === "no_llego" ? "Marcada como no llegó." : "Cita cancelada.";
  return { ok: true, msg: label };
}

/** Cierra la cita y actualiza el ancla del carro para saber cuándo vuelve. */
export async function cerrarCitaTaller(input: {
  citaId: string;
  comentario?: string | null;
  km?: number | null;
  actorId?: string | null;
}): Promise<{ ok: true; msg: string; proximaFecha: string | null } | { ok: false; msg: string }> {
  const sb = createServerSupabase();
  const { data: raw, error } = await sb
    .from("citas_taller")
    .select("id, vehiculo_id, tipo, fecha, estado, sucursal, trabajo")
    .eq("id", input.citaId)
    .maybeSingle();
  if (error || !raw) return { ok: false, msg: error?.message ?? "No encontré la cita." };
  const cita = raw as {
    id: string;
    vehiculo_id: string;
    tipo: TipoCitaTaller;
    fecha: string;
    estado: string;
    sucursal: string;
    trabajo: string | null;
  };
  if (cita.estado === "hecha") return { ok: false, msg: "Esa cita ya estaba hecha." };

  const fecha = String(cita.fecha).slice(0, 10);
  let proximaFecha: string | null = null;
  const km = input.km != null && Number.isFinite(input.km) ? Math.round(Number(input.km)) : null;

  if (cita.tipo === "revision_mensual") {
    proximaFecha = sumarDias(fecha, DIAS_REVISION_MENSUAL);
    await sb.from("vehiculos").update({ fecha_ultima_revision: fecha }).eq("id", cita.vehiculo_id);
    await sb.from("vehiculo_eventos").insert({
      vehiculo_id: cita.vehiculo_id,
      fecha,
      tipo: "revision",
      titulo: "Revisión mensual",
      detalle: input.comentario?.trim() || "Revisión mensual atendida",
      lugar: etiquetaSedeTaller(cita.sucursal),
      km,
      origen: "agenda_taller",
    });
  } else if (cita.tipo === "mantenimiento_6000") {
    const patch: Record<string, unknown> = { fecha_ultimo_mantenimiento: fecha };
    if (km != null) patch.km_ultimo_mantenimiento = km;
    await sb.from("vehiculos").update(patch).eq("id", cita.vehiculo_id);
    await sb.from("vehiculo_eventos").insert({
      vehiculo_id: cita.vehiculo_id,
      fecha,
      tipo: "mantenimiento",
      titulo: "Mantenimiento 6.000 km",
      detalle: input.comentario?.trim() || "FULL atendido",
      lugar: etiquetaSedeTaller(cita.sucursal),
      km,
      origen: "agenda_taller",
    });
  } else if (cita.tipo === "kit_tiempos") {
    await sb.from("vehiculo_eventos").insert({
      vehiculo_id: cita.vehiculo_id,
      fecha,
      tipo: "mantenimiento",
      titulo: "Kit de tiempos",
      detalle: input.comentario?.trim() || "Kit de tiempos atendido",
      lugar: etiquetaSedeTaller(cita.sucursal),
      km,
      origen: "agenda_taller",
    });
  } else {
    await sb.from("vehiculo_eventos").insert({
      vehiculo_id: cita.vehiculo_id,
      fecha,
      tipo: "novedad",
      titulo: "Cita mecánica",
      detalle: (input.comentario?.trim() || cita.trabajo || "Trabajo de taller").slice(0, 500),
      lugar: etiquetaSedeTaller(cita.sucursal),
      km,
      origen: "agenda_taller",
    });
  }

  const { error: upErr } = await sb
    .from("citas_taller")
    .update({
      estado: "hecha",
      km_al_atender: km,
      proxima_fecha: proximaFecha,
      atendido_at: new Date().toISOString(),
      actualizado_por: input.actorId ?? null,
      updated_at: new Date().toISOString(),
      comentario: input.comentario?.trim() || undefined,
    })
    .eq("id", cita.id);
  if (upErr) return { ok: false, msg: upErr.message };

  if (input.comentario?.trim()) await agregarNota(cita.id, input.comentario, input.actorId ?? null);

  const msg = proximaFecha
    ? `Cita hecha. Próxima revisión ~ ${proximaFecha.split("-").reverse().join("/")}.`
    : cita.tipo === "mantenimiento_6000"
      ? "Cita hecha. El próximo FULL sale por km desde hoy."
      : "Cita hecha y anotada en la hoja de vida.";
  return { ok: true, msg, proximaFecha };
}
