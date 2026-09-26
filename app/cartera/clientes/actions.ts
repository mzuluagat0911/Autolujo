"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, horaPanama } from "@/lib/cartera/fecha";
import { normalizarGenero } from "@/lib/cartera/tratamiento";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import { enlazarChatDelContrato, telefonosDeAlta } from "@/lib/cartera/enlazar-alta";

const PANAPASS_ENTRADA = 20;
const DOMINGOS_ENTRADA_DEFAULT = 90; // 3 × $30
const CUOTA_DOMINGO_DEFAULT = 30;

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function volverClientes(msg: string): never {
  redirect(`/cartera/clientes?aviso=${encodeURIComponent(msg)}`);
}

export async function createCliente(formData: FormData): Promise<void> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) volverClientes("El nombre es obligatorio.");
  const genero = normalizarGenero(formData.get("genero"));
  if (!genero) volverClientes("Indicá el género (Sr. / Sra.) para saludar bien por WhatsApp.");

  const tels = telefonosDeAlta(str(formData.get("whatsapp")), str(formData.get("telefono")));
  if ((str(formData.get("whatsapp")) || str(formData.get("telefono"))) && !tels) {
    volverClientes("Celular inválido. Usa 8 dígitos o +507XXXXXXXX.");
  }

  const sb = createServerSupabase();
  const { data: cliente, error } = await sb
    .from("clientes")
    .insert({
      nombre,
      genero,
      cedula: str(formData.get("cedula")),
      telefono: tels?.telefono ?? str(formData.get("telefono")),
      whatsapp: tels?.whatsapp ?? str(formData.get("whatsapp")),
      mayor_de_25: formData.get("mayor_de_25") === "on",
    })
    .select("id")
    .single();
  if (error || !cliente) volverClientes(error?.message ?? "No pude crear el cliente.");

  if (tels) {
    const sb2 = createServerSupabase();
    const { data: ya } = await sb2
      .from("conversaciones")
      .select("id, cliente_id")
      .eq("wa_numero", tels.waNorm)
      .maybeSingle();
    const row = ya as { id: string; cliente_id: string | null } | null;
    const clienteId = (cliente as { id: string }).id;
    if (!row) {
      await sb2.from("conversaciones").insert({
        wa_numero: tels.waNorm,
        cliente_id: clienteId,
        etiqueta: nombre,
      });
    } else if (!row.cliente_id || row.cliente_id === clienteId) {
      await sb2.from("conversaciones").update({ cliente_id: clienteId }).eq("id", row.id);
    }
  }

  revalidatePath("/cartera/clientes");
  revalidatePath("/cartera/conversaciones");
  volverClientes(
    tels ? `${nombre} quedó creado y el chat enlazado a su celular.` : `${nombre} quedó creado. Sin celular no hay chat.`,
  );
}

type ParteDesglose = {
  tipo: string;
  aplicado: number;
  etiqueta: string;
  ref?: string | null;
};

/**
 * Alta en un paso: cliente + contrato + cargos de entrada + pago único con desglose.
 *
 * Entrada fija: panapass $20 + domingos $90 (3×$30).
 * Letra diaria arranca en `fecha_inicio_letra` (puede ser distinta a fecha_inicio).
 * Abono incompleto → acuerdo de financiamiento con cuota diaria.
 * Efectivo/tarjeta → confirmado (`manual`). Transferencia → `pendiente`.
 */
