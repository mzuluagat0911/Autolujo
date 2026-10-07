// Persistencia de la fase 5. Si la migración 0036 no está aplicada,
// estas escrituras se omiten y el extracto sigue igual.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ajustarPesos,
  ALIAS_MINIMO,
  MARCA_IMAGEN_PARECIDA,
  PESOS_INICIALES,
  senalesEnsenables,
  valorAlias,
  type AliasAprendido,
  type PesosAprendizaje,
} from "./aprendizaje-cruce";
import { huellaDesdeBytes, mismaImagen } from "./huella-imagen";

function tablaAusente(message: string): boolean {
  return /conciliacion_alias|conciliacion_ejemplos|conciliacion_pesos|conciliacion_huellas|schema cache|could not find the table/i.test(
    message,
  );
}

export async function cargarMemoriaAprendizaje(
  sb: SupabaseClient,
  empresaId: string,
): Promise<{ aliases: AliasAprendido[]; pesos: PesosAprendizaje }> {
  const vacio = { aliases: [] as AliasAprendido[], pesos: { ...PESOS_INICIALES } };
  try {
    const [aliasQ, pesosQ] = await Promise.all([
      sb
        .from("conciliacion_alias")
        .select("tipo, valor, contrato_id, numero_carro, veces, vigente")
        .eq("empresa_id", empresaId)
        .eq("vigente", true)
        .gte("veces", ALIAS_MINIMO)
        .limit(500),
      sb.from("conciliacion_pesos").select("pesos").eq("empresa_id", empresaId).maybeSingle(),
    ]);
    if (aliasQ.error && !tablaAusente(aliasQ.error.message)) {
      console.error("[aprendizaje] alias", aliasQ.error.message);
    }
    if (pesosQ.error && !tablaAusente(pesosQ.error.message)) {
      console.error("[aprendizaje] pesos", pesosQ.error.message);
    }
    const aliases = ((aliasQ.data ?? []) as {
      tipo: "remitente" | "cuenta_emisora";
      valor: string;
      contrato_id: string | null;
      numero_carro: string | null;
      veces: number;
      vigente: boolean;
    }[])
      .filter((a) => a.contrato_id)
      .map((a) => ({
        tipo: a.tipo,
        valor: a.valor,
        contratoId: a.contrato_id as string,
        numero: a.numero_carro,
        veces: a.veces,
        vigente: a.vigente,
      }));
    const pesos = {
      ...PESOS_INICIALES,
      ...((pesosQ.data as { pesos?: PesosAprendizaje } | null)?.pesos ?? {}),
    };
    return { aliases, pesos };
  } catch (e) {
    console.error("[aprendizaje] memoria", e);
    return vacio;
  }
}

