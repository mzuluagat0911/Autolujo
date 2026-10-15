"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, horaPanama } from "@/lib/cartera/fecha";
import { normalizarGenero } from "@/lib/cartera/tratamiento";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import { enlazarChatDelContrato, telefonosDeAlta } from "@/lib/cartera/enlazar-alta";
import { invalidarLecturaEstados } from "@/lib/cartera/estado-cuenta-cache";
import { provinciaValida } from "@/lib/cartera/provincias-panama";
import { referenciasPersonales } from "@/lib/cartera/referencias-alta";

const PANAPASS_ENTRADA = 20;
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

function fechaIso(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return s;
}

function unirNota(prev: unknown, linea: string): string {
  const base = typeof prev === "string" && prev.trim() ? prev.trim() : "";
  return base ? `${base}\n${linea}` : linea;
}

function datosDeResidencia(
  formData: FormData,
): { direccion: string; provincia: string; referencias: string } | { error: string } {
  const provincia = str(formData.get("provincia"));
  if (!provincia || !provinciaValida(provincia)) return { error: "Elegí la provincia." };
  const direccion = str(formData.get("direccion"));
  if (!direccion) return { error: "La dirección es obligatoria." };
  const refs = referenciasPersonales(formData);
  if (refs.error || !refs.texto) {
    return { error: refs.error ?? "Hacen falta 4 referencias completas para guardar el contrato." };
  }
  return { direccion, provincia, referencias: refs.texto };
}

function fichaDelFormulario(formData: FormData): {
  placa: string;
  marca: string;
  chasis: string;
  numero_motor: string;
  tipo: string;
  modelo: string;
  anio: number;
  color: string;
} | { error: string } {
  const placa = str(formData.get("carro_placa"));
  const marca = str(formData.get("carro_marca"));
  const chasis = str(formData.get("carro_chasis"));
  const motor = str(formData.get("carro_motor"));
  const tipo = str(formData.get("carro_tipo"));
  const modelo = str(formData.get("carro_modelo"));
  const anio = num(formData.get("carro_anio"));
  const color = str(formData.get("carro_color"));
  if (!placa || !marca || !chasis || !motor || !tipo || !modelo || !color) {
    return { error: "El carro necesita placa, marca, chasis, motor, tipo, modelo, año y color." };
  }
  if (anio == null || anio < 1990 || anio > 2035) return { error: "El año del carro no es válido." };
  return {
    placa: placa.toUpperCase(),
    marca,
    chasis: chasis.toUpperCase(),
    numero_motor: motor.toUpperCase(),
    tipo: tipo.toUpperCase(),
    modelo: modelo.toUpperCase(),
    anio: Math.round(anio),
    color: color.toUpperCase(),
  };
}

async function guardarFichaVehiculo(
  sb: ReturnType<typeof createServerSupabase>,
  vehiculoId: string,
  ficha: Exclude<ReturnType<typeof fichaDelFormulario>, { error: string }>,
) {
  const { error } = await sb.from("vehiculos").update(ficha).eq("id", vehiculoId);
  if (!error) return { ok: true as const };
  if (/chasis|numero_motor|\btipo\b|color/i.test(error.message)) {
    return {
      ok: false as const,
      error: "Faltan en la base las columnas del carro (chasis, motor, tipo y color). Corré la migración 0044 y volvé a guardar.",
    };
  }
  return { ok: false as const, error: error.message };
}

function datosDeIdentidad(
  formData: FormData,
): { fecha_nacimiento: string; numero_licencia: string; fecha_vencimiento_licencia: string } | { error: string } {
  const nacimiento = fechaIso(formData.get("fecha_nacimiento"));
  if (!nacimiento) return { error: "La fecha de nacimiento es obligatoria." };
  if (nacimiento > hoyPanama()) return { error: "La fecha de nacimiento no puede ser futura." };
  const numero = str(formData.get("numero_licencia"));
  if (!numero || numero.length < 4) return { error: "El número de licencia es obligatorio." };
  const vence = fechaIso(formData.get("fecha_vencimiento_licencia"));
  if (!vence) return { error: "La fecha de vencimiento de la licencia es obligatoria." };
  return { fecha_nacimiento: nacimiento, numero_licencia: numero, fecha_vencimiento_licencia: vence };
}

