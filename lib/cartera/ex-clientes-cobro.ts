// Cobro de ex clientes por WhatsApp, aparte de la letra diaria.
// Arranca el lunes 16 de noviembre de 2026. Un mensaje al día, desde las 9 a.m.
// No corre domingo ni feriado. El rango de la deuda marca los días, y la
// quincena se cobra además. Quincena en domingo o feriado pasa al hábil siguiente.

import { createServerSupabase } from "@/lib/supabase/server";
import { sendTemplate } from "@/lib/whatsapp/client";
import { esFeriadoNacional } from "@/lib/comercial/feriados";
import { diaSemana, esDomingo, hoyPanama, sumarDias } from "./fecha";
import { obtenerConversacion, registrarMensaje } from "./pipeline";
import { normalizarTelefono } from "./telefono";

export const FECHA_INICIO_COBRO_EX = "2026-11-16";

const FORMAL = "exclientes_aviso_formal";
const QUINCENA = "exclientes_quincena";
const SALDO = "exclientes_saldo_pendiente";

export type PlanExCliente = {
  hoy: string;
  envia: boolean;
  motivo: string | null;
  personas: number;
  sinWhatsapp: string[];
  conContratoActivo: number;
  porPlantilla: Record<string, number>;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fechasQuincena(anio: number, mes: number): string[] {
  const dias = mes === 2 ? [1, 14, 15, 16, 27, 28] : [1, 14, 15, 16, 29, 30];
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return dias.filter((d) => d <= ultimo).map((d) => `${anio}-${pad(mes)}-${pad(d)}`);
}

function siguienteHabil(fecha: string): string {
  let f = fecha;
  for (let i = 0; i < 8 && (esDomingo(f) || esFeriadoNacional(f)); i += 1) f = sumarDias(f, 1);
  return f;
}

/** Hoy es quincena, o el hábil al que se corrió una quincena de domingo o feriado. */
export function esQuincenaEfectiva(fecha: string): boolean {
  const [y, m] = fecha.split("-").map(Number);
  const meses = [m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }, { y, m }];
  for (const mm of meses) {
    for (const q of fechasQuincena(mm.y, mm.m)) {
      if (siguienteHabil(q) === fecha) return true;
    }
  }
  return false;
}

/** Día de cobro según el rango. Domingo y feriado no entran. */
export function cobraPorRango(saldo: number, fecha: string): boolean {
  if (saldo <= 0.009) return false;
  if (esDomingo(fecha) || esFeriadoNacional(fecha)) return false;
  const d = diaSemana(fecha);
  if (saldo < 500) return d >= 1 && d <= 6;
  if (saldo <= 1000) return d === 1 || d === 3 || d === 5;
  if (saldo <= 4000) return d === 2 || d === 4;
  return d === 1;
}

export function plantillaExCliente(saldo: number, fecha: string): string | null {
  const rango = cobraPorRango(saldo, fecha);
  const quincena = esQuincenaEfectiva(fecha);
  if (!rango && !quincena) return null;
  if (saldo > 4000 && rango) return FORMAL;
  if (quincena) return QUINCENA;
  return SALDO;
}

