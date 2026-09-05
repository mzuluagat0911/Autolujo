// Motor de estado de cuenta. Calcula, por contrato, lo que el cliente debe hoy
// y arma el mensaje con desglose:
//   $5 arreglo · $30 cuota de hoy · $15 saldo anterior  →  Total a pagar hoy: $50
// Todo determinista (código), nunca el LLM.
//
// Esta es la ÚNICA fuente de las cifras. El contexto del agente, el envío
// masivo y el panel leen de aquí. Si cada uno calcula lo suyo, el mismo chat
// termina dando dos números distintos para lo mismo.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, pasoCorte, fechaLarga, sumarDias } from "./fecha";
import type { TerminosCuota } from "./cuota";
import { calcularCifras, textoDesglose, cubrioCuotaDelDia, type Cifras } from "./cifras";
import {
  contratosConPagoEnDia,
  contratosConComprobantePendienteEnDia,
  pagoHoyContrato,
  comprobantePendienteContrato,
  montosDelDiaPorContrato,
  contratosQueCubrieronElDia,
  aplicadoArregloHoyContrato,
  aplicadoArregloHoyPorContrato,
} from "./pagos-dia";
import { ultimoDiaDevengado } from "./devengo";
import { acuerdoHoyDe, type AcuerdoActivo } from "./acuerdo";
import { cuotaDeFecha, esCumpleanos, tienePermanencia } from "./cuota";

