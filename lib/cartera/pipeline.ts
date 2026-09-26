// Pipeline de cartera: registra conversaciones/mensajes, sube comprobantes a
// Storage, resuelve el contrato por # de carro y crea el registro de pago.
// Todo el dinero se maneja aquí (código determinista), no en el LLM.

import { createServerSupabase } from "@/lib/supabase/server";
import type { Comprobante } from "@/lib/ai/comprobante";
import { pagoEnOficinaTexto } from "@/lib/cartera/medios-pago";
import { hoyPanama, horaPanama, pasoCorte, fueraHorarioOperativo, fechaConDia, sumarDias, fechaContable, instantePanama, pagadoAtDesdeForm, esDomingo, esSabado } from "@/lib/cartera/fecha";
import { estadoCuentaContrato, money, cuotasAtraso } from "@/lib/cartera/estado-cuenta";
import { CUOTAS_PARA_TERMINACION } from "@/lib/cartera/clausulas";
import { pagosRecientesContrato } from "@/lib/cartera/pagos-dia";
import { normalizarTelefono, esTelefonoCanonico } from "@/lib/cartera/telefono";
import { textoComoSeAplico } from "./aplicar-pago";
import { cobroHoyContrato, MARCA_EXCEDENTE_SIN_CONCEPTO } from "./cobro-hoy";
import { validarComprobante, resumirAlertas, FRASE_PEDIR_CONFIRMACION, MARCA_REVISION_DOS_PAGOS, type Veredicto } from "@/lib/cartera/comprobante-validacion";
import { carroCompatibleConChat } from "@/lib/cartera/cruce";
import { detectarDiasViaje, textoTarifasInterior, type DestinoInterior } from "./salidas-interior";
import {
  inferirSalidaDelChat,
  idsVehiculoYCliente,
  registrarSalidaPendiente,
  salidasDelContrato,
} from "./salidas-aplicar";

const BUCKET = "comprobantes";

export type Conversacion = {
  id: string;
  wa_numero: string;
  cliente_id: string | null;
  vehiculo_id: string | null;
  contrato_id: string | null;
  etiqueta: string | null;
  modo: "agente" | "humano";
};

const SEL_CONV = "id, wa_numero, cliente_id, vehiculo_id, contrato_id, etiqueta, modo";

type VinculoContrato =
  | { estado: "ok"; contratoId: string; vehiculoId: string | null; etiqueta: string | null }
  | { estado: "ninguno" }
  | { estado: "varios"; cuantos: number };

/**
 * Contrato ACTIVO de un cliente → para vincular la conversación.
 * Si tiene más de uno (dos carros), NO se elige uno al azar: se marca ambiguo
 * para que una persona lo resuelva. Elegir mal significa darle al cliente las
 * cifras del carro equivocado.
 */
async function resolverContratoDeCliente(clienteId: string): Promise<VinculoContrato> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("contratos")
    .select("id, estado, vehiculo:vehiculos(id, numero)")
    .eq("cliente_id", clienteId)
    .limit(20);

  type Fila = { id: string; estado: string; vehiculo: { id: string; numero: string } | null };
  const filas = (data ?? []) as unknown as Fila[];
  const ok = (f: Fila): VinculoContrato => ({
    estado: "ok",
    contratoId: f.id,
    vehiculoId: f.vehiculo?.id ?? null,
    etiqueta: f.vehiculo ? `Carro ${f.vehiculo.numero}` : null,
  });

  // 1) Contrato ACTIVO (el caso normal: cliente que renta hoy).
  const activos = filas.filter((f) => f.estado === "activo");
  if (activos.length === 1) return ok(activos[0]);
  if (activos.length > 1) return { estado: "varios", cuantos: activos.length };

  // 2) Sin activo: un contrato CERRADO que todavía debe (ej. entregó el carro
  //    debiendo). Se le sigue cobrando esa deuda, sin cuota diaria.
  const cerrados = filas.filter((f) => f.estado !== "activo");
  if (cerrados.length === 0) return { estado: "ninguno" };
  const { data: saldos } = await sb
    .from("vw_saldo_contrato")
    .select("contrato_id, saldo_actual")
    .in("contrato_id", cerrados.map((c) => c.id));
  const deudaDe = new Map(
    ((saldos ?? []) as { contrato_id: string; saldo_actual: number | null }[]).map((s) => [s.contrato_id, Number(s.saldo_actual ?? 0)]),
  );
  const conDeuda = cerrados.filter((c) => (deudaDe.get(c.id) ?? 0) > 0.009);
  if (conDeuda.length === 1) return ok(conDeuda[0]);
  if (conDeuda.length > 1) return { estado: "varios", cuantos: conDeuda.length };
  return { estado: "ninguno" };
}

type VinculoCliente =
  | { estado: "ok"; clienteId: string }
  | { estado: "ninguno" }
  | { estado: "varios"; cuantos: number };

/**
 * Número de WhatsApp → cliente, por igualdad exacta sobre el teléfono
 * normalizado (migración 0009). Antes era un match por sufijo con limit(1),
 * que podía amarrar la conversación al cliente equivocado y hacer que el
 * agente le entregara a alguien el saldo de otra persona.
 */
async function resolverClientePorTelefono(waNumero: string): Promise<VinculoCliente> {
  const norm = normalizarTelefono(waNumero);
  if (!norm || !esTelefonoCanonico(norm)) return { estado: "ninguno" };

  const sb = createServerSupabase();
  const { data } = await sb
    .from("clientes")
    .select("id")
    .or(`wa_norm.eq.${norm},tel_norm.eq.${norm}`)
    .limit(5);

  const filas = (data ?? []) as { id: string }[];
  if (filas.length === 0) return { estado: "ninguno" };
  if (filas.length > 1) return { estado: "varios", cuantos: filas.length };
  return { estado: "ok", clienteId: filas[0].id };
}

/** Busca (o crea) la conversación de un número, vinculándola al cliente y su contrato. */
export async function obtenerConversacion(waNumero: string): Promise<Conversacion> {
  const sb = createServerSupabase();
  const { data: existente } = await sb
    .from("conversaciones")
    .select(SEL_CONV)
    .eq("wa_numero", waNumero)
    .maybeSingle();
  if (existente) {
    const c = existente as Conversacion;
    // Backfill: si ya tiene cliente pero aún no contrato, vincúlalo ahora.
    if (c.cliente_id && !c.contrato_id) {
      const r = await resolverContratoDeCliente(c.cliente_id);
      if (r.estado === "ok") {
        await sb.from("conversaciones")
          .update({ contrato_id: r.contratoId, vehiculo_id: r.vehiculoId, etiqueta: r.etiqueta })
          .eq("id", c.id);
        return { ...c, contrato_id: r.contratoId, vehiculo_id: r.vehiculoId, etiqueta: r.etiqueta };
      }
      if (r.estado === "varios") await marcarAmbiguo(c.id, motivoVariosContratos(r.cuantos));
    }
    return c;
  }

  // Nueva conversación: vincular cliente por teléfono normalizado + su contrato.
  const vCliente = await resolverClientePorTelefono(waNumero);
  const clienteId = vCliente.estado === "ok" ? vCliente.clienteId : null;

  let contratoId: string | null = null;
  let vehiculoId: string | null = null;
  let etiqueta: string | null = null;
  let motivo: string | null =
    vCliente.estado === "varios"
      ? `El número coincide con ${vCliente.cuantos} clientes: hay que verificar de quién es.`
      : null;

  if (clienteId) {
    const r = await resolverContratoDeCliente(clienteId);
    if (r.estado === "ok") {
      contratoId = r.contratoId;
      vehiculoId = r.vehiculoId;
      etiqueta = r.etiqueta;
    } else if (r.estado === "varios") {
      motivo = motivoVariosContratos(r.cuantos);
    }
  }

  const { data: creada, error } = await sb
    .from("conversaciones")
    .insert({
      wa_numero: waNumero,
      cliente_id: clienteId,
      contrato_id: contratoId,
      vehiculo_id: vehiculoId,
      etiqueta,
      // Sin vínculo cierto, el agente no tiene cifras y el caso necesita ojo humano.
      necesita_humano: motivo != null,
      motivo_escalada: motivo,
    })
    .select(SEL_CONV)
    .single();
  if (error) throw error;
  return creada as Conversacion;
}

