// Cifras del día: lo que debe pagar HOY, si paga tarde, si paga mañana.
//
// Pura a propósito (sin base de datos). estado-cuenta.ts las arma con datos
// reales; el agente, el envío masivo y el panel solo las leen. Probar aquí
// es probar lo que el cliente ve.
//
// Varios abonos el mismo día SUMAN. Puntual = la suma de lo pagado antes de
// las 7:00 p.m. cubre la cuota del día (+ arreglo si hay). Un parcial de $20
// sobre $30 NO es puntual: pierde los $5 y el resto se arrastra a mañana.

import { sumarDias, esDomingo } from "./fecha";
import { cuotaDeFecha, penalidadDe, type TerminosCuota } from "./cuota";

export type LineaDesglose = { concepto: string; monto: number };

export type Cifras = {
  letra: number;
  penalidad: number;
  cuotaHoy: number;
  cuotaManana: number;
  acuerdoHoy: number;
  pagadoHoy: number;
  /** Lo que venía de antes (cuotas incompletas + recargos viejos), sin la cuota de hoy. */
  pendienteAnterior: number;
  /** Saldo de la vista (puede ser negativo si pagó y la cuota de hoy aún no está). */
  saldoVista: number;
  /** Cuota de hoy si el cargo todavía no se generó. */
  faltaHoy: number;
  /** Lo que se presenta como "cuenta": saldo + faltaHoy, nunca negativo. */
  cuenta: number;
  recargo: number;
  recargoSiTarda: number;
  totalHoy: number;
  totalHoyTarde: number;
  totalManana: number;
  domingo: number | null;
  domingoDia: number | null;
  lineas: LineaDesglose[];
};

export type EntradaCifras = {
  terminos: TerminosCuota;
  saldo: number;
  pagoHoy: boolean;
  pagoPuntual: boolean;
  pagadoHoy?: number;
  /** Cuota de arreglo(s) de hoy (para el desglose). */
  acuerdoHoy?: number;
  /** Parte del arreglo que AÚN no está en el saldo (cargo no generado). */
  faltaAcuerdo?: number;
  pendiente?: boolean;
  hoy: string;
  corte: boolean;
  multaHoyRegistrada: boolean;
  hoyYaDevengado: boolean;
  /** Hoy no corre cuota (ej. cumpleaños libre): la cuota del día es 0. */
  diaLibre?: boolean;
};

/** ¿La suma de abonos de hoy (antes de las 7) cubre lo que tocaba hoy? */
export function cubrioCuotaDelDia(pagadoPuntual: number, meta: number): boolean {
  const m = Math.round((Number(meta) || 0) * 100);
  if (m <= 0) return true;
  return Math.round((Number(pagadoPuntual) || 0) * 100) >= m;
}

/**
 * El recargo no se suma si ya está en el saldo (cargo multa registrado) ni si
 * hay un comprobante pendiente (gracia).
 *
 * Tampoco hay que ponerle `max(saldo, 0)` ANTES de sumar la cuota de hoy: un
 * pago de hoy con la renta aún no creada deja el saldo en negativo, y eso es
 * exactamente lo que cancela la cuota que estamos por agregar.
 */
export function calcularCifras(e: EntradaCifras): Cifras {
  const letra = Math.max(Number(e.terminos.letra_diaria) || 0, 0);
  const penalidad = penalidadDe(e.terminos);
  // diaLibre (ej. cumpleaños): hoy no corre cuota, como un domingo libre.
  const cuotaHoy = e.diaLibre ? 0 : cuotaDeFecha(e.terminos, e.hoy);
  const manana = sumarDias(e.hoy, 1);
  const cuotaManana = cuotaDeFecha(e.terminos, manana);
  const acuerdoHoy = Math.max(Number(e.acuerdoHoy) || 0, 0);
  const faltaAcuerdo = Math.max(Number(e.faltaAcuerdo) || 0, 0);
  const pagadoHoy = Math.max(Number(e.pagadoHoy) || 0, 0);
  const faltaHoy = e.hoyYaDevengado ? 0 : cuotaHoy;
  const saldoVista = Number(e.saldo) || 0;
  const bruto = saldoVista + faltaHoy + faltaAcuerdo;
  const pendiente = Boolean(e.pendiente);

  const hayCuotaHoy = cuotaHoy > 0 || acuerdoHoy > 0;
  const recargo =
    hayCuotaHoy && !e.pagoPuntual && e.corte && !e.multaHoyRegistrada && !pendiente
      ? penalidad
      : 0;
  // Un abono parcial también pierde el descuento si no completa antes de las 7.
  const recargoSiTarda =
    hayCuotaHoy && !e.pagoPuntual && !e.corte && !pendiente ? penalidad : 0;

  const totalHoy = Math.max(bruto + recargo, 0);
  const totalHoyTarde =
    e.corte || e.pagoPuntual || pendiente ? totalHoy : Math.max(bruto + recargoSiTarda, 0);
  const totalManana = totalHoyTarde + cuotaManana;

  const domingo =
    esDomingo(manana) && e.terminos.cobra_domingo
      ? Number(e.terminos.cuota_domingo ?? 0) || null
      : null;

  const rentaEnSaldo = e.hoyYaDevengado ? cuotaHoy : 0;
  const recargoEnSaldo = e.multaHoyRegistrada ? penalidad : 0;
  const acuerdoEnSaldo = Math.max(acuerdoHoy - faltaAcuerdo, 0);
  const saldoAntesPagos = saldoVista + pagadoHoy;
  const pendienteAnterior = Math.max(
    saldoAntesPagos - rentaEnSaldo - recargoEnSaldo - acuerdoEnSaldo,
    0,
  );

  const lineas = armarLineas({
    acuerdoHoy,
    cuotaHoy,
    pendienteAnterior,
    recargo,
    pagadoHoy,
  });

  return {
    letra,
    penalidad,
    cuotaHoy,
    cuotaManana,
    acuerdoHoy,
    pagadoHoy,
    pendienteAnterior,
    saldoVista,
    faltaHoy,
    cuenta: Math.max(bruto, 0),
    recargo,
    recargoSiTarda,
    totalHoy,
    totalHoyTarde,
    totalManana,
    domingo,
    domingoDia: domingo ? Number(manana.slice(8, 10)) : null,
    lineas,
  };
}

function armarLineas(p: {
  acuerdoHoy: number;
  cuotaHoy: number;
  pendienteAnterior: number;
  recargo: number;
  pagadoHoy: number;
}): LineaDesglose[] {
  const lineas: LineaDesglose[] = [];
  if (p.acuerdoHoy > 0.009) lineas.push({ concepto: "arreglo", monto: p.acuerdoHoy });
  if (p.cuotaHoy > 0.009) lineas.push({ concepto: "cuota de hoy", monto: p.cuotaHoy });
  if (p.pendienteAnterior > 0.009) {
    lineas.push({ concepto: "saldo anterior", monto: p.pendienteAnterior });
  }
  if (p.recargo > 0.009) {
    lineas.push({ concepto: "por no pagar a tiempo", monto: p.recargo });
  }
  if (p.pagadoHoy > 0.009) lineas.push({ concepto: "pagado hoy", monto: -p.pagadoHoy });
  return lineas;
}

/** "$5 arreglo · $30 cuota de hoy" */
export function textoDesglose(lineas: LineaDesglose[], moneyFn: (n: number) => string): string {
  return lineas
    .map((l) =>
      l.monto < 0
        ? `−${moneyFn(-l.monto)} ${l.concepto}`
        : `${moneyFn(l.monto)} ${l.concepto}`,
    )
    .join(" · ");
}
