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
  /** Parte del arreglo de hoy que aún NO está cubierta por abonos. */
  faltaAcuerdo: number;
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
  /** Domingo ya cargado que sigue en el saldo. Se lista; no entra a totalHoy. */
  domingoSaldo: number;
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
  /**
   * Cargo de domingo que vive en el saldo (código DOMINGOS).
   * No es letra: se aparta del total y solo se lista como pendiente.
   */
  domingoEnSaldo?: number;
  /**
   * Nunca hubo cargo `renta` (piloto Gold / saldo_inicial).
   * La deuda vive en el saldo: no sumar otra letra “en el aire”.
   */
  sinDevengoRenta?: boolean;
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
  const saldoVista = Number(e.saldo) || 0;
  const hoyEsDomingo = esDomingo(e.hoy);
  // Lun–sáb: el domingo se reserva del saldo y no entra a totalHoy.
  // Domingo: ese compromiso sí se cobra hoy → no se aparta.
  const domingoEnSaldo = Math.max(Number(e.domingoEnSaldo) || 0, 0);
  const domingoSaldo = hoyEsDomingo
    ? 0
    : Math.min(domingoEnSaldo, Math.max(saldoVista, 0));
  const saldoLetra = saldoVista - domingoSaldo;
  // Letra de hoy aún no posteada como renta:
  // - Con devengo normal: se suma (el pago deja saldo negativo y la cancela).
  // - Sin renta nunca (saldo_inicial): la deuda ya está en el saldo; solo se
  //   pide letra “en el aire” si arranca el día en cero / crédito sin abono.
  let faltaHoy = 0;
  if (!e.hoyYaDevengado && cuotaHoy > 0.009) {
    if (e.sinDevengoRenta) {
      const yaCubiertoEnSaldo = saldoVista > 0.009 || pagadoHoy > 0.009 || saldoVista < -0.009;
      faltaHoy = yaCubiertoEnSaldo ? 0 : cuotaHoy;
    } else {
      faltaHoy = cuotaHoy;
    }
  }
  const bruto = saldoLetra + faltaHoy + faltaAcuerdo;
  const pendiente = Boolean(e.pendiente);
  const letraAbierta = Math.max(saldoLetra + faltaHoy, 0);

  const hayLetraAbierta = cuotaHoy > 0.009 && letraAbierta > 0.009;
  // El recargo de las 7:00 p.m. no se calcula solo. Entra únicamente si el
  // equipo cargó la multa a mano (ese monto ya vive en el saldo).
  const recargo = 0;
  const recargoSiTarda = 0;
  void hayLetraAbierta;
  void penalidad;

  const totalHoy = Math.max(bruto + recargo, 0);
  const totalHoyTarde =
    e.corte || e.pagoPuntual || pendiente ? totalHoy : Math.max(bruto + recargoSiTarda, 0);
  const totalManana = totalHoyTarde + cuotaManana;

  const domingo =
    esDomingo(manana) && e.terminos.cobra_domingo
      ? Number(e.terminos.cuota_domingo ?? 0) || null
      : null;

  // Sin renta: la letra del día abierto ya va dentro del saldo (o del abono de hoy).
  const letraHoyEnSaldo =
    e.hoyYaDevengado ||
    (Boolean(e.sinDevengoRenta) && cuotaHoy > 0.009 && (saldoVista > 0.009 || pagadoHoy > 0.009));
  const rentaEnSaldo = letraHoyEnSaldo
    ? Math.min(cuotaHoy, Math.max(saldoLetra, 0) + pagadoHoy)
    : 0;
  const recargoEnSaldo = e.multaHoyRegistrada ? penalidad : 0;
  const acuerdoEnSaldo = Math.max(acuerdoHoy - faltaAcuerdo, 0);
  const saldoAntesPagos = saldoLetra + pagadoHoy;
  const pendienteAnterior = Math.max(
    saldoAntesPagos - rentaEnSaldo - recargoEnSaldo - acuerdoEnSaldo,
    0,
  );

  const cuotaLinea = Math.max(rentaEnSaldo, faltaHoy);
  const lineas = armarLineas({
    // Solo lo que aún falta del arreglo hoy (no la cuota ya cubierta).
    acuerdoHoy: faltaAcuerdo,
    cuotaHoy: cuotaLinea,
    pendienteAnterior,
    recargo,
    pagadoHoy,
    // Lun–sáb: línea informativa. Domingo: ya va dentro del total (saldo/cuota).
    domingoSaldo: hoyEsDomingo ? 0 : domingoSaldo,
  });
  // Domingo con cargo DOMINGOS y sin cuotaHoy aparte → mostrarlo en el desglose.
  if (hoyEsDomingo && domingoEnSaldo > 0.009 && cuotaLinea < 0.009) {
    lineas.unshift({ concepto: "domingo", monto: domingoEnSaldo });
  }

  return {
    letra,
    penalidad,
    cuotaHoy,
    cuotaManana,
    acuerdoHoy,
    pagadoHoy,
    faltaAcuerdo,
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
    domingoSaldo: hoyEsDomingo ? domingoEnSaldo : domingoSaldo,
    lineas,
  };
}

function armarLineas(p: {
  acuerdoHoy: number;
  cuotaHoy: number;
  pendienteAnterior: number;
  recargo: number;
  pagadoHoy: number;
  domingoSaldo: number;
}): LineaDesglose[] {
  const lineas: LineaDesglose[] = [];
  if (p.acuerdoHoy > 0.009) lineas.push({ concepto: "arreglo", monto: p.acuerdoHoy });
  if (p.cuotaHoy > 0.009) lineas.push({ concepto: "cuota de hoy", monto: p.cuotaHoy });
  if (p.pendienteAnterior > 0.009) {
    lineas.push({ concepto: "saldo anterior", monto: p.pendienteAnterior });
  }
  if (p.domingoSaldo > 0.009) {
    lineas.push({ concepto: "domingo (pendiente)", monto: p.domingoSaldo });
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