export async function referenciaEnOtraEmpresa(
  sb: SupabaseClient,
  referencia: string,
  empresaId: string,
): Promise<boolean> {
  try {
    const { data, error } = await sb
      .from("pagos")
      .select("id, contrato:contratos(vehiculo:vehiculos(empresa_id))")
      .eq("referencia", referencia)
      .limit(8);
    if (error || !data) return false;
    for (const row of (data ?? []) as unknown as {
      contrato: { vehiculo: { empresa_id: string } | { empresa_id: string }[] | null } | { vehiculo: { empresa_id: string } | { empresa_id: string }[] | null }[] | null;
    }[]) {
      const contrato = Array.isArray(row.contrato) ? row.contrato[0] : row.contrato;
      const vehiculo = Array.isArray(contrato?.vehiculo) ? contrato?.vehiculo[0] : contrato?.vehiculo;
      const emp = vehiculo?.empresa_id;
      if (emp && emp !== empresaId) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function aprenderDecision(opts: {
  sb: SupabaseClient;
  movimientoId: string;
  resultado: "acierto" | "rechazo";
  empresaId?: string | null;
  contratoId?: string | null;
  numeroCarro?: string | null;
  pagoId?: string | null;
  tocarAlias?: boolean;
}): Promise<void> {
  try {
    const { data } = await opts.sb
      .from("movimientos_extracto")
      .select("nombre_detectado, descripcion, numero_carro, extracto:extractos_bancarios(empresa_id)")
      .eq("id", opts.movimientoId)
      .maybeSingle();
    const row = data as {
      nombre_detectado: string | null;
      descripcion: string | null;
      numero_carro: string | null;
      extracto: { empresa_id: string } | { empresa_id: string }[] | null;
    } | null;
    const extracto = Array.isArray(row?.extracto) ? row?.extracto[0] : row?.extracto;
    const empresaId = opts.empresaId ?? extracto?.empresa_id ?? null;
    const numero = opts.numeroCarro ?? row?.numero_carro ?? null;
    const senales = senalesEnsenables({
      numeroCarro: numero,
      nombre: row?.nombre_detectado ?? null,
      descripcion: row?.descripcion ?? null,
    });
    if (empresaId) {
      await guardarEjemplo(opts.sb, {
        empresaId,
        movimientoId: opts.movimientoId,
        pagoId: opts.pagoId ?? null,
        contratoId: opts.contratoId ?? null,
        resultado: opts.resultado,
        senales,
      });
      await guardarPesos(opts.sb, empresaId, senales, opts.resultado);
    }
    if (opts.tocarAlias !== false && opts.resultado === "acierto" && empresaId && opts.contratoId) {
      await subirAlias(opts.sb, {
        empresaId,
        contratoId: opts.contratoId,
        numero,
        nombre: row?.nombre_detectado ?? null,
        descripcion: row?.descripcion ?? null,
      });
    }
    if (opts.tocarAlias !== false && opts.resultado === "rechazo" && empresaId && opts.contratoId) {
      await bajarAlias(opts.sb, {
        empresaId,
        contratoId: opts.contratoId,
        nombre: row?.nombre_detectado ?? null,
        descripcion: row?.descripcion ?? null,
      });
    }
  } catch (e) {
    console.error("[aprendizaje] decisión", e);
  }
}

async function guardarEjemplo(
  sb: SupabaseClient,
  row: {
    empresaId: string;
    movimientoId: string;
    pagoId: string | null;
    contratoId: string | null;
    resultado: "acierto" | "rechazo";
    senales: string[];
  },
) {
  const { error } = await sb.from("conciliacion_ejemplos").insert({
    empresa_id: row.empresaId,
    movimiento_id: row.movimientoId,
    pago_id: row.pagoId,
    contrato_id: row.contratoId,
    resultado: row.resultado,
    senales: row.senales,
  });
  if (error && !tablaAusente(error.message)) console.error("[aprendizaje] ejemplo", error.message);
}

async function guardarPesos(
  sb: SupabaseClient,
  empresaId: string,
  senales: string[],
  resultado: "acierto" | "rechazo",
) {
  const { data, error } = await sb
    .from("conciliacion_pesos")
    .select("pesos, ejemplos")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (error) {
    if (!tablaAusente(error.message)) console.error("[aprendizaje] pesos", error.message);
    return;
  }
  const previo = (data as { pesos?: PesosAprendizaje; ejemplos?: number } | null) ?? null;
  const pesos = ajustarPesos(previo?.pesos ?? PESOS_INICIALES, { senales, resultado });
  const fila = {
    empresa_id: empresaId,
    version: "aprendizaje-v1",
    pesos,
    ejemplos: (previo?.ejemplos ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  const guardado = previo
    ? await sb.from("conciliacion_pesos").update(fila).eq("empresa_id", empresaId)
    : await sb.from("conciliacion_pesos").insert(fila);
  if (guardado.error && !tablaAusente(guardado.error.message)) {
    console.error("[aprendizaje] pesos", guardado.error.message);
  }
}

async function subirAlias(
  sb: SupabaseClient,
  opts: {
    empresaId: string;
    contratoId: string;
    numero: string | null;
    nombre: string | null;
    descripcion: string | null;
  },
) {
  const valor = valorAlias(opts.nombre, opts.descripcion);
  if (!valor) return;
  const { data, error } = await sb
    .from("conciliacion_alias")
    .select("id, veces, contrato_id")
    .eq("empresa_id", opts.empresaId)
    .eq("tipo", "remitente")
    .eq("valor", valor)
    .maybeSingle();
  if (error) {
    if (!tablaAusente(error.message)) console.error("[aprendizaje] alias", error.message);
    return;
  }
  const ya = data as { id: string; veces: number; contrato_id: string | null } | null;
  if (!ya) {
    const ins = await sb.from("conciliacion_alias").insert({
      empresa_id: opts.empresaId,
      tipo: "remitente",
      valor,
      contrato_id: opts.contratoId,
      numero_carro: opts.numero,
      veces: 1,
      vigente: true,
    });
    if (ins.error && !tablaAusente(ins.error.message)) console.error("[aprendizaje] alias", ins.error.message);
    return;
  }
  if (ya.contrato_id && ya.contrato_id !== opts.contratoId && ya.veces >= ALIAS_MINIMO) return;
  const upd = await sb
    .from("conciliacion_alias")
    .update({
      veces: ya.veces + 1,
      contrato_id: opts.contratoId,
      numero_carro: opts.numero,
      vigente: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ya.id);
  if (upd.error && !tablaAusente(upd.error.message)) console.error("[aprendizaje] alias", upd.error.message);
}

async function bajarAlias(
  sb: SupabaseClient,
  opts: { empresaId: string; contratoId: string; nombre: string | null; descripcion: string | null },
) {
  const valor = valorAlias(opts.nombre, opts.descripcion);
  if (!valor) return;
  const { data, error } = await sb
    .from("conciliacion_alias")
    .select("id, veces")
    .eq("empresa_id", opts.empresaId)
    .eq("tipo", "remitente")
    .eq("valor", valor)
    .eq("contrato_id", opts.contratoId)
    .maybeSingle();
  if (error || !data) return;
  const ya = data as { id: string; veces: number };
  const veces = Math.max(0, ya.veces - 1);
  await sb
    .from("conciliacion_alias")
    .update({ veces, vigente: veces > 0, updated_at: new Date().toISOString() })
    .eq("id", ya.id);
}

export async function observarImagenComprobante(opts: {
  sb: SupabaseClient;
  bytes: Uint8Array;
  pagoId: string;
  empresaId: string | null;
}): Promise<string | null> {
  try {
    const huella = huellaDesdeBytes(opts.bytes);
    if (!huella) return null;
    let parecidaA: string | null = null;
    const { data, error } = await opts.sb
      .from("conciliacion_huellas")
      .select("pago_id, huella")
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) {
      if (!tablaAusente(error.message)) console.error("[aprendizaje] huellas", error.message);
      return null;
    }
    for (const row of (data ?? []) as { pago_id: string; huella: string }[]) {
      if (row.pago_id !== opts.pagoId && mismaImagen(huella, row.huella)) {
        parecidaA = row.pago_id;
        break;
      }
    }
    const ins = await opts.sb.from("conciliacion_huellas").insert({
      pago_id: opts.pagoId,
      empresa_id: opts.empresaId,
      huella,
      parecida_a: parecidaA,
    });
    if (ins.error) {
      if (!tablaAusente(ins.error.message)) console.error("[aprendizaje] huella", ins.error.message);
      return null;
    }
    if (!parecidaA) return null;
    const aviso = `${MARCA_IMAGEN_PARECIDA} esta captura se parece a otro comprobante. No se rechazó sola.`;
    const { data: pago } = await opts.sb.from("pagos").select("notas").eq("id", opts.pagoId).maybeSingle();
    const notas = [(pago as { notas: string | null } | null)?.notas, aviso].filter(Boolean).join(" ");
    await opts.sb.from("pagos").update({ notas }).eq("id", opts.pagoId);
    return aviso;
  } catch (e) {
    console.error("[aprendizaje] imagen", e);
    return null;
  }
}
