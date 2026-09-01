// Pipeline de cartera: registra conversaciones/mensajes, sube comprobantes a
// Storage, resuelve el contrato por # de carro y crea el registro de pago.
// Todo el dinero se maneja aquí (código determinista), no en el LLM.

import { createServerSupabase } from "@/lib/supabase/server";
import type { Comprobante } from "@/lib/ai/comprobante";
import { pagoEnOficinaTexto } from "@/lib/cartera/medios-pago";
import { hoyPanama, horaPanama, pasoCorte, fechaConDia, sumarDias, fechaContable } from "@/lib/cartera/fecha";
import { cuotaDeFecha, ultimoDiaDevengado, type TerminosCuota } from "@/lib/cartera/devengo";
import { pagoHoyContrato } from "@/lib/cartera/pagos-dia";
import { normalizarTelefono, esTelefonoCanonico } from "@/lib/cartera/telefono";
import { validarComprobante, resumirAlertas, type Veredicto } from "@/lib/cartera/comprobante-validacion";

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
    .select("id, vehiculo:vehiculos(id, numero)")
    .eq("cliente_id", clienteId)
    .eq("estado", "activo")
    .limit(5);

  const filas = (data ?? []) as unknown as {
    id: string;
    vehiculo: { id: string; numero: string } | null;
  }[];
  if (filas.length === 0) return { estado: "ninguno" };
  if (filas.length > 1) return { estado: "varios", cuantos: filas.length };

  const f = filas[0];
  return {
    estado: "ok",
    contratoId: f.id,
    vehiculoId: f.vehiculo?.id ?? null,
    etiqueta: f.vehiculo ? `Carro ${f.vehiculo.numero}` : null,
  };
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
}