export async function createClienteConContrato(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; msg?: string }> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  const genero = normalizarGenero(formData.get("genero"));
  if (!genero) return { ok: false, error: "Indicá el género (Sr. / Sra.)." };

  const vehiculoId = String(formData.get("vehiculo_id") ?? "").trim();
  if (!vehiculoId) return { ok: false, error: "Elegí el carro." };

  const letra = num(formData.get("letra_diaria"));
  if (letra == null || letra <= 0) return { ok: false, error: "La letra diaria es obligatoria." };

  const numCuotas = num(formData.get("num_cuotas_total"));
  const abonoPactado = Math.max(num(formData.get("abono_inicial")) ?? 0, 0);
  const abonoPagado = Math.max(num(formData.get("abono_pagado")) ?? 0, 0);
  const abonoCuota = Math.max(num(formData.get("abono_cuota_diaria")) ?? 0, 0);
  const descuento = num(formData.get("descuento_puntual"));
  const cobraDomingo = formData.get("cobra_domingo") === "on";
  const cuotaDomingo =
    num(formData.get("cuota_domingo")) ?? (cobraDomingo ? CUOTA_DOMINGO_DEFAULT : 0);
  const fechaInicio = str(formData.get("fecha_inicio")) ?? hoyPanama();
  const fechaInicioLetra = str(formData.get("fecha_inicio_letra")) ?? fechaInicio;

  const panapassCargo = PANAPASS_ENTRADA;
  const domingosCargo = Math.max(
    num(formData.get("domingos_entrada")) ?? DOMINGOS_ENTRADA_DEFAULT,
    0,
  );
  const panapassPagado = Math.min(
    Math.max(num(formData.get("panapass_pagado")) ?? panapassCargo, 0),
    panapassCargo,
  );
  const domingosPagado = Math.min(
    Math.max(num(formData.get("domingos_pagado")) ?? 0, 0),
    domingosCargo,
  );
  const prepagoLetras = Math.max(num(formData.get("prepago_letras")) ?? 0, 0);
  const prepagoDomingos = Math.max(num(formData.get("prepago_domingos")) ?? 0, 0);

  if (abonoPagado - abonoPactado > 0.009) {
    return { ok: false, error: "El abono pagado no puede ser mayor al abono pactado." };
  }
  const abonoRestante = r2(Math.max(abonoPactado - abonoPagado, 0));
  if (abonoRestante > 0.009 && abonoCuota <= 0.009) {
    return {
      ok: false,
      error: "Si queda abono pendiente, indicá cuánto pagará diario (ej. $5).",
    };
  }

  if (panapassPagado + 0.009 < panapassCargo) {
    return {
      ok: false,
      error: `El panapass (${panapassCargo}) debe pagarse completo para entregar el carro.`,
    };
  }

  const metodoRaw = String(formData.get("metodo") ?? "").trim();
  const metodo =
    metodoRaw === "efectivo" || metodoRaw === "tarjeta" || metodoRaw === "transferencia"
      ? metodoRaw
      : null;
  const totalPago = r2(
    panapassPagado + domingosPagado + abonoPagado + prepagoLetras + prepagoDomingos,
  );
  if (totalPago > 0.009 && !metodo) {
    return { ok: false, error: "Elegí el método de pago (efectivo, tarjeta o transferencia)." };
  }

  const sb = createServerSupabase();

  const { data: veh, error: vErr } = await sb
    .from("vehiculos")
    .select("id, empresa_id, numero, estado, empresa:empresas(codigo)")
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

  const tels = telefonosDeAlta(str(formData.get("whatsapp")), str(formData.get("telefono")));
  if ((str(formData.get("whatsapp")) || str(formData.get("telefono"))) && !tels) {
    return { ok: false, error: "Celular inválido. Usa 8 dígitos o +507XXXXXXXX." };
  }

  const { data: cliente, error: cErr } = await sb
    .from("clientes")
    .insert({
      nombre,
      genero,
      cedula: str(formData.get("cedula")),
      telefono: tels?.telefono ?? str(formData.get("telefono")),
      whatsapp: tels?.whatsapp ?? str(formData.get("whatsapp")),
      mayor_de_25: formData.get("mayor_de_25") === "on",
      codigo: str(formData.get("codigo")),
    })
    .select("id")
    .single();
  if (cErr || !cliente) {
    return { ok: false, error: cErr?.message ?? "No pude crear el cliente." };
  }

  const diasPrimeros = cobraDomingo && cuotaDomingo > 0 ? Math.round(domingosCargo / cuotaDomingo) : 0;

  const contratoBase = {
    cliente_id: cliente.id,
    vehiculo_id: vehiculoId,
    empresa_id: (veh as { empresa_id: string }).empresa_id,
    fecha_inicio: fechaInicio,
    fecha_inicio_letra: fechaInicioLetra,
    letra_diaria: letra,
    num_cuotas_total: numCuotas != null && numCuotas > 0 ? Math.round(numCuotas) : null,
    abono_inicial: abonoPactado,
    abono_cuota_diaria: abonoRestante > 0.009 ? abonoCuota : null,
    saldo_inicial: 0,
    estado: "activo" as const,
    descuento_puntual: descuento != null && descuento >= 0 ? descuento : 5,
    cobra_domingo: cobraDomingo,
    cuota_domingo: cobraDomingo ? cuotaDomingo : 0,
    dias_primeros_domingos: diasPrimeros,
  };

  let contratoInsert = await sb.from("contratos").insert(contratoBase).select("id").single();
  // Si la migración 0027 aún no corrió, reintentar sin columnas nuevas.
  if (
    contratoInsert.error &&
    /fecha_inicio_letra|abono_cuota_diaria/i.test(contratoInsert.error.message)
  ) {
    const { fecha_inicio_letra: _f, abono_cuota_diaria: _a, ...legacy } = contratoBase;
    contratoInsert = await sb.from("contratos").insert(legacy).select("id").single();
  }

  if (contratoInsert.error || !contratoInsert.data) {
    await sb.from("clientes").delete().eq("id", cliente.id);
    return {
      ok: false,
      error: contratoInsert.error?.message ?? "No pude crear el contrato.",
    };
  }
  const contratoId = (contratoInsert.data as { id: string }).id;

  if ((veh as { estado: string }).estado !== "activo") {
    await sb.from("vehiculos").update({ estado: "activo" }).eq("id", vehiculoId);
  }

  // --- Cargos de entrada ---
  const cargos: Record<string, unknown>[] = [];
  if (panapassCargo > 0.009) {
    cargos.push({
      contrato_id: contratoId,
      fecha: fechaInicio,
      tipo: "panapass",
      concepto_codigo: "PANAPASS",
      concepto: "Panapass",
      monto: panapassCargo,
    });
  }
  if (domingosCargo > 0.009) {
    cargos.push({
      contrato_id: contratoId,
      fecha: fechaInicio,
      tipo: "otras",
      concepto_codigo: "DOMINGOS",
      concepto: `Domingos (${diasPrimeros || 3} × $${cuotaDomingo || CUOTA_DOMINGO_DEFAULT})`,
      monto: domingosCargo,
    });
  }
  // Abono pagado hoy: cargo de afiliación por lo pagado (ingreso).
  if (abonoPagado > 0.009) {
    cargos.push({
      contrato_id: contratoId,
      fecha: fechaInicio,
      tipo: "afiliacion",
      concepto_codigo: "AFILIACION",
      concepto: "Abono inicial",
      monto: abonoPagado,
    });
  }
  if (cargos.length) {
    const { error: cargoErr } = await sb.from("cargos").insert(cargos);
    if (cargoErr) {
      // concepto_codigo DOMINGOS puede faltar: reintentar sin código
      if (/DOMINGOS|concepto_codigo/i.test(cargoErr.message)) {
        const sinCodigo = cargos.map(({ concepto_codigo: _c, ...rest }) => rest);
        await sb.from("cargos").insert(sinCodigo);
      }
    }
  }

  // Abono restante → acuerdo (cola de ítems extra, cuota diaria).
  let acuerdoId: string | null = null;
  if (abonoRestante > 0.009) {
    const { data: ac } = await sb
      .from("acuerdos")
      .insert({
        contrato_id: contratoId,
        tipo: "financiamiento",
        descripcion: "abono inicial",
        monto_total: abonoRestante,
        saldo: abonoRestante,
        cuota_diaria: abonoCuota,
        cuota_domingo: abonoCuota,
        activo: true,
      })
      .select("id")
      .single();
    acuerdoId = (ac as { id: string } | null)?.id ?? null;
  }

  // --- Un solo pago con desglose ---
  const partes: ParteDesglose[] = [];
  if (panapassPagado > 0.009) {
    partes.push({ tipo: "panapass", aplicado: panapassPagado, etiqueta: "panapass" });
  }
  if (domingosPagado > 0.009) {
    partes.push({ tipo: "otro", aplicado: domingosPagado, etiqueta: "domingos" });
  }
  if (abonoPagado > 0.009) {
    partes.push({ tipo: "abono", aplicado: abonoPagado, etiqueta: "abono inicial" });
  }
  if (prepagoLetras > 0.009) {
    partes.push({
      tipo: "prepago_letra",
      aplicado: prepagoLetras,
      etiqueta: "letras adelantadas",
    });
  }
  if (prepagoDomingos > 0.009) {
    partes.push({
      tipo: "prepago_domingo",
      aplicado: prepagoDomingos,
      etiqueta: "domingos adelantados",
    });
  }

  if (totalPago > 0.009 && metodo) {
    const estadoConciliacion =
      metodo === "transferencia" ? "pendiente" : "manual";
    const pagadoAt = `${fechaInicio}T${horaPanama()}:00-05:00`;
    const desgloseTxt = partes.map((p) => `$${p.aplicado} ${p.etiqueta}`).join(" · ");
    const notas = [
      `Alta de contrato — ${metodo}.`,
      desgloseTxt ? `Desglose: ${desgloseTxt}.` : null,
      abonoRestante > 0.009
        ? `Abono restante $${abonoRestante} a $${abonoCuota}/día.`
        : null,
      str(formData.get("pago_notas")),
    ]
      .filter(Boolean)
      .join(" ");

    const carroNum = (veh as { numero: string }).numero;
    const asignaciones = {
      asignaciones: partes,
      totalAplicado: totalPago,
      sobrante: 0,
      origen: "alta_contrato",
    };

    const basePago = {
      contrato_id: contratoId,
      cliente_id: cliente.id,
      fecha: fechaInicio,
      pagado_at: pagadoAt,
      monto: totalPago,
      metodo,
      numero_carro: carroNum,
      origen: "manual",
      estado_conciliacion: estadoConciliacion,
      notas,
      referencia: str(formData.get("referencia")),
      asignaciones,
    };

    let pagoIns = await sb.from("pagos").insert(basePago).select("id").single();
    if (pagoIns.error && /asignaciones|pagado_at|numero_carro|origen|referencia/i.test(pagoIns.error.message)) {
      const { asignaciones: _a, pagado_at: _p, numero_carro: _n, origen: _o, referencia: _r, ...min } =
        basePago;
      pagoIns = await sb
        .from("pagos")
        .insert({ ...min, notas: `${notas} | ${JSON.stringify(partes)}` })
        .select("id")
        .single();
    }
    if (pagoIns.error) {
      // Contrato ya creado; reportar pero no borrar todo.
      revalidatePath("/cartera/clientes");
      return {
        ok: false,
        error: `Contrato creado, pero falló el pago: ${pagoIns.error.message}`,
      };
    }
  }

  void acuerdoId; // creado; el extracto lo toma de acuerdos activos

  let avisoChat: string | null = null;
  if (tels) {
    const empRaw = (veh as { empresa?: { codigo?: string } | { codigo?: string }[] | null }).empresa;
    const emp = Array.isArray(empRaw) ? empRaw[0]?.codigo ?? null : empRaw?.codigo ?? null;
    avisoChat = await enlazarChatDelContrato({
      clienteId: cliente.id,
      contratoId,
      vehiculoId,
      numero: (veh as { numero: string }).numero,
      empresaCodigo: emp,
      waNorm: tels.waNorm,
    });
  }

  revalidatePath("/cartera/clientes");
  revalidatePath("/cartera/vehiculos");
  revalidatePath("/cartera/conversaciones");
  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera");
  return {
    ok: true,
    msg: avisoChat
      ? `Cliente y contrato creados. ${avisoChat}`
      : tels
        ? "Cliente, contrato y chat enlazados."
        : "Cliente y contrato creados. Sin celular no queda chat.",
  };
}

export type CarroLibre = {
  id: string;
  label: string;
};

/** Carros sin contrato activo (disponibles para alta). */
export async function listarCarrosLibres(): Promise<CarroLibre[]> {
  const sb = createServerSupabase();
  const { data: veh } = await sb
    .from("vehiculos")
    .select("id, numero, placa, estado, empresa:empresas(codigo)")
    .neq("estado", "entregado")
    .order("numero");
  const { data: activos } = await sb.from("contratos").select("vehiculo_id").eq("estado", "activo");
  const ocupados = new Set(
    ((activos ?? []) as { vehiculo_id: string }[]).map((c) => c.vehiculo_id),
  );
  return ((veh ?? []) as unknown as {
    id: string;
    numero: string;
    placa: string | null;
    estado: string;
    empresa: { codigo: string } | null;
  }[])
    .filter((v) => !ocupados.has(v.id))
    .map((v) => {
      const sigla = v.empresa?.codigo ? siglaEmpresa(v.empresa.codigo) : "";
      const base = sigla ? `${sigla} · ${v.numero}` : v.numero;
      const placa = v.placa ? ` · ${v.placa}` : "";
      return { id: v.id, label: `${base}${placa} (${v.estado})` };
    });
}
