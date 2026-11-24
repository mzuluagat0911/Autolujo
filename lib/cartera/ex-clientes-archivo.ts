// Cuando archivan un contrato debiendo: entra a ex_clientes y el cobro WA
// lo toma con la lógica de rangos. Los pagos del contrato bajan este saldo.

import { createServerSupabase } from "@/lib/supabase/server";
import { telefonosDeAlta } from "@/lib/cartera/enlazar-alta";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Saldo vivo del contrato (vista). */
async function saldoContrato(contratoId: string): Promise<number> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("vw_saldo_contrato")
    .select("saldo_actual")
    .eq("contrato_id", contratoId)
    .maybeSingle();
  return r2(Number((data as { saldo_actual: number | null } | null)?.saldo_actual ?? 0));
}

/**
 * Crea o actualiza la fila de ex cliente al archivar un contrato con deuda.
 * Si el saldo es 0, no entra a cobro.
 */
export async function registrarExClienteDesdeArchivo(opts: {
  contratoId: string;
  motivo: string;
}): Promise<{ ok: true; saldo: number; creado: boolean } | { ok: false; error: string }> {
  const contratoId = opts.contratoId.trim();
  const motivo = opts.motivo.replace(/\s+/g, " ").trim();
  if (!contratoId) return { ok: false, error: "Falta el contrato." };

  const sb = createServerSupabase();
  const saldo = await saldoContrato(contratoId);
  if (saldo <= 0.009) return { ok: true, saldo: 0, creado: false };

  const { data: row, error } = await sb
    .from("contratos")
    .select(
      "id, cliente_id, empresa_id, cliente:clientes(id, nombre, cedula, telefono, whatsapp), vehiculo:vehiculos(numero, empresa_id)",
    )
    .eq("id", contratoId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Contrato no encontrado." };

  const c = row as {
    id: string;
    cliente_id: string | null;
    empresa_id: string;
    cliente:
      | { id: string; nombre: string; cedula: string | null; telefono: string | null; whatsapp: string | null }
      | { id: string; nombre: string; cedula: string | null; telefono: string | null; whatsapp: string | null }[]
      | null;
    vehiculo: { numero: string | null; empresa_id: string | null } | { numero: string | null; empresa_id: string | null }[] | null;
  };

  const cli = uno(c.cliente);
  const veh = uno(c.vehiculo);
  if (!cli) return { ok: false, error: "El contrato no tiene cliente." };

  const empresaId = c.empresa_id || veh?.empresa_id;
  if (!empresaId) return { ok: false, error: "Falta la empresa del contrato." };

  const tels = telefonosDeAlta(cli.whatsapp ?? cli.telefono, cli.telefono ?? cli.whatsapp);
  const carro = (veh?.numero ?? "").trim() || null;
  const cedula = (cli.cedula ?? "").trim() || null;
  const payload = {
    nombre: cli.nombre.trim(),
    cedula,
    telefono: tels?.telefono ?? cli.telefono ?? null,
    whatsapp: tels?.whatsapp ?? null,
    empresa_id: empresaId,
    carro,
    saldo,
    motivo: motivo || "Entregó el carro debiendo",
    notas: `Archivo de contrato ${contratoId.slice(0, 8)}`,
    origen: "archivo" as const,
    estado: "cobro" as const,
    cliente_id: cli.id,
    contrato_id: contratoId,
    updated_at: new Date().toISOString(),
  };

  const { data: porContrato } = await sb
    .from("ex_clientes")
    .select("id, estado")
    .eq("contrato_id", contratoId)
    .maybeSingle();
  if (porContrato) {
    const est = (porContrato as { estado: string }).estado;
    const patch: Record<string, unknown> = {
      saldo,
      motivo: payload.motivo,
      carro: payload.carro,
      empresa_id: empresaId,
      cliente_id: cli.id,
      updated_at: payload.updated_at,
    };
    // Si ya lo dieron de baja a propósito, no lo reabrimos al rearchivar.
    if (est !== "baja" && est !== "cerrado") patch.estado = "cobro";
    const { error: upErr } = await sb.from("ex_clientes").update(patch).eq("id", (porContrato as { id: string }).id);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, saldo, creado: false };
  }

  // Misma persona ya en la lista (Excel/manual): enlazar el contrato y tomar el saldo del sistema.
  let existente: { id: string; estado: string } | null = null;
  if (cedula) {
    const { data } = await sb.from("ex_clientes").select("id, estado").eq("cedula", cedula).maybeSingle();
    if (data) existente = data as { id: string; estado: string };
  }
  if (!existente && payload.whatsapp) {
    const { data } = await sb.from("ex_clientes").select("id, estado").eq("whatsapp", payload.whatsapp).maybeSingle();
    if (data) existente = data as { id: string; estado: string };
  }
  if (!existente && c.cliente_id) {
    const { data } = await sb
      .from("ex_clientes")
      .select("id, estado")
      .eq("cliente_id", c.cliente_id)
      .is("contrato_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) existente = data as { id: string; estado: string };
  }

  if (existente) {
    const respetar = existente.estado === "baja" || existente.estado === "cerrado";
    const patch: Record<string, unknown> = respetar
      ? {
          contrato_id: contratoId,
          saldo,
          carro: payload.carro,
          empresa_id: empresaId,
          cliente_id: cli.id,
          updated_at: payload.updated_at,
        }
      : { ...payload, estado: "cobro" };
    const { error: upErr } = await sb.from("ex_clientes").update(patch).eq("id", existente.id);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, saldo, creado: false };
  }

  const { error: insErr } = await sb.from("ex_clientes").insert(payload);
  if (insErr) {
    if (/origen|archivo|contrato_id|estado.*baja/i.test(insErr.message)) {
      return {
        ok: false,
        error: "Falta aplicar la migración 0055 (ex clientes archivo/baja).",
      };
    }
    return { ok: false, error: insErr.message };
  }
  return { ok: true, saldo, creado: true };
}