export function money(n: number): string {
  const v = Math.round(n * 100) / 100;
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

export type EstadoCuenta = Cifras & {
  contratoId: string;
  vehiculoNumero: string;
  empresa: string | null;
  empresaId: string | null;
  empresaNombre: string | null;
  clienteNombre: string;
  waNumero: string | null;
  pagoHoy: boolean;
  pagoPuntual: boolean;
  pendiente: boolean;
  pendienteMonto: number;
  pendienteHora: string | null;
  hoyYaDevengado: boolean;
  devengadoHasta: string | null;
  cobraDomingo: boolean;
  cuotaDomingo: number;
  esCumpleanos: boolean;
  cumpleLibreAplica: boolean;
  cumpleMotivo: string | null;
  fechaNacimiento: string | null;
  diasAdelantados: number;
  cubiertoHasta: string | null;
  estadoContrato: string;
  desglose: string;
  fecha: string;
  templateVars: [string, string, string, string, string];
};

type ContratoRow = TerminosCuota & {
  id: string;
  cliente_id: string | null;
  estado: string;
  fecha_inicio: string | null;
  vehiculo: {
    numero: string;
    empresa: { id: string; codigo: string; nombre: string } | null;
  } | null;
  cliente: { nombre: string; whatsapp: string | null } | null;
};

function armar(
  c: ContratoRow,
  cifras: Cifras,
  extra: {
    hoy: string;
    pagoHoy: boolean;
    pagoPuntual: boolean;
    pendiente: boolean;
    pendienteMonto: number;
    pendienteHora: string | null;
    hoyYaDevengado: boolean;
    devengadoHasta: string | null;
    esCumpleanos: boolean;
    cumpleLibreAplica: boolean;
    cumpleMotivo: string | null;
    fechaNacimiento: string | null;
    estadoContrato: string;
  },
): EstadoCuenta {
  const manana = sumarDias(extra.hoy, 1);
  let desglose = textoDesglose(cifras.lineas, money);
  if (cifras.recargoSiTarda > 0.009) {
    const aviso = `${money(cifras.recargoSiTarda)} si no completas antes de las 7 p.m.`;
    desglose = desglose ? `${desglose} · ${aviso}` : aviso;
  }
  if (cifras.domingo) {
    desglose = `${desglose} · ${money(cifras.domingo)} domingo ${Number(manana.slice(8, 10))}`;
  }
  if (!desglose) desglose = `${money(cifras.cuenta)} cuenta`;

  const fecha = fechaLarga(extra.hoy);
  const nombre = c.cliente?.nombre?.split(" ")[0] ?? "cliente";
  const carro = c.vehiculo?.numero ?? "—";
  const emp = c.vehiculo?.empresa ?? null;

  // Pagos adelantados: si el neto (con la cuota de hoy) es negativo, hay crédito.
  const netoConHoy = cifras.saldoVista + cifras.faltaHoy;
  const credito = Math.max(-netoConHoy, 0);
  const diasAdelantados = cifras.letra > 0 ? Math.floor(credito / cifras.letra) : 0;
  const cubiertoHasta = diasAdelantados > 0 ? sumarDias(extra.hoy, diasAdelantados) : null;

  return {
    ...cifras,
    contratoId: c.id,
    vehiculoNumero: carro,
    empresa: emp?.codigo ?? null,
    empresaId: emp?.id ?? null,
    empresaNombre: emp?.nombre ?? null,
    clienteNombre: c.cliente?.nombre ?? "Sin nombre",
    waNumero: c.cliente?.whatsapp ?? null,
    pagoHoy: extra.pagoHoy,
    pagoPuntual: extra.pagoPuntual,
    pendiente: extra.pendiente,
    pendienteMonto: extra.pendienteMonto,
    pendienteHora: extra.pendienteHora,
    hoyYaDevengado: extra.hoyYaDevengado,
    devengadoHasta: extra.devengadoHasta,
    cobraDomingo: Boolean(c.cobra_domingo),
    cuotaDomingo: Number(c.cuota_domingo) || 0,
    esCumpleanos: extra.esCumpleanos,
    cumpleLibreAplica: extra.cumpleLibreAplica,
    cumpleMotivo: extra.cumpleMotivo,
    fechaNacimiento: extra.fechaNacimiento,
    diasAdelantados,
    cubiertoHasta,
    estadoContrato: extra.estadoContrato,
    desglose,
    fecha,
    templateVars: [nombre, carro, fecha, desglose, money(cifras.totalHoy)],
  };
}

/**
 * Evalúa el beneficio de cumpleaños libre para un contrato en `hoy`, dadas sus
 * cifras. Aplica solo si HOY es su cumpleaños, tiene >= 1 mes de permanencia y
 * está al día (sin saldo anterior). Devuelve también las cifras corregidas
 * (con la cuota de hoy en 0) cuando aplica.
 */
function evaluarCumple(
  c: ContratoRow,
  nac: string | null,
  hoy: string,
  cifras: Cifras,
  entrada: Parameters<typeof calcularCifras>[0],
): { esCumpleanos: boolean; aplica: boolean; motivo: string | null; cifras: Cifras } {
  if (!esCumpleanos(nac, hoy)) {
    return { esCumpleanos: false, aplica: false, motivo: null, cifras };
  }
  if (!tienePermanencia(c.fecha_inicio, hoy, 1)) {
    return { esCumpleanos: true, aplica: false, motivo: "menos de 1 mes de permanencia", cifras };
  }
  if (cifras.pendienteAnterior > 0.009) {
    return { esCumpleanos: true, aplica: false, motivo: "tiene saldo pendiente; debe estar al día", cifras };
  }
  if (cifras.cuotaHoy <= 0) {
    // Hoy ya era libre (domingo) o ya se cobró: no hay nada que descontar.
    return { esCumpleanos: true, aplica: false, motivo: null, cifras };
  }
  return { esCumpleanos: true, aplica: true, motivo: null, cifras: calcularCifras({ ...entrada, diaLibre: true }) };
}

function terminosDe(c: ContratoRow): TerminosCuota {
  return {
    letra_diaria: Number(c.letra_diaria),
    descuento_puntual: c.descuento_puntual,
    cobra_domingo: c.cobra_domingo,
    cuota_domingo: c.cuota_domingo,
  };
}

const SEL =
  "id, cliente_id, estado, fecha_inicio, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo, vehiculo:vehiculos(numero, empresa:empresas(id, codigo, nombre)), cliente:clientes(nombre, whatsapp)";

/**
 * Fecha de nacimiento por cliente. En una consulta aparte y a prueba de fallos:
 * si la columna aún no existe (migración 0015 sin correr), devuelve vacío y el
 * beneficio de cumpleaños simplemente no aplica todavía.
 */
async function nacimientosDe(clienteIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = clienteIds.filter(Boolean);
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data, error } = await sb.from("clientes").select("id, fecha_nacimiento").in("id", ids);
  if (error) return out; // columna inexistente u otro problema → sin cumpleaños
  for (const r of (data ?? []) as { id: string; fecha_nacimiento: string | null }[]) {
    out.set(r.id, r.fecha_nacimiento ?? null);
  }
  return out;
}

