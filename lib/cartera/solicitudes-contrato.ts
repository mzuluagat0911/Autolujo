import { createServerSupabase } from "@/lib/supabase/server";
import { telefonosDeAlta } from "./enlazar-alta";

export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada" | "cancelada";

export type SolicitudContrato = {
  id: string;
  estado: EstadoSolicitud;
  nombre: string;
  whatsapp: string | null;
  telefono: string | null;
  waNorm: string | null;
  vehiculoId: string | null;
  carroNumero: string | null;
  empresaCodigo: string | null;
  letraDiaria: number | null;
  sucursal: string | null;
  fechaInicio: string | null;
  payload: Record<string, string>;
  solicitanteId: string | null;
  solicitanteNombre: string | null;
  aprobadorId: string | null;
  aprobadorNombre: string | null;
  aprobadoAt: string | null;
  motivoRechazo: string | null;
  notasInternas: string | null;
  clienteId: string | null;
  contratoId: string | null;
  createdAt: string;
  updatedAt: string;
};

function str(v: FormDataEntryValue | null | undefined): string {
  return String(v ?? "").trim();
}

/** Serializa el FormData a un mapa plano (checks → "on"). */
export function payloadDesdeFormData(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string") continue;
    out[k] = v;
  }
  return out;
}

/** Reconstruye FormData desde el snapshot guardado. */
export function formDataDesdePayload(payload: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(payload)) {
    if (v == null) continue;
    fd.set(k, String(v));
  }
  return fd;
}

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function filaDe(row: Record<string, unknown>): SolicitudContrato {
  const solicitante = uno(row.solicitante as { nombre?: string } | { nombre?: string }[] | null);
  const aprobador = uno(row.aprobador as { nombre?: string } | { nombre?: string }[] | null);
  const payloadRaw = row.payload;
  const payload =
    payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
      ? (payloadRaw as Record<string, string>)
      : {};
  return {
    id: String(row.id),
    estado: row.estado as EstadoSolicitud,
    nombre: String(row.nombre ?? ""),
    whatsapp: (row.whatsapp as string | null) ?? null,
    telefono: (row.telefono as string | null) ?? null,
    waNorm: (row.wa_norm as string | null) ?? null,
    vehiculoId: (row.vehiculo_id as string | null) ?? null,
    carroNumero: (row.carro_numero as string | null) ?? null,
    empresaCodigo: (row.empresa_codigo as string | null) ?? null,
    letraDiaria: row.letra_diaria != null ? Number(row.letra_diaria) : null,
    sucursal: (row.sucursal as string | null) ?? null,
    fechaInicio: row.fecha_inicio != null ? String(row.fecha_inicio).slice(0, 10) : null,
    payload,
    solicitanteId: (row.solicitante_id as string | null) ?? null,
    solicitanteNombre: solicitante?.nombre?.trim() || null,
    aprobadorId: (row.aprobador_id as string | null) ?? null,
    aprobadorNombre: aprobador?.nombre?.trim() || null,
    aprobadoAt: (row.aprobado_at as string | null) ?? null,
    motivoRechazo: (row.motivo_rechazo as string | null) ?? null,
    notasInternas: (row.notas_internas as string | null) ?? null,
    clienteId: (row.cliente_id as string | null) ?? null,
    contratoId: (row.contrato_id as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

const SELECT =
  "id, estado, nombre, whatsapp, telefono, wa_norm, vehiculo_id, carro_numero, empresa_codigo, letra_diaria, sucursal, fecha_inicio, payload, solicitante_id, aprobador_id, aprobado_at, motivo_rechazo, notas_internas, cliente_id, contrato_id, created_at, updated_at, solicitante:equipo!solicitudes_contrato_solicitante_id_fkey(nombre), aprobador:equipo!solicitudes_contrato_aprobador_id_fkey(nombre)";

export async function listarSolicitudesContrato(
  filtro: "pendiente" | "todas" | "cerradas" = "pendiente",
): Promise<{ filas: SolicitudContrato[]; error: string | null }> {
  const sb = createServerSupabase();
  let q = sb.from("solicitudes_contrato").select(SELECT).order("created_at", { ascending: false }).limit(200);
  if (filtro === "pendiente") q = q.eq("estado", "pendiente");
  if (filtro === "cerradas") q = q.in("estado", ["aprobada", "rechazada", "cancelada"]);
  const { data, error } = await q;
  if (error) {
    if (/solicitudes_contrato|schema cache/i.test(error.message)) {
      return { filas: [], error: "Falta aplicar la migración 0057 (solicitudes de contrato)." };
    }
    return { filas: [], error: error.message };
  }
  return { filas: ((data ?? []) as Record<string, unknown>[]).map(filaDe), error: null };
}

export async function obtenerSolicitudContrato(
  id: string,
): Promise<{ fila: SolicitudContrato | null; error: string | null }> {
  const sb = createServerSupabase();
  const { data, error } = await sb.from("solicitudes_contrato").select(SELECT).eq("id", id).maybeSingle();
  if (error) {
    if (/solicitudes_contrato|schema cache/i.test(error.message)) {
      return { fila: null, error: "Falta aplicar la migración 0057 (solicitudes de contrato)." };
    }
    return { fila: null, error: error.message };
  }
  if (!data) return { fila: null, error: "No encontré esa solicitud." };
  return { fila: filaDe(data as Record<string, unknown>), error: null };
}

/** Valida lo mínimo del form y arma la fila a insertar (sin crear cliente). */
export async function armarAltaSolicitud(opts: {
  formData: FormData;
  solicitanteId: string | null;
  /** Al editar/aprobar, excluye esta fila del chequeo de carro ya pedido. */
  excluirSolicitudId?: string | null;
}): Promise<
  | { ok: true; fila: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const fd = opts.formData;
  const nombre = str(fd.get("nombre"));
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  const genero = str(fd.get("genero")).toLowerCase();
  if (genero !== "m" && genero !== "f") return { ok: false, error: "Indicá el género (Sr. / Sra.)." };
  const vehiculoId = str(fd.get("vehiculo_id"));
  if (!vehiculoId) return { ok: false, error: "Elegí el carro." };
  const letra = Number(String(fd.get("letra_diaria") ?? "").replace(",", "."));
  if (!Number.isFinite(letra) || letra <= 0) return { ok: false, error: "La letra diaria es obligatoria." };
  const sucursal = str(fd.get("sucursal"));
  if (!/^(juan_diaz|chorrera)$/i.test(sucursal)) {
    return { ok: false, error: "Elegí la sucursal de entrega (Juan Díaz o La Chorrera)." };
  }

  const tels = telefonosDeAlta(str(fd.get("whatsapp")) || null, str(fd.get("telefono")) || null);
  if ((str(fd.get("whatsapp")) || str(fd.get("telefono"))) && !tels) {
    return { ok: false, error: "Celular inválido. Usa 8 dígitos o +507XXXXXXXX." };
  }

  const sb = createServerSupabase();
  const { data: veh, error: vErr } = await sb
    .from("vehiculos")
    .select("id, numero, empresa:empresas(codigo)")
    .eq("id", vehiculoId)
    .maybeSingle();
  if (vErr || !veh) return { ok: false, error: "No encontré ese carro." };

  const { data: activo } = await sb
    .from("contratos")
    .select("id")
    .eq("vehiculo_id", vehiculoId)
    .eq("estado", "activo")
    .limit(1)
    .maybeSingle();
  if (activo) return { ok: false, error: "Ese carro ya tiene un contrato activo." };

  let qOtra = sb
    .from("solicitudes_contrato")
    .select("id, nombre")
    .eq("vehiculo_id", vehiculoId)
    .eq("estado", "pendiente")
    .limit(1);
  if (opts.excluirSolicitudId) qOtra = qOtra.neq("id", opts.excluirSolicitudId);
  const { data: otraPend } = await qOtra.maybeSingle();
  if (otraPend) {
    return {
      ok: false,
      error: `Ese carro ya tiene una solicitud pendiente (${(otraPend as { nombre: string }).nombre}).`,
    };
  }

  const empRaw = (veh as { empresa?: { codigo?: string } | { codigo?: string }[] | null }).empresa;
  const emp = Array.isArray(empRaw) ? empRaw[0]?.codigo ?? null : empRaw?.codigo ?? null;
  const payload = payloadDesdeFormData(fd);
  delete payload.solicitud_id;
  delete payload.motivo_rechazo;

  return {
    ok: true,
    fila: {
      estado: "pendiente",
      solicitante_id: opts.solicitanteId,
      nombre,
      whatsapp: tels?.whatsapp ?? (str(fd.get("whatsapp")) || null),
      telefono: tels?.telefono ?? (str(fd.get("telefono")) || null),
      wa_norm: tels?.waNorm ?? null,
      vehiculo_id: vehiculoId,
      carro_numero: String((veh as { numero: string }).numero ?? "").trim() || null,
      empresa_codigo: emp,
      letra_diaria: letra,
      sucursal,
      fecha_inicio: str(fd.get("fecha_inicio")) || null,
      payload,
      updated_at: new Date().toISOString(),
    },
  };
}