function montoPlantilla(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function limpio(s: string): string {
  return s.replace(/[\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

function textoEnviado(plantilla: string, nombre: string, carro: string, monto: string): string {
  if (plantilla === FORMAL) {
    return `Estimado(a) ${nombre}: Inversiones Autolujo Panamá le informa que su expediente del carro ${carro} mantiene un saldo pendiente de $${monto}. Le invitamos a responder este mensaje para establecer un plan de pago antes de que su caso pase a revisión del área legal.`;
  }
  if (plantilla === QUINCENA) {
    return `Buen día, ${nombre}. Inversiones Autolujo Panamá le recuerda que el saldo pendiente de su carro ${carro} es de $${monto}. Aprovechamos la quincena para invitarle a realizar un abono. Responda este mensaje y le enviamos los datos para el pago.`;
  }
  return `Buen día, ${nombre}. Le saludamos de Inversiones Autolujo Panamá. Su cuenta del carro ${carro} mantiene un saldo pendiente de $${monto} por cuotas, acuerdos, mantenimientos o grúa. Queremos ayudarle a ponerse al día. ¿Podemos acordar hoy una fecha de pago? Si considera que ya está al día, responda este mensaje y revisamos su paz y salvo.`;
}

function componentes(vars: string[]) {
  return [{ type: "body", parameters: vars.map((text) => ({ type: "text", text })) }];
}

type FilaCobro = {
  id: string;
  nombre: string;
  whatsapp: string | null;
  saldo: number;
  carro: string | null;
  estado: string;
};

async function telefonosConContratoActivo(normas: string[]): Promise<Set<string>> {
  const sb = createServerSupabase();
  const activos = new Set<string>();
  for (let i = 0; i < normas.length; i += 40) {
    const lote = normas.slice(i, i + 40);
    const or = lote.flatMap((n) => [`wa_norm.eq.${n}`, `tel_norm.eq.${n}`]).join(",");
    const { data } = await sb.from("clientes").select("id, wa_norm, tel_norm").or(or);
    const filas = (data ?? []) as { id: string; wa_norm: string | null; tel_norm: string | null }[];
    if (filas.length === 0) continue;
    const { data: contratos } = await sb
      .from("contratos")
      .select("cliente_id")
      .in("cliente_id", filas.map((f) => f.id))
      .eq("estado", "activo");
    const conActivo = new Set(((contratos ?? []) as { cliente_id: string }[]).map((c) => c.cliente_id));
    for (const f of filas) {
      if (!conActivo.has(f.id)) continue;
      if (f.wa_norm) activos.add(f.wa_norm);
      if (f.tel_norm) activos.add(f.tel_norm);
    }
  }
  return activos;
}

async function yaSeEnvioHoy(conversacionId: string, inicioIso: string): Promise<boolean> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("mensajes")
    .select("id")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "out")
    .gte("created_at", inicioIso)
    .ilike("texto", "%Inversiones Autolujo Panamá%")
    .limit(1);
  return (data ?? []).length > 0;
}

/** Arma la lista del día sin mandar nada. */
export async function planCobroExClientes(hoy = hoyPanama()): Promise<PlanExCliente & { cola: { id: string; to: string; plantilla: string; nombre: string; carro: string; monto: string }[] }> {
  const vacio = {
    hoy,
    envia: false,
    motivo: null as string | null,
    personas: 0,
    sinWhatsapp: [] as string[],
    conContratoActivo: 0,
    porPlantilla: {} as Record<string, number>,
    cola: [] as { id: string; to: string; plantilla: string; nombre: string; carro: string; monto: string }[],
  };
  if (process.env.EXCLIENTES_COBRO === "off") return { ...vacio, motivo: "EXCLIENTES_COBRO=off" };
  if (hoy < FECHA_INICIO_COBRO_EX) return { ...vacio, motivo: `Arranca el ${FECHA_INICIO_COBRO_EX}` };
  if (esDomingo(hoy) || esFeriadoNacional(hoy)) return { ...vacio, motivo: "Domingo o feriado: no se cobra." };

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("ex_clientes")
    .select("id, nombre, whatsapp, saldo, carro, estado")
    .eq("estado", "cobro")
    .gt("saldo", 0);
  if (error) return { ...vacio, motivo: error.message };
  const filas = (data ?? []) as FilaCobro[];

  const sinWhatsapp: string[] = [];
  const candidatos: { fila: FilaCobro; to: string; plantilla: string }[] = [];
  for (const f of filas) {
    const plantilla = plantillaExCliente(Number(f.saldo) || 0, hoy);
    if (!plantilla) continue;
    const to = normalizarTelefono(f.whatsapp);
    if (!to) {
      if (f.carro) sinWhatsapp.push(f.carro);
      continue;
    }
    candidatos.push({ fila: f, to, plantilla });
  }

  const activos = await telefonosConContratoActivo(candidatos.map((c) => c.to));
  const vistos = new Set<string>();
  const cola: PlanExCliente["porPlantilla"] extends Record<string, number>
    ? { id: string; to: string; plantilla: string; nombre: string; carro: string; monto: string }[]
    : never = [];
  let conContratoActivo = 0;
  const porPlantilla: Record<string, number> = {};
  for (const c of candidatos) {
    if (activos.has(c.to)) {
      conContratoActivo += 1;
      continue;
    }
    if (vistos.has(c.to)) continue;
    vistos.add(c.to);
    porPlantilla[c.plantilla] = (porPlantilla[c.plantilla] ?? 0) + 1;
    cola.push({
      id: c.fila.id,
      to: c.to,
      plantilla: c.plantilla,
      nombre: limpio(c.fila.nombre).slice(0, 80),
      carro: limpio(c.fila.carro || "su vehículo").slice(0, 40),
      monto: montoPlantilla(Number(c.fila.saldo) || 0),
    });
  }
  return {
    hoy,
    envia: cola.length > 0,
    motivo: null,
    personas: cola.length,
    sinWhatsapp,
    conContratoActivo,
    porPlantilla,
    cola,
  };
}

/** Manda el cobro del día. Si el cron reintenta, no repite el mensaje. */
export async function enviarCobroExClientes(hoy = hoyPanama()): Promise<{
  ok: boolean;
  hoy: string;
  motivo: string | null;
  enviados: number;
  fallidos: number;
  personas: number;
  sinWhatsapp: number;
  conContratoActivo: number;
  porPlantilla: Record<string, number>;
}> {
  const plan = await planCobroExClientes(hoy);
  if (!plan.envia) {
    return {
      ok: true,
      hoy,
      motivo: plan.motivo,
      enviados: 0,
      fallidos: 0,
      personas: 0,
      sinWhatsapp: plan.sinWhatsapp.length,
      conContratoActivo: plan.conContratoActivo,
      porPlantilla: plan.porPlantilla,
    };
  }

  const sb = createServerSupabase();
  const inicio = new Date(`${hoy}T00:00:00-05:00`).toISOString();
  let enviados = 0;
  let fallidos = 0;
  for (const item of plan.cola) {
    try {
      const conv = await obtenerConversacion(item.to);
      if (await yaSeEnvioHoy(conv.id, inicio)) continue;
      await sendTemplate(item.to, item.plantilla, "es", componentes([item.nombre, item.carro, item.monto]));
      const texto = textoEnviado(item.plantilla, item.nombre, item.carro, item.monto);
      await registrarMensaje({ conversacionId: conv.id, direccion: "out", texto });
      await marcarChatExCliente(conv.id, item.carro);
      enviados += 1;
    } catch (e) {
      fallidos += 1;
      console.error("[ex-clientes] envío", item.carro, e instanceof Error ? e.message : e);
    }
  }
  return {
    ok: fallidos === 0,
    hoy,
    motivo: null,
    enviados,
    fallidos,
    personas: plan.personas,
    sinWhatsapp: plan.sinWhatsapp.length,
    conContratoActivo: plan.conContratoActivo,
    porPlantilla: plan.porPlantilla,
  };
}

/** Deja la marca en el chat aunque el título siga siendo el carro viejo. */
export async function marcarChatExCliente(conversacionId: string, carro: string): Promise<void> {
  const sb = createServerSupabase();
  await sb
    .from("conversaciones")
    .update({ etiqueta: `Ex cliente ${carro}`.slice(0, 80) })
    .eq("id", conversacionId);
}

/** Ex cliente en cobro, sin contrato activo. El agente de la letra no le escribe. */
export async function exClienteSinContratoActivo(
  waNumero: string,
): Promise<{ carro: string; saldo: number; contexto: string } | null> {
  const norm = normalizarTelefono(waNumero);
  if (!norm) return null;
  const sb = createServerSupabase();
  const { data: clientes } = await sb.from("clientes").select("id").or(`wa_norm.eq.${norm},tel_norm.eq.${norm}`).limit(5);
  const ids = ((clientes ?? []) as { id: string }[]).map((c) => c.id);
  if (ids.length) {
    const { data: activos } = await sb
      .from("contratos")
      .select("id")
      .in("cliente_id", ids)
      .eq("estado", "activo")
      .limit(1);
    if ((activos ?? []).length > 0) return null;
  }
  const { data } = await sb
    .from("ex_clientes")
    .select("nombre, carro, saldo, motivo, whatsapp, telefono, empresa_id, empresa:empresas(codigo)")
    .in("estado", ["cobro", "acuerdo"])
    .gt("saldo", 0)
    .limit(500);
  const local = norm.startsWith("507") && norm.length === 11 ? norm.slice(3) : norm;
  const fila = ((data ?? []) as {
    nombre: string;
    carro: string | null;
    saldo: number;
    motivo: string | null;
    whatsapp: string | null;
    telefono: string | null;
    empresa_id: string;
    empresa: { codigo: string } | { codigo: string }[] | null;
  }[]).find((f) => {
    const wa = normalizarTelefono(f.whatsapp);
    const tel = normalizarTelefono(f.telefono);
    return wa === norm || tel === norm || f.telefono === local;
  });
  if (!fila) return null;

  const emp = Array.isArray(fila.empresa) ? fila.empresa[0] : fila.empresa;
  const { data: cta } = await sb
    .from("cuentas_bancarias")
    .select("banco, numero_cuenta, tipo, titular")
    .eq("empresa_id", fila.empresa_id)
    .ilike("tipo", "AHORROS")
    .limit(1)
    .maybeSingle();
  const cuenta = cta as { banco: string; numero_cuenta: string; tipo: string; titular: string } | null;
  const saldo = Number(fila.saldo) || 0;
  const carro = fila.carro || "su vehículo";
  const lineas = [
    `EX CLIENTE. No tiene letra diaria. El saldo que se cobra es el del Excel, no el del contrato viejo.`,
    `Nombre: ${fila.nombre}.`,
    `Carro: ${carro}. Empresa: ${emp?.codigo ?? "—"}.`,
    `SALDO PENDIENTE: $${saldo.toFixed(2)}. Es el único total que puedes decir. No desgloses cuotas, daños ni recargos.`,
    fila.motivo ? `Motivo de la baja (interno, no lo leas como lista de cargos): ${fila.motivo}.` : "",
    saldo > 500
      ? `Si propone un acuerdo y la deuda pasa de $500, el mínimo es $50 por quincena. Si propone más, se acepta.`
      : `La deuda es de $500 o menos: se acepta el abono que proponga.`,
    `Plazo del acuerdo: el que él diga (diario, semanal, quincenal, mensual o una fecha). Sin plazo máximo.`,
    cuenta?.numero_cuenta
      ? `CUENTA PARA TRANSFERIR: ${cuenta.banco} · ${cuenta.tipo} · ${cuenta.numero_cuenta} · a nombre de ${cuenta.titular}.`
      : `CUENTA PARA TRANSFERIR: no está cargada. Dile que se la confirman en un momento.`,
  ];
  return { carro, saldo, contexto: lineas.filter(Boolean).join("\n") };
}