async function acuerdosActivos(): Promise<Map<string, AcuerdoActivo[]>> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("acuerdos")
    .select("id, contrato_id, saldo, cuota_diaria, cuota_domingo, descripcion")
    .eq("activo", true);
  const out = new Map<string, AcuerdoActivo[]>();
  for (const a of (data ?? []) as (AcuerdoActivo & { contrato_id: string })[]) {
    const list = out.get(a.contrato_id) ?? [];
    list.push(a);
    out.set(a.contrato_id, list);
  }
  return out;
}

/** Estado de cuenta de un solo contrato. */
export async function estadoCuentaContrato(contratoId: string): Promise<EstadoCuenta | null> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();

  const { data: c } = await sb.from("contratos").select(SEL).eq("id", contratoId).maybeSingle();
  if (!c) return null;
  const row = c as unknown as ContratoRow;

  const [s, pago, multa, devengadoHasta, pend, acuerdosMap, arregloAplicado] = await Promise.all([
    sb.from("vw_saldo_contrato").select("saldo_actual").eq("contrato_id", contratoId).maybeSingle(),
    pagoHoyContrato(contratoId, hoy),
    sb.from("cargos").select("id").eq("contrato_id", contratoId).eq("fecha", hoy)
      .eq("tipo", "multa").eq("concepto_codigo", "PAGO_TARDE").limit(1),
    ultimoDiaDevengado(contratoId),
    comprobantePendienteContrato(contratoId, hoy),
    acuerdosActivos(),
    aplicadoArregloHoyContrato(contratoId, hoy),
  ]);

  const hoyYaDevengado = devengadoHasta != null && devengadoHasta >= hoy;
  const acuerdoHoy = Math.max(acuerdoHoyDe(acuerdosMap.get(contratoId) ?? [], hoy), arregloAplicado);
  const meta = cuotaDeFecha(terminosDe(row), hoy) + acuerdoHoy;
  const pagoPuntual = cubrioCuotaDelDia(pago.pagadoPuntual, meta);
  // Contrato cerrado (devuelto/finalizado/abandonado…): ya NO corre cuota diaria;
  // solo queda la deuda pendiente. Se trata como "día libre" permanente.
  const contratoCerrado = row.estado !== "activo";
  const entrada = {
    terminos: terminosDe(row),
    saldo: Number((s.data as { saldo_actual: number } | null)?.saldo_actual ?? 0),
    pagoHoy: pago.pagoHoy,
    pagoPuntual,
    pagadoHoy: pago.pagado,
    acuerdoHoy,
    faltaAcuerdo: acuerdoHoy,
    pendiente: pend.pendiente,
    hoy,
    corte: pasoCorte(),
    multaHoyRegistrada: (multa.data?.length ?? 0) > 0,
    hoyYaDevengado,
    diaLibre: contratoCerrado,
  };
  const cifrasBase = calcularCifras(entrada);
  const nac = row.cliente_id ? (await nacimientosDe([row.cliente_id])).get(row.cliente_id) ?? null : null;
  const cumple = evaluarCumple(row, nac, hoy, cifrasBase, entrada);

  return armar(row, cumple.cifras, {
    hoy,
    pagoHoy: pago.pagoHoy,
    pagoPuntual,
    pendiente: pend.pendiente,
    pendienteMonto: pend.monto,
    pendienteHora: pend.hora,
    hoyYaDevengado,
    devengadoHasta,
    esCumpleanos: cumple.esCumpleanos,
    cumpleLibreAplica: cumple.aplica,
    cumpleMotivo: cumple.motivo,
    fechaNacimiento: nac,
    estadoContrato: row.estado,
  });
}