function motivoVariosContratos(cuantos: number): string {
  return `El cliente tiene ${cuantos} contratos activos: hay que indicar a cuál carro corresponde este chat.`;
}

/** Vínculo dudoso (número o contrato ambiguo): que lo revise una persona. */
async function marcarAmbiguo(conversacionId: string, motivo: string): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ necesita_humano: true, motivo_escalada: motivo })
    .eq("id", conversacionId);
  await arrancarEspera(conversacionId);
}

function etiquetaPago(estado: string): string {
  if (estado === "conciliado" || estado === "manual") return "validado";
  if (estado === "pendiente") return "EN VALIDACIÓN (aún no baja el saldo)";
  if (estado === "rechazado") return "rechazado";
  return estado;
}

/**
 * Cargos del contrato que NO son la cuota diaria: reparaciones, multas,
 * afiliación, siniestros, etc. Es lo que el cliente discute ("¿qué es este
 * cobro?"). Van itemizados para que el agente pueda explicar cada uno.
 */
type CargoExtra = { concepto: string; monto: number; fecha: string };
async function cargosExtraDelContrato(contratoId: string): Promise<CargoExtra[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("tipo, concepto, concepto_codigo, monto, fecha")
    .eq("contrato_id", contratoId)
    .not("tipo", "in", "(renta,cuenta_diaria,acuerdo)")
    .order("fecha", { ascending: false })
    .limit(20);
  const filas = (data ?? []) as {
    tipo: string; concepto: string | null; concepto_codigo: string | null; monto: number; fecha: string;
  }[];
  return filas
    .filter((f) => Number(f.monto) > 0.009)
    .map((f) => ({
      concepto: f.concepto?.trim() || f.concepto_codigo || f.tipo,
      monto: Number(f.monto),
      fecha: f.fecha,
    }));
}