/**
 * Abono a un ex cliente del Excel/manual sin contrato en el sistema.
 * Baja el saldo de la fila; si queda en 0, lo cierra.
 * Devuelve contrato_id si ya estaba amarrado (para usar el flujo normal).
 */
export async function resolverDestinoExCliente(exClienteId: string): Promise<
  | { ok: true; modo: "contrato"; contratoId: string; carro: string | null }
  | { ok: true; modo: "saldo"; id: string; carro: string | null; saldo: number; nombre: string }
  | { ok: false; error: string }
> {
  const id = exClienteId.trim();
  if (!id) return { ok: false, error: "Falta el ex cliente." };
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("ex_clientes")
    .select("id, nombre, carro, saldo, estado, contrato_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No encontré ese ex cliente." };
  const f = data as {
    id: string;
    nombre: string;
    carro: string | null;
    saldo: number;
    estado: string;
    contrato_id: string | null;
  };
  if (f.estado === "baja" || f.estado === "cerrado") {
    return { ok: false, error: "Ese ex cliente ya no está en cobro." };
  }
  if (f.contrato_id) {
    return { ok: true, modo: "contrato", contratoId: f.contrato_id, carro: f.carro };
  }
  return {
    ok: true,
    modo: "saldo",
    id: f.id,
    carro: f.carro,
    saldo: r2(Number(f.saldo) || 0),
    nombre: f.nombre,
  };
}

/** Resta el abono al saldo Excel del ex cliente (sin contrato). */
export async function aplicarAbonoExClienteSaldo(
  exClienteId: string,
  monto: number,
): Promise<{ ok: true; saldo: number } | { ok: false; error: string }> {
  const id = exClienteId.trim();
  const abono = r2(Math.max(Number(monto) || 0, 0));
  if (!id) return { ok: false, error: "Falta el ex cliente." };
  if (abono <= 0.009) return { ok: false, error: "El abono tiene que ser mayor a cero." };

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("ex_clientes")
    .select("id, saldo, estado")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No encontré ese ex cliente." };
  const f = data as { id: string; saldo: number; estado: string };
  if (f.estado === "baja") return { ok: false, error: "Ese ex cliente está de baja." };

  const saldo = Math.max(r2(Number(f.saldo) || 0) - abono, 0);
  const patch: Record<string, unknown> = { saldo, updated_at: new Date().toISOString() };
  if (saldo <= 0.009 && (f.estado === "cobro" || f.estado === "acuerdo" || f.estado === "pausado")) {
    patch.estado = "cerrado";
  }
  const { error: upErr } = await sb.from("ex_clientes").update(patch).eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, saldo };
}

/**
 * Tras un pago (o su reversa) del contrato archivado: el saldo del ex cliente
 * queda igual al de la vista. Si llega a 0, se cierra.
 */
export async function sincronizarSaldoExClientePorContrato(contratoId: string): Promise<void> {
  if (!contratoId) return;
  const sb = createServerSupabase();
  const { data: filas, error } = await sb
    .from("ex_clientes")
    .select("id, estado, saldo")
    .eq("contrato_id", contratoId);
  if (error || !filas?.length) return;

  const saldo = Math.max(await saldoContrato(contratoId), 0);
  for (const f of filas as { id: string; estado: string; saldo: number }[]) {
    if (f.estado === "baja") {
      // Baja operativa: igual actualizamos el número por si reactivan.
      await sb.from("ex_clientes").update({ saldo, updated_at: new Date().toISOString() }).eq("id", f.id);
      continue;
    }
    const patch: Record<string, unknown> = { saldo, updated_at: new Date().toISOString() };
    if (saldo <= 0.009 && (f.estado === "cobro" || f.estado === "acuerdo" || f.estado === "pausado")) {
      patch.estado = "cerrado";
    }
    await sb.from("ex_clientes").update(patch).eq("id", f.id);
  }
}

/** Sacamos del cobro WA: nos bloquearon o ya no responden / no pagan. */
export async function darDeBajaExCliente(opts: {
  id: string;
  motivo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = opts.id.trim();
  const motivo = opts.motivo.replace(/\s+/g, " ").trim();
  if (!id) return { ok: false, error: "Falta el ex cliente." };
  if (motivo.length < 3) return { ok: false, error: "Escribí por qué lo dan de baja (bloqueo, no responden, etc.)." };

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("ex_clientes")
    .update({
      estado: "baja",
      motivo_baja: motivo,
      baja_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (/baja|estado/i.test(error.message)) {
      return { ok: false, error: "Falta aplicar la migración 0055 para dar de baja." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "No encontré ese ex cliente." };
  return { ok: true };
}