/** Última renta de cada contrato en la ventana de catch-up (7 días). */
async function ultimoDevengoPorContrato(hoy: string): Promise<Map<string, string>> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("contrato_id, fecha")
    .eq("tipo", "renta")
    .gte("fecha", sumarDias(hoy, -7));
  const out = new Map<string, string>();
  for (const r of (data ?? []) as { contrato_id: string; fecha: string }[]) {
    const prev = out.get(r.contrato_id);
    if (!prev || r.fecha > prev) out.set(r.contrato_id, r.fecha);
  }
  return out;
}

/** Estado de cuenta de TODOS los contratos activos (para el envío del día). */
export async function estadosCuentaHoy(): Promise<EstadoCuenta[]> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const corte = pasoCorte();

  const [contratos, saldos, multasHoy, pagaronHoy, cubrieron, pendientes, lastRenta, pagadoMap, acuerdosMap, arregloMap] =
    await Promise.all([
      sb.from("contratos").select(SEL).eq("estado", "activo"),
      sb.from("vw_saldo_contrato").select("contrato_id, saldo_actual"),
      sb.from("cargos").select("contrato_id").eq("fecha", hoy).eq("tipo", "multa")
        .eq("concepto_codigo", "PAGO_TARDE"),
      contratosConPagoEnDia(hoy),
      contratosQueCubrieronElDia(hoy),
      contratosConComprobantePendienteEnDia(hoy),
      ultimoDevengoPorContrato(hoy),
      montosDelDiaPorContrato(hoy),
      acuerdosActivos(),
      aplicadoArregloHoyPorContrato(hoy),
    ]);

  const saldoMap = new Map<string, number>();
  for (const s of (saldos.data ?? []) as { contrato_id: string; saldo_actual: number | null }[]) {
    saldoMap.set(s.contrato_id, Number(s.saldo_actual ?? 0));
  }
  const multaHoy = new Set((multasHoy.data ?? []).map((g: { contrato_id: string }) => g.contrato_id));

  const filasContrato = (contratos.data ?? []) as unknown as ContratoRow[];
  const nacMap = await nacimientosDe(filasContrato.map((c) => c.cliente_id ?? "").filter(Boolean));

  return filasContrato
    .map((c) => {
      const acuerdoHoy = Math.max(acuerdoHoyDe(acuerdosMap.get(c.id) ?? [], hoy), arregloMap.get(c.id) ?? 0);
      const pagoHoy = pagaronHoy.has(c.id);
      const pagoPuntual = cubrieron.has(c.id);
      const pendiente = pendientes.has(c.id);
      const devengadoHasta = lastRenta.get(c.id) ?? null;
      const hoyYaDevengado = devengadoHasta != null && devengadoHasta >= hoy;
      const entrada = {
        terminos: terminosDe(c),
        saldo: saldoMap.get(c.id) ?? 0,
        pagoHoy,
        pagoPuntual,
        pagadoHoy: pagadoMap.get(c.id) ?? 0,
        acuerdoHoy,
        faltaAcuerdo: acuerdoHoy,
        pendiente,
        hoy,
        corte,
        multaHoyRegistrada: multaHoy.has(c.id),
        hoyYaDevengado,
      };
      const cifrasBase = calcularCifras(entrada);
      const nac = c.cliente_id ? nacMap.get(c.cliente_id) ?? null : null;
      const cumple = evaluarCumple(c, nac, hoy, cifrasBase, entrada);
      return armar(c, cumple.cifras, {
        hoy,
        pagoHoy,
        pagoPuntual,
        pendiente,
        pendienteMonto: 0,
        pendienteHora: null,
        hoyYaDevengado,
        devengadoHasta,
        esCumpleanos: cumple.esCumpleanos,
        cumpleLibreAplica: cumple.aplica,
        cumpleMotivo: cumple.motivo,
        fechaNacimiento: nac,
        estadoContrato: c.estado,
      });
    })
    // Quien cubrió el día (o tiene comprobante en validación) no recibe cobro.
    // Un abono parcial SÍ: todavía debe el resto + los $5 si no completa.
    .filter((e) => e.totalHoy > 0.009 && !e.pendiente)
    .sort((a, b) => b.totalHoy - a.totalHoy);
}
