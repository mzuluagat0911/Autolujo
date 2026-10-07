// Cola de revisión del extracto: una persona aplica o ignora lo que el
// cruce no pudo marcar solo. No inventa matches: exige un contrato.

import { createServerSupabase } from "@/lib/supabase/server";
import { instantePanama, sumarDias } from "./fecha";
import { recalcularRecargo } from "./devengo";
import { aplicarPagoEnObligaciones, borrarCargosAcuerdoDelPago } from "./aplicar-pago";
import { avisarPagoConciliado } from "./avisar-conciliacion";
import { registrarAuditoriaConciliacion } from "./conciliacion-auditoria";
import { aprenderDecision } from "./aprendizaje-datos";
import { pagoEsperaConceptoExcedente } from "./cobro-hoy";
import { armarPagoCombinado, type PartidaPago } from "./partida-pago";
import { borrarCargoSalidaDelPago } from "./salidas-aplicar";
import { carroAtribuible, contratoPorCarro, fechaCubrePago, montoExacto, numeroCarroOperativo, type ContratoFlota } from "./cruce";

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
  const flota: ContratoFlota[] = filas.map((c) => ({
    contratoId: c.id,
    letra: Number(c.letra_diaria),
    numero: c.vehiculo.numero,
    clienteNombre: null,
    empresaId: c.vehiculo.empresa_id,
  }));
  const hallado = contratoPorCarro(flota, carro);
  if (!hallado.unico) return { unico: null, cuantos: hallado.cuantos };
  const c = filas.find((f) => f.id === hallado.unico!.contratoId)!;
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
  contrato: { id: string; numero: string; empresaId: string },
  monto: number,
  fechaMov: string,
): Promise<{ id: string; pagadoAt: string } | null> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("id, monto, pagado_at, fecha, notas, numero_carro, contrato_id, contrato:contratos(vehiculo:vehiculos(empresa_id))")
    .eq("estado_conciliacion", "pendiente")
    .eq("origen", "comprobante")
    .gte("fecha", sumarDias(fechaMov, -1))
    .lte("fecha", fechaMov)
    .order("pagado_at", { ascending: true });
  const hits = ((data ?? []) as unknown as {
    id: string;
    monto: number;
    pagado_at: string;
    notas: string | null;
    numero_carro: string | null;
    contrato_id: string | null;
    contrato: { vehiculo: { empresa_id: string } | null } | null;
  }[]).filter((p) => {
    if (pagoEsperaConceptoExcedente(p.notas)) return false;
    if (!montoExacto(Number(p.monto), monto) || !fechaCubrePago(p.pagado_at, fechaMov)) return false;
    if (p.contrato_id === contrato.id) return true;
    const emp = p.contrato?.vehiculo?.empresa_id ?? null;
    if (emp && emp !== contrato.empresaId) return false;
    if (p.contrato_id && p.contrato_id !== contrato.id) return false;
    const op = numeroCarroOperativo(p.numero_carro);
    return Boolean(op && carroAtribuible(op, contrato.numero));
  });
  const delContrato = hits.filter((p) => p.contrato_id === contrato.id);
  const elegido = delContrato[0] ?? (hits.length === 1 ? hits[0] : null);
  return elegido ? { id: elegido.id, pagadoAt: elegido.pagado_at } : null;
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
  await registrarAuditoriaConciliacion({
    accion: "ignorado",
    actor: "equipo",
    movimientoId,
    motivo: "Ignorado por el equipo.",
    antes: { estado: "revisar" },
    despues: { estado: "ignorado" },
  });
  await aprenderDecision({
    sb,
    movimientoId,
    resultado: "rechazo",
    tocarAlias: false,
  });
  return { ok: true };
}