/** Resumen del contrato para el CONTEXTO del agente (cifras reales, no inventadas). */
export async function resumenContrato(contratoId: string): Promise<string | null> {
  const est = await estadoCuentaContrato(contratoId);
  if (!est) return null;

  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const manana = sumarDias(hoy, 1);
  const yaCorte = pasoCorte();
  const m = money;

  let cuentaTexto = "Para transferir, pídele al equipo la cuenta de su empresa.";
  if (est.empresaId) {
    const { data: cta } = await sb
      .from("cuentas_bancarias")
      .select("banco, numero_cuenta, tipo, titular")
      .eq("empresa_id", est.empresaId)
      .ilike("tipo", "AHORROS")
      .limit(1)
      .maybeSingle();
    const ct = cta as { banco: string; numero_cuenta: string; tipo: string; titular: string } | null;
    if (ct?.numero_cuenta) {
      cuentaTexto = `${ct.banco} · ${ct.tipo === "AHORROS" ? "Ahorros" : ct.tipo} · cuenta ${ct.numero_cuenta} · a nombre de ${ct.titular}`;
    }
  }

  const pagos = await pagosRecientesContrato(contratoId, 5);
  const tarifaPlenaDia = est.letra + est.penalidad;
  const domingos = est.cobraDomingo
    ? `SÍ cobra los domingos (cuota domingo ${m(est.cuotaDomingo || est.letra)})`
    : "NO cobra los domingos (domingos libres)";

  // Misma cifra que el WhatsApp / extracto (NO usar est.totalHoy a pelo).
  const cobro = await cobroHoyContrato(est);

  const lineas = [
    `FECHA Y HORA REALES (Panamá). Úsalas; NUNCA supongas otro día ni otra hora:`,
    `- Hoy es ${fechaConDia(hoy)}. Son las ${horaPanama()}.`,
    `- Mañana es ${fechaConDia(manana)}.`,
    yaCorte
      ? `- El corte de las 7:00 p.m. YA PASÓ hoy: si paga ahora, es sin descuento.`
      : `- Todavía NO son las 7:00 p.m.: si paga hoy antes de esa hora, conserva el descuento.`,
    `- EMERGENCIAS DEL CARRO: si reporta colisión/daño/seguro → Santiago +507 6929-1946; si es`,
    `  mecánica / no funciona → Néstor +507 6330-3437. Dale el número SIEMPRE (dentro o fuera de`,
    `  horario). Ahora son las ${horaPanama()}${fueraHorarioOperativo() ? " (fuera de 8:00–19:00)" : " (dentro de 8:00–19:00)"}.`,
    fueraHorarioOperativo()
      ? `- HORARIO CARTERA: AHORA está FUERA (antes de 8:00 a.m. o desde las 7:00 p.m.). Para temas de cobro/saldo/cuota/acuerdo NO entres a cobrar: dile que el horario de atención es de 8:00 a.m. a 7:00 p.m. Si ya mandó comprobante, el sistema lo registra; dile que Claudia lo valida cuando empiece su día. Emergencias del carro: sí da Santiago/Néstor.`
      : `- HORARIO CARTERA: AHORA está DENTRO (8:00 a.m. – 7:00 p.m.). Atiende cobranza con normalidad.`,
    ``,
    `DATOS EXACTOS del contrato de ESTE cliente (usa SOLO estos números; nunca inventes ni estimes otros):`,
    `- Cliente: ${est.clienteNombre}. Tratamiento: ${est.clienteTratamiento || est.clienteNombre.split(" ")[0] || "cliente"} (usa Sr./Sra. SOLO si viene en este tratamiento; si es solo el nombre, no inventes género).`,
    `- Carro: ${est.vehiculoNumero}`,
    `- Cuota diaria pagando PUNTUAL (antes de las 7:00 p.m.): ${m(est.letra)}.`,
    `- Si paga después del corte se le suman ${m(est.penalidad)} (pierde el descuento de ESE día).`,
    `- Días atrasados sin pagar quedan a tarifa plena (${m(tarifaPlenaDia)} por día, no ${m(est.letra)}).`,
    `- Domingos: ${domingos}.`,
    est.cuotaHoy > 0
      ? `- Hoy SÍ corre cuota (${m(est.cuotaHoy)}).`
      : `- Hoy NO corre cuota (día libre para este contrato).`,
    est.pagoHoy
      ? est.pagoPuntual
        ? `- Este cliente YA cubrió lo de hoy PUNTUAL (antes de las 7:00 p.m.), posiblemente en varios abonos. Eso YA está descontado del saldo.`
        : `- Este cliente abonó hoy ${m(est.pagadoHoy)} pero NO cubrió lo del día (cuota ${m(est.cuotaHoy)}${cobro.faltaAcuerdo > 0.009 ? ` + arreglo ${m(cobro.faltaAcuerdo)}` : ""}). Pierde el descuento de $${est.penalidad} de ESE día. El resto se arrastra.`
      : est.pendiente
        ? `- Este cliente mandó comprobante hoy por ${m(est.pendienteMonto)} y está EN VALIDACIÓN. AÚN NO está descontado del saldo. NO le digas que ya pagó ni que queda al día.`
        : `- Hoy NO tiene ningún pago validado todavía.`,
  ];

  // Contrato CERRADO (entregó el carro debiendo): solo se le cobra la deuda.
  if (est.estadoContrato !== "activo") {
    lineas.push(
      ``,
      `⚠️ CONTRATO CERRADO (estado: ${est.estadoContrato}). Este cliente YA ENTREGÓ el carro ${est.vehiculoNumero}.`,
      `- NO corre cuota diaria y NO hay "cuota de hoy": no le hables de cuota del día, de "hoy", de corte`,
      `  de las 7 p.m. ni de descuento por pago puntual. Nada de eso aplica ya.`,
      `- Solo tiene una DEUDA PENDIENTE de ${m(est.cuenta)} de cuando tenía el carro. Cóbrale ÚNICAMENTE`,
      `  ese saldo; puede pagarlo de una vez o en abonos. Cada pago validado baja esa deuda.`,
      `- Si pregunta cuánto debe: dile que su saldo pendiente es ${m(est.cuenta)} (deuda del carro que entregó).`,
    );
  } else if (est.devengadoHasta != null) {
    // Datos COMPLETOS: misma fuente que el extracto de WhatsApp (cobroHoy).
    const extraTxt = cobro.extraElegido
      ? `${cobro.extraElegido.etiqueta} ${m(cobro.extraElegido.montoHoy)} (${cobro.extraElegido.motivo})`
      : "ninguno hoy";
    lineas.push(
      ``,
      `RESUMEN DE LA CUENTA (para "cuánto debo hoy" cobra EXACTAMENTE el total de abajo; no lo recalcules):`,
      `- TOTAL A PAGAR HOY: ${m(cobro.totalCobrarHoy)}. Este es el único monto a cobrar (misma cifra del extracto WhatsApp).${esDomingo(hoyPanama()) ? " HOY ES DOMINGO: el compromiso de domingo SÍ puede ir en este total si está en el desglose." : " NO incluye el domingo (lun–sáb)."} NO le sumes la tarifa diaria ni el atraso otra vez.`,
      `- Desglose del extracto: ${cobro.desglose || "(sin líneas)"}.`,
      `- Ítem adicional cobrado hoy: ${extraTxt}.`,
      `- Tarifa de la letra diaria (precio del día, no es el saldo): ${m(est.cuotaHoy)}.`,
      `- Atraso de letra (sin domingo): ${m(est.pendienteAnterior)}.`,
      cobro.acuerdoSaldo > 0.009 || cobro.acuerdoHoy > 0.009
        ? `- ACUERDO DE PAGO: plan activo, saldo ${m(cobro.acuerdoSaldo)}. Cuota de hoy del acuerdo: ${m(cobro.acuerdoHoy)}. Aún falta hoy: ${m(cobro.faltaAcuerdo)}.${cobro.faltaAcuerdo > 0.009 ? " Eso YA está en el TOTAL si es el ítem del día." : " La cuota de hoy del acuerdo YA está cubierta; el plan sigue (saldo). Mencionalo si pregunta; NO lo vuelvas a sumar al total."}`
        : `- ACUERDO DE PAGO: no tiene plan activo.`,
      est.domingoSaldo > 0.009
        ? esDomingo(hoyPanama())
          ? `- DOMINGO HOY: ${m(est.domingoSaldo)} — solo súmalo si aparece en el desglose del extracto.`
          : `- DOMINGO PENDIENTE: ${m(est.domingoSaldo)}. Menciónalo como pendiente. NUNCA lo sumes al total a pagar hoy (lun–sáb).`
        : `- DOMINGO PENDIENTE: $0.`,
      `- Puede pagar en 2 o 3 abonos el mismo día: la SUMA es la que cuenta. Si a las 7 p.m.`,
      `  no cubrió lo del extracto de hoy (letra + el un ítem adicional del día), pierde el descuento de ese día y el resto se va a mañana.`,
      yaCorte || est.pagoPuntual || est.pendiente
        ? `- Ese monto ya considera la situación de hoy.`
        : `- Si a las 7 p.m. no ha cubierto lo de hoy (aprox. ledger): ${m(est.totalHoyTarde)}. El cobro oficial sigue siendo ${m(cobro.totalCobrarHoy)} hasta nuevo extracto.`,
      est.cuotaManana > 0
        ? `- Si NO paga hoy y paga mañana (aprox.): ${m(est.totalManana)}.`
        : `- Mañana no corre cuota nueva; si no paga hoy, mañana seguiría cerca de ${m(est.totalHoyTarde)}.`,
      `- Cada pago VALIDADO ya está descontado. Un comprobante en validación NO baja el saldo.`,
      `- Si te piden un plazo que no está aquí, NO lo calcules: dales estas cifras y pregunta`,
      `  si con eso les sirve. No pases a una persona en el primer intento.`,
    );

    // Pago adelantado por semana — ya calculado por el código (el agente no multiplica).
    const diasSemana = est.cobraDomingo ? 7 : 6;
    const valorSemana = est.letra * diasSemana;
    lineas.push(
      ``,
      `PAGO ADELANTADO POR SEMANA (si pide "pagar la semana adelantada"):`,
      `- Una semana son ${diasSemana} días (${est.cobraDomingo ? "incluye domingo" : "domingo libre"}) a ${m(est.letra)} = ${m(valorSemana)}. Eso es SOLO las cuotas de la semana; no incluye lo que ya deba.`,
      `- Si quiere ponerse al día HOY y además dejar la semana adelantada: ${m(cobro.totalCobrarHoy)} + ${m(valorSemana)} = ${m(cobro.totalCobrarHoy + valorSemana)}.`,
      `- Para OTROS plazos (2 semanas, un mes, X días), NO lo calcules: dales la semana y el día;`,
      `  no pases a una persona salvo que insistan en esa cuenta exacta.`,
    );
  } else {
    // Datos INCOMPLETOS: el saldo acumulado NO es confiable. No entregamos un total;
    // solo la cuota diaria, y se escala cualquier pregunta de saldo/total. En cobranza
    // es peor decir una cifra equivocada que pedir un momento para confirmarla.
    lineas.push(
      ``,
      `SALDO NO CONSOLIDADO (MUY IMPORTANTE — no des cifras de saldo):`,
      `- El sistema todavía NO tiene consolidado el saldo acumulado de este contrato, así que`,
      `  NO tienes un total confiable. Sí puedes decir su CUOTA DIARIA (${m(est.letra)} puntual,`,
      `  ${m(tarifaPlenaDia)} si va atrasado) y cómo funciona el pago (horario, corte de 7 p.m.).`,
      `- Si pregunta cuánto debe, su saldo, su total, o lo discute: NO le des NINGUNA cifra de`,
      `  saldo/total. Di "El saldo se lo confirmo en un momento" (sin decir "el sistema")`,
      `  y marca pasar_a_humano = true.`,
    );
  }

  // Mora fuerte: si debe muchas cuotas, el agente cobra con firmeza y cita la cláusula.
  const atrasadas = cuotasAtraso(est);
  if (est.estadoContrato === "activo" && atrasadas >= CUOTAS_PARA_TERMINACION) {
    lineas.push(
      ``,
      `🔴 MORA FUERTE: este cliente debe ${atrasadas} cuotas. COBRA CON FIRMEZA (sin ablandarte):`,
      `- Dile el monto exacto que debe y pídele que CONSIGNE HOY, cuanto antes, a la cuenta de su empresa.`,
      `- Recuérdale la cláusula: ${CUOTAS_PARA_TERMINACION} cuotas sin pagar permiten dar por terminado el`,
      `  contrato y RETIRAR el vehículo, además de reporte a la APC (buró) y cobro jurídico. Cítalo con`,
      `  respeto pero directo; no amenaces ni inventes otras consecuencias.`,
    );
  }

  // Pagos adelantados: si tiene días pagados por adelantado, HOY no debe pagar.
  if (est.diasAdelantados > 0 && est.estadoContrato === "activo") {
    lineas.push(
      ``,
      `✅ CLIENTE ADELANTADO: tiene ${est.diasAdelantados} día(s) de cuota PAGADOS POR ADELANTADO` +
        (est.cubiertoHasta ? ` (cubierto hasta el ${fechaConDia(est.cubiertoHasta)})` : "") + `.`,
      `HOY NO tiene que pagar; su cuota de hoy ya está cubierta. Si pregunta cuánto debe o si paga`,
      `hoy, felicítalo y dile que ya está al día y tiene cubiertos los próximos ${est.diasAdelantados} día(s)` +
        (est.cubiertoHasta ? ` (hasta el ${fechaConDia(est.cubiertoHasta)})` : "") + `. No le cobres de más.`,
    );
  }

  // Cumpleaños libre (cláusula del contrato). El motor ya lo aplicó en las cifras;
  // aquí solo se le dice al agente qué responder. No aplica en contratos cerrados.
  if (est.estadoContrato !== "activo") {
    // contrato cerrado: sin beneficio de cumpleaños (no hay cuota que perdonar).
  } else if (est.esCumpleanos && est.cumpleLibreAplica) {
    lineas.push(
      ``,
      `🎂 HOY ES EL CUMPLEAÑOS de este cliente y CUMPLE las condiciones (al día + 1 mes): hoy su`,
      `cuota es LIBRE ($0), ya está aplicado. Felicítalo y confírmale que hoy NO paga cuota. (Si`,
      `tiene saldo anterior, ese sigue; lo libre es solo la cuota de hoy.)`,
    );
  } else if (est.esCumpleanos && !est.cumpleLibreAplica) {
    lineas.push(
      ``,
      `🎂 Hoy es el cumpleaños de este cliente, PERO el beneficio de cumpleaños libre NO aplica`,
      `porque ${est.cumpleMotivo ?? "no cumple las condiciones"}. Felicítalo, pero explícale con tacto`,
      `que para el día libre debe estar al día y con al menos 1 mes; hoy sí corre la cuota normal.`,
    );
  } else if (est.fechaNacimiento) {
    lineas.push(
      ``,
      `Cumpleaños registrado de este cliente: ${est.fechaNacimiento}. Si dice que "hoy" es su`,
      `cumpleaños y NO coincide con esa fecha, dile con amabilidad que según el registro su`,
      `cumpleaños es otro día (no inventes la fecha, usa la registrada).`,
    );
  } else {
    lineas.push(
      ``,
      `No tenemos registrada la fecha de cumpleaños de este cliente. Si reclama el beneficio de`,
      `cumpleaños libre, reconoce que existe (al día + 1 mes de permanencia) y pásalo a una persona`,
      `para verificar la fecha (pasar_a_humano = true). No lo apliques tú.`,
    );
  }

  // Cargos aparte de la cuota diaria (reparaciones, multas, afiliación…): itemizados
  // para que el agente pueda EXPLICAR y DEFENDER cada cobro cuando el cliente lo discute.
  if (est.devengadoHasta != null) {
    const extras = await cargosExtraDelContrato(contratoId);
    if (extras.length > 0) {
      lineas.push(
        ``,
        `CARGOS EN LA CUENTA aparte de las cuotas diarias (para cuando pregunte "¿por qué debo tanto?" o discuta un cobro):`,
        ...extras.map((x) => `- ${m(x.monto)} · ${x.concepto} · ${fechaConDia(x.fecha)}`),
        `Esos cargos NO son la letra del día. El domingo se lista; solo entra al total si este carro lo tiene como prioridad de abono.`,
        `Si el cliente pregunta qué compone su saldo, explícaselo con este detalle. No lo enumeres si no lo pide.`,
      );
    }

    lineas.push(
      ``,
      `REGLA DE COBRO DIARIO (OBLIGATORIA — “cuánto debo HOY” / extracto):`,
      `- La cifra oficial es TOTAL A PAGAR HOY de arriba (${m(cobro.totalCobrarHoy)}) y su desglose. No inventes otra.`,
      `- SIEMPRE se cobra: letra del día + saldo anterior de letra + recargo/cierre de semana si aplica.`,
      `- ÁRBOL DE UN PAGO (estricto, por carro): 1) recargo por no pago  2) un solo concepto más. Si el acuerdo tiene saldo, ESE es el concepto hasta que quede en cero: mantenimiento y lo demás se listan pendientes y no entran al total. Si no hay acuerdo, el de menor valor (o el que el carro eligió)  3) letra de hoy  4) si sobra y NO es sábado (o el cliente ya dijo que es adelanto de letra): días siguientes, acuerdo de ese día y luego la letra.`,
      `- Si el cliente NOMBRA el destino del excedente y ese concepto existe (domingo, acuerdo, etc.), SE APLICA AHÍ. No lo dejes en letra. Confírmalo y marca pasar_a_humano con motivo "Excedente a <concepto>".`,
      esSabado(hoyPanama())
        ? `- HOY ES SÁBADO: si el pago es mayor que la letra diaria (${m(est.letra)}), PREGUNTA a dónde va el excedente antes de asignarlo. Lo habitual es el domingo por adelantado, o la letra del lunes. Si no contesta, queda sin concepto.`
        : `- Sábado: si ese día el pago supera la letra diaria, se pregunta el destino del excedente (domingo adelantado o letra siguiente). No se asume.`,
      `- Si tiene plan de acuerdo con saldo pero la cuota de hoy YA está pagada: dilo (saldo del plan), NO lo sumes otra vez.`,
      `- El domingo no entra al total, salvo que la prioridad de este carro sea domingo.`,
      `- Puedes LISTAR todo lo que debe (para claridad), pero el TOTAL solo incluye letra/recargo/cierre + ese un ítem.`,
      `- NO sumes mantenimiento + acuerdos + domingo el mismo día en el total de hoy.`,
      `- NUNCA inventes una línea “abono” con lo pagado hoy: eso ya está descontado.`,
      `- PAGO MAYOR AL TOTAL: si paga más de ${m(cobro.totalCobrarHoy)}, pregunta a dónde va el excedente.`,
      cobro.acuerdoSaldo > 0.009 || (est.domingoSaldo ?? 0) > 0.009
        ? `- Conceptos a los que SÍ puede abonar el excedente (parcial vale):${cobro.acuerdoSaldo > 0.009 ? ` acuerdo (saldo ${m(cobro.acuerdoSaldo)})` : ""}${(est.domingoSaldo ?? 0) > 0.009 ? ` domingo (${m(est.domingoSaldo)})` : ""}.`
        : `- NO tiene acuerdo ni domingo ni otro concepto: el excedente es pago adelantado de una letra diaria. No le ofrezcas otro destino.`,
      `- Si nombra un concepto que no está en esta lista, no lo aceptes: el comprobante queda para revisión manual del equipo.`,
      `- Si no dice el destino y SÍ tiene conceptos, el excedente queda sin concepto y solo lo aprueba el equipo asignándolo.`,
      `- Clientes nuevos: pueden deber panapass/domingos de entrada y abono inicial; respeta las cifras del sistema.`,
    );
  }

  // Cuántas CUOTAS (número, no dinero) ha pagado — cuando pregunta "¿cuántas cuotas llevo?".
  if (est.devengadoHasta != null && est.letra > 0) {
    const [pg, ext, ct] = await Promise.all([
      sb.from("pagos").select("monto").eq("contrato_id", contratoId).in("estado_conciliacion", ["conciliado", "manual"]),
      sb.from("cargos").select("monto").eq("contrato_id", contratoId).not("tipo", "in", "(renta,cuenta_diaria,acuerdo)"),
      sb.from("contratos").select("num_cuotas_total").eq("id", contratoId).maybeSingle(),
    ]);
    const pagadoTotal = ((pg.data ?? []) as { monto: number }[]).reduce((s, p) => s + Number(p.monto || 0), 0);
    const extrasTotal = ((ext.data ?? []) as { monto: number }[]).reduce((s, x) => s + Number(x.monto || 0), 0);
    const rentaAbonada = Math.max(pagadoTotal - extrasTotal, 0);
    const cuotasPagadas = Math.round(rentaAbonada / est.letra);
    const numTotal = (ct.data as { num_cuotas_total: number | null } | null)?.num_cuotas_total ?? null;
    lineas.push(
      ``,
      `CUOTAS PAGADAS (si pregunta "¿cuántas cuotas he pagado?" o "¿cuántas llevo?" — responde el NÚMERO de cuotas, no solo el dinero):`,
      `- Ha pagado el equivalente a aproximadamente ${cuotasPagadas} cuotas de ${m(est.letra)} (total abonado a renta: ${m(rentaAbonada)}).`,
      numTotal
        ? `- El contrato es de ${numTotal} cuotas en total; le faltarían alrededor de ${Math.max(numTotal - cuotasPagadas, 0)}.`
        : `- No tengo el total de cuotas del contrato; no lo inventes.`,
      `- Es un APROXIMADO (dilo como "aproximadamente"): el dinero de multas/reparaciones no cuenta como cuota.`,
    );
  }

  if (pagos.length > 0) {
    lineas.push(``, `PAGOS RECIENTES DE ESTE CONTRATO (para si pregunta por un comprobante):`);
    for (const p of pagos) {
      const dia = fechaContable(p.pagado_at);
      const hora = horaPanama(new Date(p.pagado_at));
      const extra = p.asignaciones.length
        ? ` · ${textoComoSeAplico({ asignaciones: p.asignaciones, sobrante: 0, totalAplicado: p.asignaciones.reduce((s, a) => s + a.aplicado, 0) }, m)}`
        : "";
      lineas.push(
        `- ${dia} ${hora}: ${m(p.monto)} · ${etiquetaPago(p.estado)}${p.origen ? ` (${p.origen})` : ""}${extra}`,
      );
    }
  }

  lineas.push(
    ``,
    `CÓMO PUEDE PAGAR ESTE CLIENTE (dale la opción que necesite):`,
    `- Su carro es de la empresa ${est.empresaNombre ?? est.empresa ?? "—"}. Para TRANSFERIR, la cuenta de SU empresa es:`,
    `  ${cuentaTexto}.`,
    `  Debe poner el número de carro (${est.vehiculoNumero}) en el comentario y enviar el comprobante por aquí.`,
    `  IMPORTANTE: dale SOLO la cuenta de su empresa; jamás la de otra empresa.`,
    pagoEnOficinaTexto(),
    ``,
    `CÓMO SE APLICA UN ABONO (orden fijo; el cliente NO elige, EXCEPTO la salida al interior):`,
    `- Primero arreglo, luego saldo anterior, luego recargo, al final la cuota de hoy.`,
    `- Si el pago es de una SALIDA AL INTERIOR, va a ese rubro y NO cubre la cuota del día.`,
    `- NUNCA preguntes a qué lo quiere aplicar (salvo para confirmar el destino de una salida). Si el CONTEXTO dice cómo se partió un pago, INFORMALO.`,
    `- Si discute esa asignación: explícaselo una vez. Solo si insiste, marca pasar_a_humano = true.`,
    ``,
    textoTarifasInterior(),
  );

  const salidas = await salidasDelContrato(contratoId, 8);
  if (salidas.length > 0) {
    lineas.push(``, `SALIDAS AL INTERIOR DE ESTE CARRO (para decirle si ya pagó / si tiene aval):`);
    for (const s of salidas) {
      const st =
        s.estado === "autorizada"
          ? "AVAL DADO — puede salir"
          : s.estado === "rechazada"
            ? "rechazada"
            : "pago recibido, AVAL PENDIENTE del equipo";
      lineas.push(`- ${s.fecha} · ${s.destino} · ${m(Number(s.monto))} · ${st}`);
    }
  }

  return lineas.join("\n");
}