/** Resumen del contrato para el CONTEXTO del agente (cifras reales, no inventadas). */
export async function resumenContrato(contratoId: string): Promise<string | null> {
  const sb = createServerSupabase();
  const { data: c } = await sb
    .from("contratos")
    .select("letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo, vehiculo:vehiculos(numero, empresa:empresas(id, nombre))")
    .eq("id", contratoId)
    .maybeSingle();
  if (!c) return null;

  const hoy = hoyPanama();
  const manana = sumarDias(hoy, 1);
  const corte = pasoCorte();

  const [saldoRes, pagoRes, devengadoHasta, multaRes] = await Promise.all([
    sb.from("vw_saldo_contrato").select("saldo_actual").eq("contrato_id", contratoId).maybeSingle(),
    pagoHoyContrato(contratoId, hoy),
    ultimoDiaDevengado(contratoId),
    sb.from("cargos").select("id").eq("contrato_id", contratoId).eq("fecha", hoy)
      .eq("tipo", "multa").eq("concepto_codigo", "PAGO_TARDE").limit(1),
  ]);

  const saldo = Math.max(Number((saldoRes.data as { saldo_actual: number } | null)?.saldo_actual ?? 0), 0);
  const pagoHoy = pagoRes.pagoHoy;
  const pagoPuntual = pagoRes.pagoPuntual;
  const veh = c.vehiculo as unknown as { numero: string; empresa: { id: string; nombre: string } | null } | null;
  const carro = veh?.numero ?? "";
  const empresa = veh?.empresa ?? null;

  // Cuenta de cobro de la EMPRESA de este carro (nunca la de otra empresa).
  let cuentaTexto = "Para transferir, pídele al equipo la cuenta de tu empresa.";
  if (empresa?.id) {
    const { data: cta } = await sb
      .from("cuentas_bancarias")
      .select("banco, numero_cuenta, tipo, titular")
      .eq("empresa_id", empresa.id)
      .ilike("tipo", "AHORROS")
      .limit(1)
      .maybeSingle();
    const ct = cta as { banco: string; numero_cuenta: string; tipo: string; titular: string } | null;
    if (ct?.numero_cuenta) {
      cuentaTexto = `${ct.banco} · ${ct.tipo === "AHORROS" ? "Ahorros" : ct.tipo} · cuenta ${ct.numero_cuenta} · a nombre de ${ct.titular}`;
    }
  }

  const terminos: TerminosCuota = {
    letra_diaria: Number(c.letra_diaria),
    descuento_puntual: c.descuento_puntual as number | null,
    cobra_domingo: c.cobra_domingo as boolean | null,
    cuota_domingo: c.cuota_domingo as number | null,
  };
  const puntual = Number(c.letra_diaria);           // cuota pagando puntual (con descuento)
  const penalidad = Number(c.descuento_puntual ?? 0); // se pierde el descuento tras el corte
  const cuotaHoy = cuotaDeFecha(terminos, hoy);
  const cuotaManana = cuotaDeFecha(terminos, manana);

  // El saldo de la vista solo llega hasta el último día devengado. Si el cargo
  // de hoy todavía no se generó, hay que sumarlo aquí — no asumirlo incluido.
  const hoyYaDevengado = devengadoHasta != null && devengadoHasta >= hoy;
  const faltaHoy = hoyYaDevengado ? 0 : cuotaHoy;
  const multaHoyRegistrada = (multaRes.data ?? []).length > 0;
  const recargoCausado = !pagoPuntual && corte && !multaHoyRegistrada ? penalidad : 0;

  const totalHoy = saldo + faltaHoy + recargoCausado;
  const totalHoyTarde = corte || pagoHoy ? totalHoy : totalHoy + penalidad;
  const totalManana = totalHoyTarde + cuotaManana;

  const m = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  const domingos = c.cobra_domingo
    ? `SÍ cobra los domingos (cuota domingo ${m(Number(c.cuota_domingo) || puntual)})`
    : "NO cobra los domingos (domingos libres)";

  const lineas = [
    `FECHA Y HORA REALES (Panamá). Úsalas; NUNCA supongas otro día ni otra hora:`,
    `- Hoy es ${fechaConDia(hoy)}. Son las ${horaPanama()}.`,
    `- Mañana es ${fechaConDia(manana)}.`,
    corte
      ? `- El corte de las 7:00 p.m. YA PASÓ hoy: si paga ahora, es sin descuento.`
      : `- Todavía NO son las 7:00 p.m.: si paga hoy antes de esa hora, conserva el descuento.`,
    ``,
    `DATOS EXACTOS del contrato de ESTE cliente (usa SOLO estos números; nunca inventes ni estimes otros):`,
    `- Carro: ${carro}`,
    `- Cuota diaria pagando PUNTUAL (antes de las 7:00 p.m.): ${m(puntual)}.`,
    `- Si paga después del corte se le suman ${m(penalidad)} (pierde el descuento de ESE día).`,
    `- Días atrasados sin pagar quedan a tarifa plena (${m(puntual + penalidad)} por día, no ${m(puntual)}).`,
    `- Domingos: ${domingos}.`,
    cuotaHoy > 0
      ? `- Hoy SÍ corre cuota (${m(cuotaHoy)}).`
      : `- Hoy NO corre cuota (día libre para este contrato).`,
    pagoHoy
      ? pagoPuntual
        ? `- Este cliente YA pagó hoy PUNTUAL (antes de las 7:00 p.m.).`
        : `- Este cliente pagó hoy DESPUÉS del corte (sin descuento de ese día).`
      : `- Hoy NO tiene ningún pago registrado todavía.`,
    ``,
    `CIFRAS YA CALCULADAS POR EL SISTEMA — dalas TAL CUAL. Está PROHIBIDO que sumes,`,
    `restes o estimes por tu cuenta: si la cifra no está en esta lista, no la des.`,
    `- Lo que debe pagar HOY: ${m(totalHoy)}.`,
    corte || pagoHoy
      ? `- Ese monto ya considera la situación de hoy.`
      : `- Si paga hoy DESPUÉS de las 7:00 p.m.: ${m(totalHoyTarde)}.`,
    cuotaManana > 0
      ? `- Si NO paga hoy y paga mañana: ${m(totalManana)}.`
      : `- Mañana no corre cuota nueva; si no paga hoy, mañana seguiría en ${m(totalHoyTarde)}.`,
    `- Ese total sale de sumar las cuotas diarias que aún no se han cubierto; cada pago`,
    `  que el cliente ya envió y quedó validado ya está descontado ahí.`,
    `- Si te piden una cifra distinta a estas (otro plazo, otro escenario, un desglose que`,
    `  no tienes), NO la calcules: dile con calidez que en un momento se la confirman y`,
    `  marca pasar_a_humano = true.`,
  ];

  // Sin devengo no se puede sostener el número: mejor que lo vea una persona.
  if (devengadoHasta == null) {
    lineas.push(
      `- ⚠️ AVISO INTERNO: el sistema aún no tiene registradas las cuotas diarias de este`,
      `  contrato, así que el total puede estar incompleto. Si el cliente pregunta por su`,
      `  saldo o lo discute, NO discutas la cifra: marca pasar_a_humano = true.`,
    );
  }

  lineas.push(
    ``,
    `CÓMO PUEDE PAGAR ESTE CLIENTE (dale la opción que necesite):`,
    `- Su carro es de la empresa ${empresa?.nombre ?? "—"}. Para TRANSFERIR, la cuenta de SU empresa es:`,
    `  ${cuentaTexto}.`,
    `  Debe poner el número de carro (${carro}) en el comentario y enviar el comprobante por aquí.`,
    `  IMPORTANTE: dale SOLO la cuenta de su empresa; jamás la de otra empresa.`,
    pagoEnOficinaTexto(),
  );

  return lineas.join("\n");
}

