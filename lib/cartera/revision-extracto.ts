// Cola de revisión del extracto: una persona aplica o ignora lo que el
// cruce no pudo marcar solo. No inventa matches: exige un contrato.

import { createServerSupabase } from "@/lib/supabase/server";
import { instantePanama } from "./fecha";
import { recalcularRecargo } from "./devengo";
import { canonCarro, fechaCubrePago, montoExacto } from "./cruce";

export type ResultadoRevision = { ok: boolean; error?: string };

async function contratoActivo(
  contratoId: string,
): Promise<{
  id: string;
  clienteId: string | null;
  letra: number;
  numero: string;
  empresaId: string;
} | null> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("contratos")
    .select("id, cliente_id, letra_diaria, estado, vehiculo:vehiculos!inner(numero, empresa_id)")
    .eq("id", contratoId)
    .maybeSingle();
  const c = data as unknown as {
    id: string;
    cliente_id: string | null;
    letra_diaria: number;
    estado: string;
    vehiculo: { numero: string; empresa_id: string };
  } | null;
  if (!c || c.estado !== "activo") return null;
  return {
    id: c.id,
    clienteId: c.cliente_id,
    letra: Number(c.letra_diaria),
    numero: c.vehiculo.numero,
    empresaId: c.vehiculo.empresa_id,
  };
}

async function contratoPorCarroEnEmpresa(
  carro: string,
  empresaId: string,
): Promise<{ unico: Awaited<ReturnType<typeof contratoActivo>>; cuantos: number }> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("contratos")
    .select("id, cliente_id, letra_diaria, estado, vehiculo:vehiculos!inner(numero, empresa_id)")
    .eq("estado", "activo")
    .eq("vehiculo.empresa_id", empresaId);
  const filas = (data ?? []) as unknown as {
    id: string;
    cliente_id: string | null;
    letra_diaria: number;
    estado: string;
    vehiculo: { numero: string; empresa_id: string };
  }[];
  const key = canonCarro(carro);
  const hits = filas.filter((c) => canonCarro(c.vehiculo.numero) === key);
  if (hits.length !== 1) return { unico: null, cuantos: hits.length };
  const c = hits[0];
  return {
    cuantos: 1,
    unico: {
      id: c.id,
      clienteId: c.cliente_id,
      letra: Number(c.letra_diaria),
      numero: c.vehiculo.numero,
      empresaId: c.vehiculo.empresa_id,
    },
  };
}

/**
 * Si hay un comprobante pendiente del mismo contrato, monto y ventana de
 * fecha, lo usamos. Así no se duplica el dinero en el saldo.
 */
async function comprobantePendienteCalza(
  contratoId: string,
  monto: number,
  fechaMov: string,
): Promise<{ id: string; pagadoAt: string } | null> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("id, monto, pagado_at")
    .eq("contrato_id", contratoId)
    .eq("estado_conciliacion", "pendiente")
    .eq("origen", "comprobante")
    .order("pagado_at", { ascending: true });
  const hits = ((data ?? []) as { id: string; monto: number; pagado_at: string }[]).filter(
    (p) => montoExacto(Number(p.monto), monto) && fechaCubrePago(p.pagado_at, fechaMov),
  );
  return hits[0] ? { id: hits[0].id, pagadoAt: hits[0].pagado_at } : null;
}

export async function ignorarMovimientoExtracto(movimientoId: string): Promise<ResultadoRevision> {
  if (!movimientoId) return { ok: false, error: "Falta el movimiento." };
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("movimientos_extracto")
    .update({
      estado: "ignorado",
      conciliado: false,
      motivo: "Ignorado por el equipo.",
    })
    .eq("id", movimientoId)
    .eq("estado", "revisar")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Ese movimiento ya no está en revisión." };
  return { ok: true };
}

