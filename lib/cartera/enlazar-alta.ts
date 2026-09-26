// Al dar de alta un cliente o un carro con arrendatario, el contrato y el
// chat quedan en el mismo número. Sin eso el extracto no tiene a quién
// escribirle y la conversación sigue suelta.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "./fecha";
import { etiquetaCarroUi } from "./empresa";
import { normalizarTelefono } from "./telefono";
import { normalizarGenero, type GeneroCliente } from "./tratamiento";

export function telefonosDeAlta(whatsapp: string | null, telefono: string | null): {
  whatsapp: string;
  telefono: string;
  waNorm: string;
} | null {
  const waNorm = normalizarTelefono(whatsapp) ?? normalizarTelefono(telefono);
  if (!waNorm) return null;
  const local = waNorm.startsWith("507") && waNorm.length === 11 ? waNorm.slice(3) : waNorm;
  return { whatsapp: `+${waNorm}`, telefono: local, waNorm };
}

/** Crea el chat o lo amarra al contrato. No pisa el chat de otro cliente. */
export async function enlazarChatDelContrato(opts: {
  clienteId: string;
  contratoId: string;
  vehiculoId: string;
  numero: string;
  empresaCodigo: string | null;
  waNorm: string;
}): Promise<string | null> {
  const sb = createServerSupabase();
  const etiqueta = etiquetaCarroUi(opts.empresaCodigo, opts.numero) || `Carro ${opts.numero}`;
  const { data: conv, error } = await sb
    .from("conversaciones")
    .select("id, cliente_id")
    .eq("wa_numero", opts.waNorm)
    .maybeSingle();
  if (error) return error.message;
  const row = conv as { id: string; cliente_id: string | null } | null;
  if (row?.cliente_id && row.cliente_id !== opts.clienteId) {
    return "Ese celular ya tiene un chat de otro cliente. El contrato quedó creado; hay que revisarlo en Conversaciones.";
  }
  const patch = {
    cliente_id: opts.clienteId,
    vehiculo_id: opts.vehiculoId,
    contrato_id: opts.contratoId,
    etiqueta,
  };
  if (row) {
    const { error: upErr } = await sb.from("conversaciones").update(patch).eq("id", row.id);
    return upErr?.message ?? null;
  }
  const { error: insErr } = await sb.from("conversaciones").insert({
    wa_numero: opts.waNorm,
    ...patch,
  });
  return insErr?.message ?? null;
}

/**
 * Cliente nuevo sobre un carro que acaba de crearse: contrato activo, letra
 * y chat en el mismo celular. Sin cargos de entrada; esos van en el alta
 * completa de Clientes.
 */
export async function crearArrendatarioEnCarro(opts: {
  vehiculoId: string;
  numero: string;
  empresaCodigo: string | null;
  nombre: string;
  genero: GeneroCliente;
  whatsappRaw: string;
  letra: number;
}): Promise<{ ok: true; aviso: string | null } | { ok: false; error: string }> {
  const nombre = opts.nombre.trim();
  if (nombre.length < 2) return { ok: false, error: "El nombre del arrendatario es obligatorio." };
  const tels = telefonosDeAlta(opts.whatsappRaw, null);
  if (!tels) return { ok: false, error: "Celular inválido. Usa 8 dígitos o +507XXXXXXXX." };
  if (!(opts.letra > 0)) return { ok: false, error: "La letra diaria es obligatoria para enlazar el contrato." };

  const sb = createServerSupabase();
  const { data: cliente, error: cErr } = await sb
    .from("clientes")
    .insert({
      nombre,
      genero: opts.genero,
      whatsapp: tels.whatsapp,
      telefono: tels.telefono,
      mayor_de_25: true,
    })
    .select("id")
    .single();
  if (cErr || !cliente) return { ok: false, error: cErr?.message ?? "No pude crear el cliente." };
  const clienteId = (cliente as { id: string }).id;

  const hoy = hoyPanama();
  const { data: veh } = await sb.from("vehiculos").select("empresa_id").eq("id", opts.vehiculoId).maybeSingle();
  const empresaId = (veh as { empresa_id: string } | null)?.empresa_id;
  if (!empresaId) {
    await sb.from("clientes").delete().eq("id", clienteId);
    return { ok: false, error: "No encontré la empresa del carro." };
  }

  const contratoBase = {
    cliente_id: clienteId,
    vehiculo_id: opts.vehiculoId,
    empresa_id: empresaId,
    fecha_inicio: hoy,
    fecha_inicio_letra: hoy,
    letra_diaria: opts.letra,
    saldo_inicial: 0,
    estado: "activo" as const,
    descuento_puntual: 5,
    cobra_domingo: false,
    cuota_domingo: 0,
  };
  let contratoIns = await sb.from("contratos").insert(contratoBase).select("id").single();
  if (contratoIns.error && /fecha_inicio_letra/i.test(contratoIns.error.message)) {
    const { fecha_inicio_letra: _f, ...legacy } = contratoBase;
    contratoIns = await sb.from("contratos").insert(legacy).select("id").single();
  }
  if (contratoIns.error || !contratoIns.data) {
    await sb.from("clientes").delete().eq("id", clienteId);
    return { ok: false, error: contratoIns.error?.message ?? "No pude crear el contrato." };
  }
  const contrato = contratoIns.data;

  const aviso = await enlazarChatDelContrato({
    clienteId,
    contratoId: (contrato as { id: string }).id,
    vehiculoId: opts.vehiculoId,
    numero: opts.numero,
    empresaCodigo: opts.empresaCodigo,
    waNorm: tels.waNorm,
  });
  return { ok: true, aviso };
}

export function generoDeAlta(v: unknown): GeneroCliente | null {
  return normalizarGenero(v);
}
