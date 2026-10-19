// Un celular pertenece a una persona. Puede tener varios carros en la vida.
// A la vez puede tener dos asignados: uno activo y el otro improductivo.

import { createServerSupabase } from "@/lib/supabase/server";
import { etiquetaCarroUi } from "./empresa";
import { esTelefonoCanonico } from "./telefono";

export type ClienteTelefono = { id: string; nombre: string; cedula: string | null };
export type CarroAsignado = { vehiculoId: string; carro: string; estadoVehiculo: string };

export function decidirTelefono(opts: {
  clienteActualId: string | null;
  coincidencias: ClienteTelefono[];
  chatClienteId?: string | null;
}): { ok: true; reutilizarId: string | null; limpiarIds: string[] } {
  const otros = opts.coincidencias.filter((c) => c.id !== opts.clienteActualId);
  const reutilizarId = opts.clienteActualId
    ? null
    : (otros.find((c) => c.id === opts.chatClienteId)?.id ??
      otros.find((c) => c.cedula)?.id ??
      otros[0]?.id ??
      null);
  const limpiarIds = otros.filter((c) => c.id !== reutilizarId).map((c) => c.id);
  return { ok: true, reutilizarId, limpiarIds };
}

/** Dos carros asignados como máximo. Solo uno de esos dos puede estar activo. */
export function decidirCupo(opts: {
  asignados: CarroAsignado[];
  vehiculoId: string;
  quedaraActivo: boolean;
}): { ok: true } | { ok: false; msg: string } {
  const otros = opts.asignados.filter((a) => a.vehiculoId !== opts.vehiculoId);
  if (otros.length >= 2) {
    return {
      ok: false,
      msg: `Este cliente ya tiene dos carros asignados (${otros.map((o) => o.carro).join(" y ")}).`,
    };
  }
  if (!opts.quedaraActivo) return { ok: true };
  const otroActivo = otros.find((o) => o.estadoVehiculo === "activo");
  if (!otroActivo) return { ok: true };
  return {
    ok: false,
    msg: `Este cliente ya tiene el carro ${otroActivo.carro} activo. El otro tiene que quedar improductivo.`,
  };
}

type Sb = ReturnType<typeof createServerSupabase>;

export async function panoramaTelefono(waNorm: string): Promise<{
  coincidencias: ClienteTelefono[];
  chatClienteId: string | null;
}> {
  const vacio = { coincidencias: [], chatClienteId: null };
  if (!esTelefonoCanonico(waNorm)) return vacio;
  const sb = createServerSupabase();
  const [{ data: clientes, error }, { data: conv }] = await Promise.all([
    sb.from("clientes").select("id, nombre, cedula").or(`wa_norm.eq.${waNorm},tel_norm.eq.${waNorm}`),
    sb.from("conversaciones").select("cliente_id").eq("wa_numero", waNorm).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const coincidencias = ((clientes ?? []) as ClienteTelefono[]).filter((c) => c.id);
  const chatClienteId = (conv as { cliente_id: string | null } | null)?.cliente_id ?? null;
  return { coincidencias, chatClienteId };
}

type VehiculoAsignado = {
  id?: string;
  numero?: string;
  estado?: string;
  empresa?: { codigo?: string } | { codigo?: string }[] | null;
};

function carroDe(veh: VehiculoAsignado | VehiculoAsignado[] | null | undefined): CarroAsignado | null {
  const row = Array.isArray(veh) ? veh[0] : veh;
  if (!row?.id) return null;
  const empresa = Array.isArray(row.empresa) ? row.empresa[0] : row.empresa;
  return {
    vehiculoId: row.id,
    carro: etiquetaCarroUi(empresa?.codigo, row.numero),
    estadoVehiculo: row.estado ?? "",
  };
}

export async function asignadosDelCliente(clienteId: string): Promise<CarroAsignado[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("contratos")
    .select("vehiculo:vehiculos(id, numero, estado, empresa:empresas(codigo))")
    .eq("cliente_id", clienteId)
    .eq("estado", "activo");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { vehiculo: VehiculoAsignado | VehiculoAsignado[] | null }[])
    .map((row) => carroDe(row.vehiculo))
    .filter((row): row is CarroAsignado => Boolean(row));
}

/** Mensaje si poner este carro en activo dejaría dos activos, o si ya hay dos asignados. */
export async function cupoAlQuedarActivo(vehiculoId: string): Promise<string | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("contratos")
    .select("cliente_id")
    .eq("vehiculo_id", vehiculoId)
    .eq("estado", "activo")
    .maybeSingle();
  if (error) return error.message;
  const clienteId = (data as { cliente_id: string } | null)?.cliente_id;
  if (!clienteId) return null;
  const decision = decidirCupo({
    asignados: await asignadosDelCliente(clienteId),
    vehiculoId,
    quedaraActivo: true,
  });
  return decision.ok ? null : decision.msg;
}

export async function soltarTelefono(ids: string[]): Promise<void> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return;
  const sb = createServerSupabase();
  const { error } = await sb.from("clientes").update({ whatsapp: null, telefono: null }).in("id", unicos);
  if (error) throw new Error(error.message);
}

export async function chatPuedePasarA(
  _sb: Sb,
  chatClienteId: string,
  clienteNuevoId: string,
  _vehiculoId: string,
): Promise<string | null> {
  if (chatClienteId === clienteNuevoId) return null;
  return null;
}