/** ¿La ventana de 24h está abierta? (el cliente escribió en las últimas 24h). */
export function ventanaAbierta(ultimoEntranteAt: string | null | undefined): boolean {
  if (!ultimoEntranteAt) return false;
  return Date.now() - new Date(ultimoEntranteAt).getTime() < 24 * 60 * 60 * 1000;
}

/**
 * ¿Llegó una imagen (comprobante) entrante en esta conversación en los últimos
 * `ventanaMs`? Sirve para coalescer "foto + caption": si el cliente manda una
 * foto y un textito casi al tiempo, no se responde dos veces.
 */
export async function hayImagenEntranteReciente(conversacionId: string, ventanaMs: number): Promise<boolean> {
  const sb = createServerSupabase();
  const desde = new Date(Date.now() - ventanaMs).toISOString();
  const { data } = await sb
    .from("mensajes")
    .select("id")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "in")
    .eq("tipo", "image")
    .gte("created_at", desde)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Arranca el reloj de espera si no estaba corriendo. No lo reinicia: lo que
 * importa es desde CUÁNDO espera el cliente, no la última vez que se escaló.
 */
async function arrancarEspera(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ escalada_at: new Date().toISOString() })
    .eq("id", conversacionId)
    .is("escalada_at", null);
}

/** El equipo toma el chat: el agente deja de responder en esta conversación. */
export async function tomarChat(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ modo: "humano", necesita_humano: false, escalada_at: null })
    .eq("id", conversacionId);
}