/** ¿La ventana de 24h está abierta? (el cliente escribió en las últimas 24h). */
export function ventanaAbierta(ultimoEntranteAt: string | null | undefined): boolean {
  if (!ultimoEntranteAt) return false;
  return Date.now() - new Date(ultimoEntranteAt).getTime() < 24 * 60 * 60 * 1000;
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

/** Marca que la conversación necesita a una persona (escalada del agente). */
export async function marcarEscalada(conversacionId: string, motivo: string | null): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ modo: "humano", necesita_humano: true, motivo_escalada: motivo })
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
  tipo: "text" | "image";
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

/** Completa un mensaje ya reclamado (imagen del comprobante, pago o transcripción). */
export async function completarMensaje(
  mensajeId: string,
  patch: { mediaUrl?: string | null; pagoId?: string | null; texto?: string },
): Promise<void> {
  const sb = createServerSupabase();
  const upd: Record<string, unknown> = {};
  if (patch.mediaUrl !== undefined) upd.media_url = patch.mediaUrl;
  if (patch.pagoId !== undefined) upd.pago_id = patch.pagoId;
  if (patch.texto !== undefined) upd.texto = patch.texto;
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
  tipo?: "text" | "image" | "system";
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
    opts.texto ?? (opts.tipo === "image" ? "📷 Comprobante" : "Mensaje");
  await sb
    .from("conversaciones")
    .update({
      ultimo_mensaje_at: new Date().toISOString(),
      ultimo_texto: resumen.slice(0, 140),
    })
    .eq("id", opts.conversacionId);

  return { nuevo: true };
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
    .limit(limite);
  return ((data ?? []) as { texto: string | null }[])
    .map((m) => m.texto)
    .filter((t): t is string => Boolean(t) && !t!.startsWith("⚠️ ENVÍO FALLÓ"))
    .reverse();
}

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

type ResolucionCarro = {
  vehiculoId: string | null;
  contratoId: string | null;
  clienteId: string | null;
  etiqueta: string | null;
  estado: "ok" | "sin_contrato" | "ambiguo" | "sin_carro";
};

