// Cifras del día: lo que debe pagar HOY, si paga tarde, si paga mañana.
//
// Pura a propósito (sin base de datos). estado-cuenta.ts las arma con datos
// reales; el agente, el envío masivo y el panel solo las leen. Probar aquí
// es probar lo que el cliente ve.

import { sumarDias, esDomingo } from "./fecha";
import { cuotaDeFecha, penalidadDe, type TerminosCuota } from "./cuota";

export type Cifras = {
  letra: number;
  penalidad: number;
  cuotaHoy: number;
  cuotaManana: number;
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
};

export type EntradaCifras = {
  terminos: TerminosCuota;
  saldo: number;
  pagoHoy: boolean;
  pagoPuntual: boolean;
  pendiente: boolean;
  hoy: string;
  corte: boolean;
  multaHoyRegistrada: boolean;
  hoyYaDevengado: boolean;
};

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
  const cuotaHoy = cuotaDeFecha(e.terminos, e.hoy);
  const manana = sumarDias(e.hoy, 1);
  const cuotaManana = cuotaDeFecha(e.terminos, manana);
  const faltaHoy = e.hoyYaDevengado ? 0 : cuotaHoy;
  const saldoVista = Number(e.saldo) || 0;
  const bruto = saldoVista + faltaHoy;

  const hayCuotaHoy = cuotaHoy > 0;
  const recargo =
    hayCuotaHoy && !e.pagoPuntual && e.corte && !e.multaHoyRegistrada && !e.pendiente
      ? penalidad
      : 0;
  const recargoSiTarda =
    hayCuotaHoy && !e.pagoPuntual && !e.corte && !e.pagoHoy && !e.pendiente ? penalidad : 0;

  const totalHoy = Math.max(bruto + recargo, 0);
  const totalHoyTarde =
    e.corte || e.pagoHoy || e.pendiente ? totalHoy : Math.max(bruto + recargoSiTarda, 0);
  const totalManana = totalHoyTarde + cuotaManana;

  const domingo =
    esDomingo(manana) && e.terminos.cobra_domingo
      ? Number(e.terminos.cuota_domingo ?? 0) || null
      : null;

  return {
    letra,
    penalidad,
    cuotaHoy,
    cuotaManana,
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
  };
}