/** El equipo devuelve el chat al agente. */
export async function devolverAlAgente(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ modo: "agente", necesita_humano: false, motivo_escalada: null, escalada_at: null })
    .eq("id", conversacionId);
}

/**
 * El agente pidió ayuda humana, PERO sigue respondiendo hasta que alguien
 * pulse “Tomar chat”. Solo marca la campana; no cambia `modo`.
 */
export async function marcarEscalada(conversacionId: string, motivo: string | null): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ necesita_humano: true, motivo_escalada: motivo })
    .eq("id", conversacionId);
  await arrancarEspera(conversacionId);
}

/** Marca que hay un mensaje nuevo del cliente esperando a la persona que lleva el chat. */
export async function marcarNecesitaHumano(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb.from("conversaciones").update({ necesita_humano: true }).eq("id", conversacionId);
  await arrancarEspera(conversacionId);
}

/**
 * El agente le prometió al cliente que alguien le escribe (por una falla o
 * por un caso que no puede resolver). Sin esto la promesa no le llega a nadie.
 */
export async function marcarPendienteDeRespuesta(
  conversacionId: string,
  motivo: string,
): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ necesita_humano: true, motivo_escalada: motivo })
    .eq("id", conversacionId);
  await arrancarEspera(conversacionId);
}

/** Conversaciones esperando a una persona desde hace más de `minutos`. */
export async function conversacionesEnEspera(minutos: number): Promise<number> {
  const sb = createServerSupabase();
  const limite = new Date(Date.now() - minutos * 60 * 1000).toISOString();
  const { count } = await sb
    .from("conversaciones")
    .select("*", { count: "exact", head: true })
    .eq("necesita_humano", true)
    .lt("escalada_at", limite);
  return count ?? 0;
}

/**
 * Reclama un mensaje entrante como "en proceso" usando el UNIQUE de
 * wa_message_id como candado. Si Meta reintenta el webhook, el segundo intento
 * choca con el unique y devuelve null → no se reprocesa (no duplica pagos).
 * Devuelve el id del mensaje si lo reclamó, o null si ya existía.
 */
export async function reclamarMensajeEntrante(opts: {
  conversacionId: string;
  waMessageId?: string | null;
  tipo: "text" | "image" | "audio";
  texto: string;
}): Promise<string | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("mensajes")
    .insert({
      conversacion_id: opts.conversacionId,
      direccion: "in",
      tipo: opts.tipo,
      texto: opts.texto,
      wa_message_id: opts.waMessageId ?? null,
    })
    .select("id")
    .single();
  if (error) return null; // violación de unique (wa_message_id) → duplicado

  const ahora = new Date().toISOString();
  // no_leidos: se incrementa en SQL para evitar condiciones de carrera.
  const { data: conv } = await sb
    .from("conversaciones")
    .select("no_leidos")
    .eq("id", opts.conversacionId)
    .maybeSingle();
  const noLeidos = Number((conv as { no_leidos?: number } | null)?.no_leidos ?? 0) + 1;
  await sb
    .from("conversaciones")
    .update({
      ultimo_mensaje_at: ahora,
      ultimo_entrante_at: ahora, // el cliente escribió → abre/renueva la ventana de 24h
      ultimo_texto: opts.texto.slice(0, 140),
      no_leidos: noLeidos,
    })
    .eq("id", opts.conversacionId);
  return data.id as string;
}

/** El equipo abrió el chat: limpia el contador de no leídos. */
export async function marcarLeida(conversacionId: string): Promise<void> {
  const sb = createServerSupabase();
  await sb.from("conversaciones").update({ no_leidos: 0 }).eq("id", conversacionId);
}

/** Completa un mensaje ya reclamado (imagen del comprobante, audio o transcripción). */
export async function completarMensaje(
  mensajeId: string,
  patch: {
    mediaUrl?: string | null;
    pagoId?: string | null;
    texto?: string;
    tipo?: "text" | "image" | "audio" | "system";
  },
): Promise<void> {
  const sb = createServerSupabase();
  const upd: Record<string, unknown> = {};
  if (patch.mediaUrl !== undefined) upd.media_url = patch.mediaUrl;
  if (patch.pagoId !== undefined) upd.pago_id = patch.pagoId;
  if (patch.texto !== undefined) upd.texto = patch.texto;
  if (patch.tipo !== undefined) upd.tipo = patch.tipo;
  if (Object.keys(upd).length === 0) return;
  await sb.from("mensajes").update(upd).eq("id", mensajeId);

  if (patch.texto) {
    const { data: row } = await sb.from("mensajes").select("conversacion_id").eq("id", mensajeId).maybeSingle();
    if (row?.conversacion_id) {
      await sb
        .from("conversaciones")
        .update({ ultimo_texto: patch.texto.slice(0, 140) })
        .eq("id", row.conversacion_id);
    }
  }
}