/** # de carro (del comentario) → vehículo → contrato ACTIVO. */
export async function resolverContratoPorCarro(numeroCarro: string | null): Promise<ResolucionCarro> {
  const vacio: ResolucionCarro = {
    vehiculoId: null, contratoId: null, clienteId: null, etiqueta: null, estado: "sin_carro",
  };
  if (!numeroCarro) return vacio;
  const sb = createServerSupabase();

  const num = numeroCarro.replace(/\D/g, "") || numeroCarro; // "CARRO 144" -> "144"
  const { data: vehs } = await sb
    .from("vehiculos")
    .select("id, numero, empresa:empresas(codigo)")
    .eq("numero", num);
  if (!vehs?.length) return { ...vacio, estado: "sin_carro" };

  const vehIds = vehs.map((v) => v.id);
  const { data: contratos } = await sb
    .from("contratos")
    .select("id, cliente_id, vehiculo_id")
    .in("vehiculo_id", vehIds)
    .eq("estado", "activo");

  const etiqueta = `Carro ${num}`;
  if (!contratos?.length) {
    return { vehiculoId: vehs[0].id, contratoId: null, clienteId: null, etiqueta, estado: "sin_contrato" };
  }
  if (contratos.length > 1) {
    return { vehiculoId: null, contratoId: null, clienteId: null, etiqueta, estado: "ambiguo" };
  }
  const c = contratos[0];
  return { vehiculoId: c.vehiculo_id, contratoId: c.id, clienteId: c.cliente_id, etiqueta, estado: "ok" };
}

type ResultadoPago = {
  /** null cuando no se creó pago (comprobante duplicado). */
  pagoId: string | null;
  comprobantePath: string;
  resolucion: ResolucionCarro;
  estadoConciliacion: "pendiente" | "manual" | "duplicado";
  veredicto: Veredicto;
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
}): Promise<ResultadoPago> {
  const sb = createServerSupabase();
  const { conversacion, comprobante, bytes, mime } = opts;

  const path = await subirComprobante(bytes, mime);
  let resolucion = await resolverContratoPorCarro(comprobante.numero_carro);

  // Fallback teléfono→contrato: si no cuadró por # de carro pero la conversación
  // ya está vinculada a un contrato (por el número del cliente), aplícalo ahí.
  if (resolucion.estado !== "ok" && conversacion.contrato_id) {
    resolucion = {
      vehiculoId: conversacion.vehiculo_id,
      contratoId: conversacion.contrato_id,
      clienteId: conversacion.cliente_id,
      etiqueta: conversacion.etiqueta,
      estado: "ok",
    };
  }

  const empresaId = await empresaDelVehiculo(resolucion.vehiculoId);
  const veredicto = await validarComprobante({ comprobante, empresaId });

  // Enriquecer la conversación con el carro/contrato detectado.
  if (resolucion.vehiculoId || resolucion.contratoId) {
    await sb
      .from("conversaciones")
      .update({
        vehiculo_id: resolucion.vehiculoId ?? conversacion.vehiculo_id,
        contrato_id: resolucion.contratoId ?? conversacion.contrato_id,
        etiqueta: resolucion.etiqueta ?? conversacion.etiqueta,
      })
      .eq("id", conversacion.id);
  }

  // Cualquier alerta antifraude va al panel: nadie da el pago por bueno solo.
  if (veredicto.revisionHumana) {
    await marcarAmbiguo(conversacion.id, `Comprobante con alertas: ${resumirAlertas(veredicto.alertas)}`);
  }

  // Referencia ya registrada → NO se crea otro pago.
  if (!veredicto.crearPago) {
    return { pagoId: null, comprobantePath: path, resolucion, estadoConciliacion: "duplicado", veredicto };
  }

  // Si resolvió un solo contrato activo → queda pendiente de conciliación.
  // Si no (sin carro / sin contrato / ambiguo) → revisión manual.
  const estadoConciliacion = resolucion.estado === "ok" ? "pendiente" : "manual";
  const notas = [
    `Lectura IA (confianza: ${comprobante.confianza}). Resolución carro: ${resolucion.estado}.`,
    veredicto.alertas.length ? `ALERTAS: ${resumirAlertas(veredicto.alertas)}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const pagadoAt = new Date().toISOString();
  const fechaPago = fechaContable(pagadoAt);

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
      numero_carro: comprobante.numero_carro,
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

  return { pagoId: pago.id as string, comprobantePath: path, resolucion, estadoConciliacion, veredicto };
}