export async function aplicarMovimientoExtracto(opts: {
  movimientoId: string;
  contratoId: string | null;
  carro: string | null;
}): Promise<ResultadoRevision> {
  const { movimientoId } = opts;
  if (!movimientoId) return { ok: false, error: "Falta el movimiento." };

  const sb = createServerSupabase();
  const { data: raw, error: errMov } = await sb
    .from("movimientos_extracto")
    .select("id, fecha, monto, numero_carro, estado, conciliado, extracto:extractos_bancarios!inner(empresa_id)")
    .eq("id", movimientoId)
    .maybeSingle();
  if (errMov) return { ok: false, error: errMov.message };
  const mov = raw as {
    id: string;
    fecha: string | null;
    monto: number;
    numero_carro: string | null;
    estado: string;
    conciliado: boolean;
    extracto: { empresa_id: string };
  } | null;
  if (!mov) return { ok: false, error: "No encontré ese movimiento." };
  if (mov.estado !== "revisar" || mov.conciliado) {
    return { ok: false, error: "Ese movimiento ya no está en revisión." };
  }
  if (!mov.fecha) return { ok: false, error: "Ese movimiento no tiene fecha." };

  const empresaId = mov.extracto.empresa_id;
  const carro = (opts.carro ?? "").trim() || mov.numero_carro;
  let contrato: Awaited<ReturnType<typeof contratoActivo>> = null;
  if (carro) {
    const r = await contratoPorCarroEnEmpresa(carro, empresaId);
    if (r.cuantos > 1) {
      return { ok: false, error: `El carro ${carro} tiene ${r.cuantos} contratos activos.` };
    }
    contrato = r.unico;
  }
  if (!contrato && opts.contratoId) {
    const c = await contratoActivo(opts.contratoId);
    if (c && c.empresaId === empresaId) contrato = c;
  }
  if (!contrato) {
    return { ok: false, error: "Indica el número de carro (de esta empresa) para aplicarlo." };
  }

  const monto = Number(mov.monto);
  const pendiente = await comprobantePendienteCalza(contrato.id, monto, mov.fecha);
  let pagoId: string;
  let pagadoAt: string;

  if (pendiente) {
    const { error } = await sb
      .from("pagos")
      .update({
        estado_conciliacion: "conciliado",
        contrato_id: contrato.id,
        movimiento_extracto_id: mov.id,
      })
      .eq("id", pendiente.id);
    if (error) return { ok: false, error: error.message };
    pagoId = pendiente.id;
    pagadoAt = pendiente.pagadoAt;
  } else {
    pagadoAt = instantePanama(mov.fecha, 12, 0).toISOString();
    const { data: pago, error } = await sb
      .from("pagos")
      .insert({
        contrato_id: contrato.id,
        cliente_id: contrato.clienteId,
        fecha: mov.fecha,
        pagado_at: pagadoAt,
        monto,
        metodo: "transferencia",
        banco: "Banco General",
        numero_carro: contrato.numero,
        origen: "extracto",
        estado_conciliacion: "conciliado",
        movimiento_extracto_id: mov.id,
        notas: "Aplicado a mano desde el extracto (cola de revisión).",
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    pagoId = (pago as { id: string }).id;
  }

  const estado = monto + 0.01 < contrato.letra ? "parcial" : "aplicado";
  const { error: errUp } = await sb
    .from("movimientos_extracto")
    .update({
      conciliado: true,
      pago_id: pagoId,
      contrato_id: contrato.id,
      numero_carro: contrato.numero,
      estado,
      via: "carro",
      motivo: pendiente
        ? `Aplicado a mano: se cruzó con el comprobante del carro ${contrato.numero}.`
        : `Aplicado a mano al carro ${contrato.numero} (sin comprobante pendiente).`,
    })
    .eq("id", mov.id)
    .eq("estado", "revisar");
  if (errUp) return { ok: false, error: errUp.message };

  try {
    await recalcularRecargo(contrato.id, mov.fecha);
  } catch (e) {
    console.error("[revision-extracto] recargo", e);
  }

  return { ok: true };
}