/** Registra un mensaje y actualiza el resumen de la conversación. */
export async function registrarMensaje(opts: {
  conversacionId: string;
  direccion: "in" | "out";
  tipo?: "text" | "image" | "system" | "audio";
  texto?: string | null;
  mediaUrl?: string | null;
  waMessageId?: string | null;
  pagoId?: string | null;
  enviadoPor?: string | null;
}): Promise<{ nuevo: boolean }> {
  const sb = createServerSupabase();

  // Idempotencia: si ya registramos este wa_message_id, no repetir.
  if (opts.waMessageId) {
    const { data: dup } = await sb
      .from("mensajes")
      .select("id")
      .eq("wa_message_id", opts.waMessageId)
      .maybeSingle();
    if (dup) return { nuevo: false };
  }

  await sb.from("mensajes").insert({
    conversacion_id: opts.conversacionId,
    direccion: opts.direccion,
    tipo: opts.tipo ?? "text",
    texto: opts.texto ?? null,
    media_url: opts.mediaUrl ?? null,
    wa_message_id: opts.waMessageId ?? null,
    pago_id: opts.pagoId ?? null,
    enviado_por: opts.enviadoPor ?? null,
  });

  const resumen =
    opts.texto ??
    (opts.tipo === "image" ? "📷 Comprobante" : opts.tipo === "audio" ? "🎤 Nota de voz" : "Mensaje");
  await sb
    .from("conversaciones")
    .update({
      ultimo_mensaje_at: new Date().toISOString(),
      ultimo_texto: resumen.slice(0, 140),
    })
    .eq("id", opts.conversacionId);

  return { nuevo: true };
}

/**
 * Copia al hilo de /cartera/conversaciones un WhatsApp que ya salió.
 * El fallo de esta copia no debe tumbar el envío: el mensaje ya está en Meta.
 */
export async function espejarEnChat(waNumero: string, texto: string, enviadoPor = "sistema"): Promise<void> {
  try {
    const conv = await obtenerConversacion(waNumero);
    await registrarMensaje({
      conversacionId: conv.id,
      direccion: "out",
      tipo: "text",
      texto,
      enviadoPor,
    });
  } catch (err) {
    console.error("[chat] no pude guardar el mensaje enviado:", err instanceof Error ? err.message : err);
  }
}

/** Últimos mensajes de la conversación (para darle memoria al agente). */
export async function historialReciente(
  conversacionId: string,
  limite = 10,
): Promise<{ direccion: "in" | "out"; texto: string }[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("mensajes")
    .select("direccion, texto, tipo")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: false })
    .limit(limite);
  const filas = ((data ?? []) as { direccion: "in" | "out"; texto: string | null; tipo: string }[])
    .filter((m) => m.tipo !== "system" && m.texto)
    .reverse();
  return filas.map((m) => ({ direccion: m.direccion, texto: m.texto as string }));
}

/**
 * Notas internas del sistema (ej. "Pago en oficina registrado: $30").
 * NO son turnos de la conversación —nadie las dijo— así que van al CONTEXTO,
 * no al historial. Antes se filtraban y se perdían: el agente no se enteraba
 * de que el cliente había pagado en la oficina.
 */
export async function notasRecientes(conversacionId: string, limite = 5): Promise<string[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("mensajes")
    .select("texto, created_at")
    .eq("conversacion_id", conversacionId)
    .eq("tipo", "system")
    .order("created_at", { ascending: false })
    .limit(limite + DIAGNOSTICO.length);
  return ((data ?? []) as { texto: string | null }[])
    .map((m) => m.texto)
    .filter((t): t is string => Boolean(t) && !DIAGNOSTICO.some((p) => t!.startsWith(p)))
    .slice(0, limite)
    .reverse();
}

/**
 * Notas que son diagnóstico para el equipo, NO contexto para el agente.
 * La del guard es crítica: lleva dentro el texto que se bloqueó, así que
 * reinyectarla convertiría la cifra inventada en una cifra "permitida" en el
 * turno siguiente — el guard se estaría autorizando a sí mismo.
 */
const DIAGNOSTICO = ["⚠️ ENVÍO FALLÓ", "🛡️ Respuesta bloqueada"];