export async function aplicarMovimientoExtracto(opts: {
  movimientoId: string;
  contratoId: string | null;
  carro: string | null;
  /** Si hay varios comprobantes que calzan, el equipo elige cuál. */
  pagoId?: string | null;
  /** Parte del pago que no es letra, por ejemplo $5 de Penonomé. */
  partida?: PartidaPago | null;
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

  const partida = opts.partida ?? null;
  const armado = partida ? armarPagoCombinado(Number(mov.monto), partida) : null;
  if (armado && "error" in armado) return { ok: false, error: armado.error };

  const empresaId = mov.extracto.empresa_id;
  const carroBruto = (opts.carro ?? "").trim() || mov.numero_carro;
  const carro = numeroCarroOperativo(carroBruto) || carroBruto;
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
  let pendiente: { id: string; pagadoAt: string } | null = null;

  if (opts.pagoId) {
    const { data: elegido } = await sb
      .from("pagos")
      .select("id, monto, pagado_at, estado_conciliacion, origen, contrato_id, numero_carro, notas, rubro, asignaciones")
      .eq("id", opts.pagoId)
      .maybeSingle();
    const p = elegido as {
      id: string;
      monto: number;
      pagado_at: string;
      estado_conciliacion: string;
      origen: string | null;
      contrato_id: string | null;
      numero_carro: string | null;
      notas: string | null;
      rubro: string | null;
      asignaciones: unknown;
    } | null;
    if (!p || p.estado_conciliacion !== "pendiente" || p.origen !== "comprobante") {
      return { ok: false, error: "Ese comprobante ya no está pendiente." };
    }
    if (pagoEsperaConceptoExcedente(p.notas) && !p.rubro && !p.asignaciones) {
      return {
        ok: false,
        error: "Este pago trae excedente sin concepto. Asígnalo antes de cruzarlo con el extracto.",
      };
    }
    if (!montoExacto(Number(p.monto), monto) || !fechaCubrePago(p.pagado_at, mov.fecha)) {
      return { ok: false, error: "Ese comprobante no calza en monto/fecha con el movimiento." };
    }
    if (p.contrato_id && p.contrato_id !== contrato.id) {
      return { ok: false, error: "Ese comprobante pertenece a otro contrato." };
    }
    const op = numeroCarroOperativo(p.numero_carro);
    if (op && p.contrato_id !== contrato.id && !carroAtribuible(op, contrato.numero)) {
      return { ok: false, error: "Ese comprobante es de otro carro." };
    }
    pendiente = { id: p.id, pagadoAt: p.pagado_at };
  } else {
    pendiente = await comprobantePendienteCalza(contrato, monto, mov.fecha);
  }

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

  if (armado && !("error" in armado)) {
    const { error } = await sb
      .from("pagos")
      .update({
        asignaciones: armado.resultado,
        destino_interior: armado.destinoId,
      })
      .eq("id", pagoId);
    if (error && !/destino_interior/i.test(error.message)) {
      return { ok: false, error: error.message };
    }
    if (error) {
      const retry = await sb.from("pagos").update({ asignaciones: armado.resultado }).eq("id", pagoId);
      if (retry.error) return { ok: false, error: retry.error.message };
    }
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

  await registrarAuditoriaConciliacion({
    accion: estado,
    actor: "equipo",
    movimientoId: mov.id,
    pagoId,
    contratoId: contrato.id,
    empresaId: contrato.empresaId,
    motivo: pendiente
      ? `Aplicado a mano: se cruzó con el comprobante del carro ${contrato.numero}.`
      : `Aplicado a mano al carro ${contrato.numero} (sin comprobante pendiente).`,
    antes: { estado: "revisar", conciliado: false },
    despues: { estado, pagoId, contratoId: contrato.id },
  });
  await aprenderDecision({
    sb,
    movimientoId: mov.id,
    resultado: "acierto",
    empresaId,
    contratoId: contrato.id,
    numeroCarro: contrato.numero,
    pagoId,
  });

  try {
    await recalcularRecargo(contrato.id, mov.fecha);
  } catch (e) {
    console.error("[revision-extracto] recargo", e);
  }

  try {
    const aplicado = await aplicarPagoEnObligaciones(pagoId);
    try {
      await avisarPagoConciliado(pagoId, aplicado);
    } catch (e) {
      console.error("[revision-extracto] aviso WA", e);
    }
  } catch (e) {
    console.error("[revision-extracto] waterfall", e);
  }

  return { ok: true };
}

export async function revertirMovimientoExtracto(
  movimientoId: string,
  motivo: string,
): Promise<ResultadoRevision> {
  const porque = motivo.trim();
  if (!movimientoId) return { ok: false, error: "Falta el movimiento." };
  if (porque.length < 3) return { ok: false, error: "Escribe por qué se deshace." };

  const sb = createServerSupabase();
  const { data: raw, error } = await sb
    .from("movimientos_extracto")
    .select("id, estado, conciliado, pago_id, contrato_id, extracto:extractos_bancarios(empresa_id)")
    .eq("id", movimientoId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const mov = raw as {
    id: string;
    estado: string;
    conciliado: boolean;
    pago_id: string | null;
    contrato_id: string | null;
    extracto: { empresa_id: string } | null;
  } | null;
  if (!mov) return { ok: false, error: "No encontré ese movimiento." };
  if (!mov.conciliado || (mov.estado !== "aplicado" && mov.estado !== "parcial")) {
    return { ok: false, error: "Solo se puede deshacer un cruce ya aplicado." };
  }
  if (!mov.pago_id) return { ok: false, error: "Ese movimiento no tiene un pago vinculado." };

  const { data: pagoRaw } = await sb
    .from("pagos")
    .select("id, origen, notas, estado_conciliacion")
    .eq("id", mov.pago_id)
    .maybeSingle();
  const pago = pagoRaw as {
    id: string;
    origen: string | null;
    notas: string | null;
    estado_conciliacion: string;
  } | null;
  if (!pago) return { ok: false, error: "No encontré el pago de ese cruce." };

  await borrarCargoSalidaDelPago(pago.id);
  await borrarCargosAcuerdoDelPago(pago.id);

  const nota = [pago.notas, `Revertido: ${porque}`].filter(Boolean).join(" · ");
  if (pago.origen === "comprobante") {
    const { error: errPago } = await sb
      .from("pagos")
      .update({
        estado_conciliacion: "pendiente",
        movimiento_extracto_id: null,
        asignaciones: null,
        destino_interior: null,
        notas: nota,
      })
      .eq("id", pago.id);
    if (errPago && /destino_interior|asignaciones/i.test(errPago.message)) {
      const retry = await sb
        .from("pagos")
        .update({
          estado_conciliacion: "pendiente",
          movimiento_extracto_id: null,
          notas: nota,
        })
        .eq("id", pago.id);
      if (retry.error) return { ok: false, error: retry.error.message };
    } else if (errPago) {
      return { ok: false, error: errPago.message };
    }
  } else {
    const { error: errPago } = await sb
      .from("pagos")
      .update({
        estado_conciliacion: "rechazado",
        movimiento_extracto_id: null,
        notas: nota,
      })
      .eq("id", pago.id);
    if (errPago) return { ok: false, error: errPago.message };
  }

  const { error: errMov } = await sb
    .from("movimientos_extracto")
    .update({
      estado: "revisar",
      conciliado: false,
      pago_id: null,
      motivo: `Revertido: ${porque}`,
    })
    .eq("id", mov.id);
  if (errMov) return { ok: false, error: errMov.message };

  await registrarAuditoriaConciliacion({
    accion: "revertido",
    actor: "equipo",
    movimientoId: mov.id,
    pagoId: pago.id,
    contratoId: mov.contrato_id,
    empresaId: mov.extracto?.empresa_id ?? null,
    motivo: porque,
    antes: { estado: mov.estado, conciliado: true },
    despues: { estado: "revisar", conciliado: false },
  });
  await aprenderDecision({
    sb,
    movimientoId: mov.id,
    resultado: "rechazo",
    empresaId: mov.extracto?.empresa_id ?? null,
    contratoId: mov.contrato_id,
    pagoId: pago.id,
  });
  return { ok: true };
}

/** Aplica en lote lo que ya tiene carro sugerido (vía carro). Si llegan ids, solo esos. */
export async function aplicarSugeridosEnLote(ids?: string[]): Promise<{ ok: number; fail: number; msg: string }> {
  const sb = createServerSupabase();
  const unicos = ids ? [...new Set(ids.map((id) => id.trim()).filter(Boolean))] : null;
  if (unicos && unicos.length === 0) {
    return { ok: 0, fail: 0, msg: "No hay movimientos con carro sugerido para aplicar en lote." };
  }
  let q = sb
    .from("movimientos_extracto")
    .select("id, numero_carro, via, contrato:contratos(vehiculo:vehiculos(numero))")
    .eq("estado", "revisar")
    .eq("via", "carro")
    .order("fecha", { ascending: true })
    .limit(80);
  if (unicos) q = q.in("id", unicos);
  const { data, error } = await q;
  if (error) return { ok: 0, fail: 0, msg: error.message };

  type Row = {
    id: string;
    numero_carro: string | null;
    contrato: { vehiculo: { numero: string } | null } | null;
  };
  const filas = (data ?? []) as unknown as Row[];
  let ok = 0;
  let fail = 0;
  for (const m of filas) {
    const carro = m.numero_carro ?? m.contrato?.vehiculo?.numero ?? null;
    if (!carro) {
      fail++;
      continue;
    }
    const r = await aplicarMovimientoExtracto({
      movimientoId: m.id,
      contratoId: null,
      carro,
    });
    if (r.ok) ok++;
    else fail++;
  }
  return {
    ok,
    fail,
    msg: ok === 0 && fail === 0
      ? "No hay movimientos con carro sugerido para aplicar en lote."
      : `Aplicados ${ok}${fail ? ` · ${fail} no se pudieron` : ""}.`,
  };
}

/** Ignora en lote movimientos marcados (fees, sin carro, etc.). */
export async function ignorarMovimientosEnLote(ids: string[]): Promise<{ ok: number; fail: number; msg: string }> {
  const unicos = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (unicos.length === 0) return { ok: 0, fail: 0, msg: "No hay movimientos seleccionados." };
  let ok = 0;
  let fail = 0;
  for (const id of unicos) {
    const r = await ignorarMovimientoExtracto(id);
    if (r.ok) ok++;
    else fail++;
  }
  return {
    ok,
    fail,
    msg: `Ignorados ${ok}${fail ? ` · ${fail} no se pudieron` : ""}.`,
  };
}