async function insertarCliente(
  sb: ReturnType<typeof createServerSupabase>,
  fila: Record<string, unknown>,
) {
  let actual: Record<string, unknown> = { ...fila };
  if (!actual.referencias) delete actual.referencias;
  let ultimo = await sb.from("clientes").insert(actual).select("id").single();
  for (let i = 0; i < 3 && ultimo.error; i++) {
    const msg = ultimo.error.message;
    if (/referencias/i.test(msg) && actual.referencias) {
      const { referencias, ...resto } = actual;
      actual = { ...resto, notas: unirNota(resto.notas, String(referencias)) };
    } else if (/numero_licencia/i.test(msg) && actual.numero_licencia) {
      const nro = String(actual.numero_licencia);
      const { numero_licencia: _n, ...resto } = actual;
      actual = { ...resto, notas: unirNota(resto.notas, `Licencia: ${nro}`) };
    } else if (/provincia/i.test(msg) && actual.provincia) {
      const prov = String(actual.provincia);
      const { provincia: _p, ...resto } = actual;
      const dir = resto.direccion ? String(resto.direccion) : "";
      actual = { ...resto, direccion: dir ? `${prov} — ${dir}` : prov };
    } else {
      break;
    }
    ultimo = await sb.from("clientes").insert(actual).select("id").single();
  }
  return ultimo;
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
  const diasForm = num(formData.get("dias_domingos"));
  const fechaInicioDomingo = str(formData.get("fecha_inicio_domingo")) ?? fechaInicio;
  const diasDomingos = cobraDomingo
    ? Math.max(Math.round(diasForm ?? 3), 0)
    : 0;
  const domingosCargo = cobraDomingo && cuotaDomingo > 0
    ? r2(diasDomingos * cuotaDomingo)
    : 0;
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
  const residencia = datosDeResidencia(formData);
  if ("error" in residencia) return { ok: false, error: residencia.error };
  const identidad = datosDeIdentidad(formData);
  if ("error" in identidad) return { ok: false, error: identidad.error };
  const ficha = fichaDelFormulario(formData);
  if ("error" in ficha) return { ok: false, error: ficha.error };
  const fichaGuardada = await guardarFichaVehiculo(sb, vehiculoId, ficha);
  if (!fichaGuardada.ok) return { ok: false, error: fichaGuardada.error };

  const { data: cliente, error: cErr } = await insertarCliente(sb, {
    nombre,
    genero,
    cedula: str(formData.get("cedula")),
    telefono: tels?.telefono ?? str(formData.get("telefono")),
    whatsapp: tels?.whatsapp ?? str(formData.get("whatsapp")),
    mayor_de_25: formData.get("mayor_de_25") === "on",
    codigo: str(formData.get("codigo")),
    direccion: residencia.direccion,
    provincia: residencia.provincia,
    referencias: residencia.referencias,
    fecha_nacimiento: identidad.fecha_nacimiento,
    numero_licencia: identidad.numero_licencia,
    fecha_vencimiento_licencia: identidad.fecha_vencimiento_licencia,
  });
  if (cErr || !cliente) {
    return { ok: false, error: cErr?.message ?? "No pude crear el cliente." };
  }

  const diasPrimeros = diasDomingos;

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
      fecha: fechaInicioDomingo,
      tipo: "otras",
      concepto_codigo: "DOMINGOS",
      concepto: `Domingos (${diasPrimeros} × $${cuotaDomingo})`,
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
    partes.push({ tipo: "domingo", aplicado: domingosPagado, etiqueta: "domingo" });
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
  await invalidarLecturaEstados();
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
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  chasis: string | null;
  numeroMotor: string | null;
  tipo: string | null;
  color: string | null;
};

type FilaCarro = {
  id: string;
  numero: string;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  estado: string;
  empresa: { codigo: string } | null;
  chasis?: string | null;
  numero_motor?: string | null;
  tipo?: string | null;
  color?: string | null;
};

/** Carros sin contrato activo (disponibles para alta). */
export async function listarCarrosLibres(): Promise<CarroLibre[]> {
  const sb = createServerSupabase();
  const { data: veh } = await sb
    .from("vehiculos")
    .select("id, numero, placa, marca, modelo, anio, estado, empresa:empresas(codigo)")
    .neq("estado", "entregado")
    .order("numero");
  const extra = await sb
    .from("vehiculos")
    .select("id, chasis, numero_motor, tipo, color")
    .neq("estado", "entregado");
  const ficha = new Map<string, { chasis: string | null; numero_motor: string | null; tipo: string | null; color: string | null }>();
  if (!extra.error) {
    for (const row of (extra.data ?? []) as {
      id: string;
      chasis: string | null;
      numero_motor: string | null;
      tipo: string | null;
      color: string | null;
    }[]) {
      ficha.set(row.id, row);
    }
  }
  const { data: activos } = await sb.from("contratos").select("vehiculo_id").eq("estado", "activo");
  const ocupados = new Set(
    ((activos ?? []) as { vehiculo_id: string }[]).map((c) => c.vehiculo_id),
  );
  return ((veh ?? []) as unknown as FilaCarro[])
    .filter((v) => !ocupados.has(v.id))
    .map((v) => {
      const sigla = v.empresa?.codigo ? siglaEmpresa(v.empresa.codigo) : "";
      const base = sigla ? `${sigla} · ${v.numero}` : v.numero;
      const placa = v.placa ? ` · ${v.placa}` : "";
      const tec = ficha.get(v.id);
      return {
        id: v.id,
        label: `${base}${placa} (${v.estado})`,
        placa: v.placa,
        marca: v.marca,
        modelo: v.modelo,
        anio: v.anio,
        chasis: tec?.chasis ?? null,
        numeroMotor: tec?.numero_motor ?? null,
        tipo: tec?.tipo ?? null,
        color: tec?.color ?? null,
      };
    });
}