/** Sube la imagen del comprobante al bucket privado. Devuelve el path. */
export async function subirComprobante(bytes: Buffer, mime: string): Promise<string> {
  const sb = createServerSupabase();
  const ext = mime.includes("png") ? "png" : "jpg";
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Nota de voz del cliente (OGG/Opus de WhatsApp) para escucharla en el inbox. */
export async function subirAudioChat(
  conversacionId: string,
  bytes: Buffer,
  mime: string,
): Promise<string> {
  const sb = createServerSupabase();
  const raw = (mime ?? "audio/ogg").toLowerCase();
  const contentType =
    raw.includes("mpeg") || raw.includes("mp3") ? "audio/mpeg"
    : raw.includes("mp4") || raw.includes("m4a") || raw.includes("aac") ? "audio/mp4"
    : raw.includes("wav") ? "audio/wav"
    : raw.includes("webm") ? "audio/webm"
    : "audio/ogg";
  const ext =
    contentType.includes("mpeg") ? "mp3"
    : contentType.includes("mp4") ? "m4a"
    : contentType.includes("wav") ? "wav"
    : contentType.includes("webm") ? "webm"
    : "ogg";
  const path = `chat-audio/${conversacionId}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

type ResolucionCarro = {
  vehiculoId: string | null;
  contratoId: string | null;
  clienteId: string | null;
  etiqueta: string | null;
  estado: "ok" | "sin_contrato" | "ambiguo" | "sin_carro";
};

/**
 * Si el cliente responde solo el # de carro tras "¿de qué carro?", anota ese
 * carro en el último comprobante pendiente sin contrato (sigue en revisión).
 * Devuelve el número anotado, o null si no aplica.
 */
export async function anexarCarroAComprobantePendiente(
  conversacion: Conversacion,
  texto: string,
): Promise<string | null> {
  const t = (texto ?? "").trim();
  if (!t || t.length > 24) return null;
  // "G45", "carro 144", "144", "GD G32"…
  if (!/^(carro\s*)?[a-z]{0,3}\s*\d{1,4}$/i.test(t.replace(/\s+/g, " ").trim())) return null;

  const hist = await historialReciente(conversacion.id, 8);
  const ultimoOut = [...hist].reverse().find((m) => m.direccion === "out");
  if (!ultimoOut || !/de qu[eé] carro/i.test(ultimoOut.texto)) return null;

  const r = await resolverContratoPorCarro(t);
  if (r.estado === "sin_carro") return null;
  const numero =
    r.etiqueta?.replace(/^carro\s+/i, "") ??
    t.replace(/^carro\s+/i, "").trim().toUpperCase();

  const sb = createServerSupabase();
  // Pagos pendientes recientes de este chat (misma ventana ~2h) sin contrato.
  const desde = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: pagos } = await sb
    .from("pagos")
    .select("id, notas, numero_carro")
    .eq("estado_conciliacion", "pendiente")
    .is("contrato_id", null)
    .eq("origen", "comprobante")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(5);

  const propio = (pagos ?? []).find((p) =>
    String((p as { notas?: string }).notas ?? "").includes(conversacion.wa_numero),
  ) ?? (pagos ?? [])[0];
  if (!propio) return null;

  const notasPrev = String((propio as { notas?: string }).notas ?? "");
  const { error } = await sb
    .from("pagos")
    .update({
      numero_carro: numero,
      notas: `${notasPrev} · Cliente indicó carro ${numero}.`.trim(),
    })
    .eq("id", (propio as { id: string }).id);
  if (error) return null;

  await marcarAmbiguo(
    conversacion.id,
    `Comprobante pendiente: cliente indicó carro ${numero}. Revisar en Pagos.`,
  );
  return numero;
}

/** # de carro (del comentario, chat u oficina) → vehículo → contrato ACTIVO.
 *  `g26` y `G26` son el mismo carro Gold; no se confunden con el Autolujo `26`.
 */
export async function resolverContratoPorCarro(numeroCarro: string | null): Promise<ResolucionCarro> {
  const vacio: ResolucionCarro = {
    vehiculoId: null, contratoId: null, clienteId: null, etiqueta: null, estado: "sin_carro",
  };
  if (!numeroCarro) return vacio;
  const sb = createServerSupabase();

  const raw = String(numeroCarro).trim().replace(/^carro\s+/i, "");
  if (!raw) return vacio;
  const digits = raw.replace(/\D/g, "");
  const traeLetra = /[a-z]/i.test(raw);
  const rawUp = raw.toUpperCase();

  const candidatos = new Set<string>([raw, rawUp]);
  if (digits) {
    candidatos.add(digits);
    candidatos.add(`G${digits}`);
    candidatos.add(`g${digits}`);
  }

  const { data: vehs } = await sb
    .from("vehiculos")
    .select("id, numero, empresa:empresas(codigo)")
    .in("numero", [...candidatos]);
  if (!vehs?.length) return { ...vacio, estado: "sin_carro" };

  type Veh = (typeof vehs)[number];
  const porNumero = (pred: (n: string) => boolean) => vehs.filter((v) => pred(v.numero));

  // 1) Match exacto sin importar mayúsculas: g26 → G26.
  let elegidos: Veh[] = porNumero((n) => n.toUpperCase() === rawUp);

  // 2) Escribió con letra (g26 / G26 / gd26): solo carros con prefijo, nunca el "26" puro.
  if (!elegidos.length && traeLetra && digits) {
    elegidos = porNumero(
      (n) => /[a-z]/i.test(n) && n.replace(/\D/g, "") === digits,
    );
    // Preferir G{digits} si hay varios (G26 vs algo raro).
    const gExact = elegidos.filter((v) => v.numero.toUpperCase() === `G${digits}`);
    if (gExact.length) elegidos = gExact;
  }

  // 3) Solo dígitos (26): primero el numérico exacto; si no existe, el Gold G26.
  if (!elegidos.length && digits) {
    elegidos = porNumero((n) => n === digits);
    if (!elegidos.length) {
      elegidos = porNumero((n) => n.toUpperCase() === `G${digits}`);
    }
  }

  if (!elegidos.length) elegidos = vehs;

  const vehIds = elegidos.map((v) => v.id);
  const { data: contratos } = await sb
    .from("contratos")
    .select("id, cliente_id, vehiculo_id")
    .in("vehiculo_id", vehIds)
    .eq("estado", "activo");

  const numeroEtiqueta = elegidos[0].numero;
  const etiqueta = `Carro ${numeroEtiqueta}`;
  if (!contratos?.length) {
    return {
      vehiculoId: elegidos[0].id,
      contratoId: null,
      clienteId: null,
      etiqueta,
      estado: "sin_contrato",
    };
  }
  if (contratos.length > 1) {
    return { vehiculoId: null, contratoId: null, clienteId: null, etiqueta, estado: "ambiguo" };
  }
  const c = contratos[0];
  const veh = elegidos.find((v) => v.id === c.vehiculo_id) ?? elegidos[0];
  return {
    vehiculoId: c.vehiculo_id,
    contratoId: c.id,
    clienteId: c.cliente_id,
    etiqueta: `Carro ${veh.numero}`,
    estado: "ok",
  };
}

type ResultadoPago = {
  /** null cuando no se creó pago (comprobante duplicado). */
  pagoId: string | null;
  comprobantePath: string;
  resolucion: ResolucionCarro;
  estadoConciliacion: "pendiente" | "manual" | "duplicado";
  veredicto: Veredicto;
  salida?: { destino: string; monto: number } | null;
};

/** Empresa dueña del vehículo — para cruzar la cuenta destino del comprobante. */
async function empresaDelVehiculo(vehiculoId: string | null): Promise<string | null> {
  if (!vehiculoId) return null;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("vehiculos")
    .select("empresa_id")
    .eq("id", vehiculoId)
    .maybeSingle();
  return (data as { empresa_id: string } | null)?.empresa_id ?? null;
}

/**
 * Flujo completo de un comprobante: sube imagen, resuelve carro/contrato,
 * valida contra fraude y crea el pago (pendiente de conciliación).
 *
 * La imagen se guarda SIEMPRE, incluso si el comprobante se rechaza: es la
 * evidencia de lo que el cliente mandó.
 */
export async function procesarPagoComprobante(opts: {
  conversacion: Conversacion;
  comprobante: Comprobante;
  bytes: Buffer;
  mime: string;
  /** Imagen ya subida a Storage (para varios comprobantes en una misma foto). */
  path?: string;
}): Promise<ResultadoPago> {
  const sb = createServerSupabase();
  const { conversacion, comprobante, bytes, mime } = opts;

  const path = opts.path ?? (await subirComprobante(bytes, mime));
  const porCarro = await resolverContratoPorCarro(comprobante.numero_carro);

  // Número del chat (ej. "Carro G15" → "G15"). El OCR a menudo se come la G.
  const carroChat = (conversacion.etiqueta ?? "")
    .replace(/^carro\s+/i, "")
    .trim() || null;
  const ocrCompatibleConChat = carroCompatibleConChat(comprobante.numero_carro, carroChat);
  /** Chat ya amarrado al arrendatario (su WhatsApp). Si no, es “otro número”. */
  const chatVinculado = Boolean(conversacion.contrato_id);

  // El # de carro sale de un OCR sobre el comentario de la transferencia: un
  // dígito mal leído o mal escrito apuntaría a OTRO contrato. Si la conversación
  // ya está vinculada (por el teléfono del cliente, que sí es verificable), ese
  // vínculo manda; el carro del comprobante solo puede confirmarlo, no cambiarlo.
  // Excepción: "15" vs "G15" (mismo dígito, OCR sin prefijo) → NO contradice.
  const contradice =
    chatVinculado &&
    porCarro.estado === "ok" &&
    conversacion.contrato_id != null &&
    porCarro.contratoId !== conversacion.contrato_id &&
    !ocrCompatibleConChat;

  let resolucion: ResolucionCarro;
  let sugerenciaCarro: string | null = null;
  if (contradice) {
    // Ni se aplica al carro leído ni se asume el de la conversación: lo ve una persona.
    resolucion = {
      vehiculoId: conversacion.vehiculo_id,
      contratoId: null,
      clienteId: conversacion.cliente_id,
      etiqueta: conversacion.etiqueta,
      estado: "ambiguo",
    };
    sugerenciaCarro = comprobante.numero_carro;
  } else if (
    chatVinculado &&
    (ocrCompatibleConChat || porCarro.estado !== "ok" || porCarro.contratoId === conversacion.contrato_id)
  ) {
    // Chat vinculado manda: OCR sin prefijo (15→G15) o sin carro legible.
    resolucion = {
      vehiculoId: conversacion.vehiculo_id,
      contratoId: conversacion.contrato_id,
      clienteId: conversacion.cliente_id,
      etiqueta: conversacion.etiqueta,
      estado: "ok",
    };
  } else if (!chatVinculado) {
    // Otro número / chat sin vínculo: NUNCA aplicar solo ni amarrar el chat al carro.
    // El pago queda pendiente de revisión; el OCR solo sugiere el carro en notas.
    sugerenciaCarro =
      comprobante.numero_carro ??
      (porCarro.etiqueta ? porCarro.etiqueta.replace(/^carro\s+/i, "") : null);
    resolucion = {
      vehiculoId: null,
      contratoId: null,
      clienteId: null,
      etiqueta: null,
      estado: porCarro.estado === "ok" ? "ambiguo" : porCarro.estado,
    };
  } else {
    resolucion = porCarro;
  }

  const empresaId = await empresaDelVehiculo(
    resolucion.vehiculoId ?? (chatVinculado ? conversacion.vehiculo_id : null),
  );
  const { data: pedidoRef } = await sb
    .from("mensajes")
    .select("id")
    .eq("conversacion_id", conversacion.id)
    .eq("direccion", "out")
    .ilike("texto", `%${FRASE_PEDIR_CONFIRMACION}%`)
    .limit(1)
    .maybeSingle();
  const veredicto = await validarComprobante({
    comprobante,
    empresaId,
    contratoId: resolucion.contratoId ?? conversacion.contrato_id,
    yaPidieronReferencia: !!pedidoRef,
  });

  // Solo se RELLENA lo que falte, y SOLO si el chat ya estaba vinculado.
  // Un comprobante desde otro número no puede secuestrar el vínculo del carro.
  if (chatVinculado) {
    const patch: Record<string, unknown> = {};
    if (!conversacion.vehiculo_id && resolucion.vehiculoId) patch.vehiculo_id = resolucion.vehiculoId;
    if (!conversacion.contrato_id && resolucion.contratoId) patch.contrato_id = resolucion.contratoId;
    if (!conversacion.etiqueta && resolucion.etiqueta) patch.etiqueta = resolucion.etiqueta;
    if (Object.keys(patch).length > 0) {
      await sb.from("conversaciones").update(patch).eq("id", conversacion.id);
    }
  }

  if (contradice) {
    await marcarAmbiguo(
      conversacion.id,
      `El comprobante dice carro ${comprobante.numero_carro}, pero el chat es del ${conversacion.etiqueta ?? "contrato vinculado por teléfono"}. Confirmar a cuál se aplica.`,
    );
  } else if (!chatVinculado) {
    await marcarAmbiguo(
      conversacion.id,
      sugerenciaCarro
        ? `Comprobante desde un número no vinculado. Sugiere carro ${sugerenciaCarro}. Revisar en Pagos.`
        : "Comprobante desde un número no vinculado al carro. Revisar en Pagos.",
    );
  }

  // Reenvío / duplicado: no escalar — el cliente ya tenía el día cubierto.
  const soloReenvioODup =
    !veredicto.crearPago &&
    veredicto.alertas.length > 0 &&
    veredicto.alertas.every(
      (a) => a.codigo === "duplicado" || a.codigo === "reenvio_dia" || a.codigo === "pedir_referencia",
    );

  // Otras alertas antifraude sí van al panel.
  if (veredicto.revisionHumana && !soloReenvioODup) {
    await marcarAmbiguo(conversacion.id, `Comprobante con alertas: ${resumirAlertas(veredicto.alertas)}`);
  }

  // Referencia ya registrada o reenvío del día → NO se crea otro pago.
  if (!veredicto.crearPago) {
    return { pagoId: null, comprobantePath: path, resolucion, estadoConciliacion: "duplicado", veredicto };
  }

  // Todo comprobante de WhatsApp queda pendiente de revisión / banco.
  // Nunca "manual" acá: eso es solo para pagos de oficina. Antes, sin carro
  // quedaba manual y desaparecía de la cola de Pagos.
  const estadoConciliacion = "pendiente" as const;
  let notaExcedente: string | null = null;
  const montoComp = Number(comprobante.monto) || 0;
  if (resolucion.contratoId && montoComp > 0.009) {
    try {
      const estPago = await estadoCuentaContrato(resolucion.contratoId);
      if (estPago) {
        const cobroPago = await cobroHoyContrato(estPago);
        const fechaPagoExcedente =
          comprobante.fecha && /^\d{4}-\d{2}-\d{2}$/.test(comprobante.fecha)
            ? comprobante.fecha
            : hoyPanama();
        const sabadoSobreLetra =
          esSabado(fechaPagoExcedente) && montoComp > (Number(estPago.letra) || 0) + 0.05;
        if (montoComp > cobroPago.totalCobrarHoy + 0.05 || sabadoSobreLetra) {
          const tieneConcepto =
            cobroPago.acuerdoSaldo > 0.009 ||
            (estPago.domingoSaldo ?? 0) > 0.009 ||
            cobroPago.lineas.some((l) => /\(pendiente\)/i.test(l.etiqueta));
          notaExcedente =
            sabadoSobreLetra || tieneConcepto
              ? `${MARCA_EXCEDENTE_SIN_CONCEPTO}${sabadoSobreLetra ? " SABADO: preguntar destino del excedente (domingo adelantado o letra siguiente)." : ""}`
              : "EXCEDENTE: pago adelantado de letra diaria";
        }
      }
    } catch (e) {
      console.error("[pipeline] excedente", e);
    }
  }
  const notas = [
    `Lectura IA (confianza: ${comprobante.confianza}). Resolución carro: ${resolucion.estado}.`,
    !chatVinculado
      ? `Desde número no vinculado (${conversacion.wa_numero}).${sugerenciaCarro ? ` Sugiere ${sugerenciaCarro}.` : ""}`
      : null,
    veredicto.alertas.length ? `ALERTAS: ${resumirAlertas(veredicto.alertas)}` : null,
    veredicto.alertas.some((a) => a.codigo === "hora_distinta") ? MARCA_REVISION_DOS_PAGOS : null,
    notaExcedente,
  ]
    .filter(Boolean)
    .join(" ");

  // Fecha/hora del comprobante (no del momento en que llegó el WhatsApp).
  const fechaLeida =
    comprobante.fecha && /^\d{4}-\d{2}-\d{2}$/.test(comprobante.fecha) ? comprobante.fecha : null;
  const horaLeida =
    comprobante.hora && /^([01]?\d|2[0-3]):[0-5]\d$/.test(comprobante.hora)
      ? comprobante.hora.slice(0, 5)
      : null;
  const fechaPago = fechaLeida ?? hoyPanama();
  let pagadoAt: string;
  if (horaLeida) {
    pagadoAt = pagadoAtDesdeForm(fechaPago, horaLeida);
  } else if (fechaPago === hoyPanama()) {
    pagadoAt = new Date().toISOString();
  } else {
    // Sin hora legible en un día pasado: mediodía Panamá (no inventamos puntualidad).
    pagadoAt = instantePanama(fechaPago, 12, 0).toISOString();
  }

  const numeroCarroPago =
    comprobante.numero_carro ??
    sugerenciaCarro ??
    (resolucion.etiqueta ? resolucion.etiqueta.replace(/^carro\s+/i, "") : null);

  const { data: pago, error } = await sb
    .from("pagos")
    .insert({
      contrato_id: resolucion.contratoId,
      cliente_id: resolucion.clienteId ?? conversacion.cliente_id,
      fecha: fechaPago,
      pagado_at: pagadoAt,
      monto: comprobante.monto ?? 0,
      banco: comprobante.banco,
      referencia: comprobante.referencia,
      cuenta_destino: comprobante.cuenta_destino,
      comprobante_url: path,
      numero_carro: numeroCarroPago,
      origen: "comprobante",
      estado_conciliacion: estadoConciliacion,
      notas,
    })
    .select("id")
    .single();

  if (error) {
    // El índice único de referencia (migración 0010) atrapó una carrera:
    // dos envíos del mismo comprobante casi al mismo tiempo.
    if (error.code === "23505") {
      return { pagoId: null, comprobantePath: path, resolucion, estadoConciliacion: "duplicado", veredicto };
    }
    throw error;
  }

  const pagoId = pago.id as string;
  let salida: DestinoInterior | null = null;
  try {
    const hist = await historialReciente(conversacion.id, 16);
    const textos = hist.map((m) => m.texto);
    salida = await inferirSalidaDelChat({
      pagoId,
      monto: comprobante.monto ?? 0,
      textos,
    });
    if (salida && resolucion.contratoId) {
      await registrarMensaje({
        conversacionId: conversacion.id,
        direccion: "out",
        tipo: "system",
        texto: `Pago asignado a salida al interior: ${salida.nombre} ($${salida.monto}). Aval pendiente del equipo.`,
      });
      const ids = await idsVehiculoYCliente(resolucion.contratoId);
      const dias = detectarDiasViaje(textos);
      const fechaHasta = dias && dias > 1 ? sumarDias(fechaPago, dias - 1) : null;
      if (estadoConciliacion === "pendiente") {
        await registrarSalidaPendiente({
          contratoId: resolucion.contratoId,
          vehiculoId: resolucion.vehiculoId ?? ids.vehiculoId,
          clienteId: resolucion.clienteId ?? conversacion.cliente_id ?? ids.clienteId,
          pagoId,
          dest: salida,
          monto: comprobante.monto ?? 0,
          pagadoAt,
          fechaHasta,
        });
      }
    }
  } catch (e) {
    console.error("[pipeline] salida interior", e);
  }

  return {
    pagoId,
    comprobantePath: path,
    resolucion,
    estadoConciliacion,
    veredicto,
    salida: salida ? { destino: salida.nombre, monto: salida.monto } : null,
  };
}
