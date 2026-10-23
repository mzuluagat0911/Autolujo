// Informe con la misma forma que INFORME OCTUBRE.xlsx.
//
// Una fila por carro y día, entre las fechas que elijan. El primer día
// arrastra el saldo anterior en las columnas de deuda. La letra del día va
// aparte. El extracto de cada concepto es lo cargado menos lo pagado. En la
// cuota se suma además la letra del rango.

import { etiquetaCargo } from "./extracto-desglose";
import { diasHabilesEnRango, finMes, inicioMes, partesPagoPanama, sumarDias } from "./fecha";

export const HOJA_BASE = "INFORME_2025";

export const CONCEPTOS = [
  "Cuota",
  "Abono inicial financiado",
  "Gastos Administrativos",
  "Seguro menor de edad",
  "Multas X Pagar tarde $5",
  "Exceso Km",
  "Mantenimiento",
  "Acuerdo de pago reparaciones",
  "Panapass",
  "Otras",
] as const;

export type ConceptoInforme = (typeof CONCEPTOS)[number];

export type MontosInforme = Record<ConceptoInforme, number>;

export type FilaInforme = {
  fecha: string;
  carro: string;
  empresa: string;
  conductor: string;
  letra: number;
  general: number;
  efect: number;
  detalle: string;
  pagos: MontosInforme;
  deudas: MontosInforme;
};

export type CarroInforme = {
  id: string;
  numero: string;
  empresa: string;
  conductor: string;
  /** Día en que empieza el contrato. Antes de esto no hay fila. */
  desdeContrato: string;
};

export type CargoInforme = {
  contratoId: string;
  fecha: string;
  tipo: string;
  concepto: string | null;
  codigo: string | null;
  monto: number;
};

export type PagoInforme = {
  contratoId: string;
  fecha: string;
  monto: number;
  metodo: string | null;
  notas: string | null;
  rubro: string | null;
  asignaciones: { tipo: string; aplicado: number }[] | null;
};

/**
 * Cartera cierra el día anterior a las 12:00. En el informe, un pago de las
 * 11:59 queda en el día de ayer. Desde las 12:00 queda en el día en que entró.
 * Sin hora, se respeta la fecha guardada.
 */
export function fechaInformeCartera(pagadoAt: string | null | undefined, fechaGuardada: string): string {
  const guardada = fechaGuardada.slice(0, 10);
  if (!pagadoAt) return guardada;
  const instante = new Date(pagadoAt);
  if (Number.isNaN(instante.getTime())) return guardada;
  const { fecha, hora } = partesPagoPanama(instante);
  if (hora < 12) return sumarDias(fecha, -1);
  return fecha;
}

export type MetaInforme = {
  mes: string;
  dias: number;
  diasMes: number;
  meta: number | null;
  nota: string;
  flota: number;
};

const ORDEN_EMPRESA = ["AUTOLUJO", "KW", "GOLD"];

export function empresaInforme(codigo: string | null | undefined): string {
  const u = (codigo ?? "").trim().toUpperCase();
  if (u === "KW" || u === "KOWUA" || u.includes("KOWUA")) return "KW";
  if (u === "GD" || u.includes("GOLD")) return "GOLD";
  if (u === "AL" || u.includes("AUTOLUJO")) return "AUTOLUJO";
  return u;
}

export function montosVacios(): MontosInforme {
  return {
    Cuota: 0,
    "Abono inicial financiado": 0,
    "Gastos Administrativos": 0,
    "Seguro menor de edad": 0,
    "Multas X Pagar tarde $5": 0,
    "Exceso Km": 0,
    Mantenimiento: 0,
    "Acuerdo de pago reparaciones": 0,
    Panapass: 0,
    Otras: 0,
  };
}

function r2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function sumar(m: MontosInforme): number {
  return r2(CONCEPTOS.reduce((s, c) => s + m[c], 0));
}

/** La letra diaria no entra en "Deuda Cuota": el extracto la suma aparte. */
export function conceptoDeCargo(
  tipo: string | null | undefined,
  concepto: string | null | undefined,
  codigo: string | null | undefined,
): "letra" | ConceptoInforme {
  const t = (tipo ?? "").trim().toLowerCase();
  if (t === "renta" || t === "cuenta_diaria") return "letra";
  const c = (codigo ?? "").trim().toUpperCase();
  const texto = `${concepto ?? ""} ${c}`;
  if (c === "PAGO_TARDE" || (t === "multa" && /tarde|por no pagar/i.test(texto) && !/cierre/i.test(texto))) {
    return "Multas X Pagar tarde $5";
  }
  if (t === "acuerdo") return "Acuerdo de pago reparaciones";
  const et = etiquetaCargo(concepto ?? null, codigo ?? null, tipo ?? "").toLowerCase();
  if (et === "abono inicial") return "Abono inicial financiado";
  if (et === "gastos administrativos") return "Gastos Administrativos";
  if (et === "seguro menor edad") return "Seguro menor de edad";
  if (et === "exceso de kilometraje") return "Exceso Km";
  if (et === "mantenimiento") return "Mantenimiento";
  if (et === "panapass") return "Panapass";
  if (/acuerdo|arreglo|reparac/.test(et)) return "Acuerdo de pago reparaciones";
  if (/recargo/.test(et) && !/cierre/.test(et)) return "Multas X Pagar tarde $5";
  return "Otras";
}

export function conceptoDeAsignacion(tipo: string | null | undefined): ConceptoInforme {
  switch ((tipo ?? "").trim().toLowerCase()) {
    case "cuenta_diaria":
    case "cuenta":
    case "saldo_anterior":
    case "prepago_letra":
      return "Cuota";
    case "abono":
    case "afiliacion":
      return "Abono inicial financiado";
    case "recargo":
      return "Multas X Pagar tarde $5";
    case "exceso_km":
      return "Exceso Km";
    case "mantenimiento":
      return "Mantenimiento";
    case "acuerdo":
      return "Acuerdo de pago reparaciones";
    case "panapass":
      return "Panapass";
    default:
      return "Otras";
  }
}

/** El pago queda repartido y la suma de conceptos iguala el monto. */
export function partirPago(pago: PagoInforme): { general: number; efect: number; pagos: MontosInforme } {
  const monto = r2(pago.monto);
  const pagos = montosVacios();
  let usado = 0;
  const lineas = pago.asignaciones ?? [];
  if (lineas.length) {
    for (const linea of lineas) {
      const n = r2(linea.aplicado);
      if (Math.abs(n) <= 0.009) continue;
      pagos[conceptoDeAsignacion(linea.tipo)] = r2(pagos[conceptoDeAsignacion(linea.tipo)] + n);
      usado = r2(usado + n);
    }
  } else if (pago.rubro) {
    pagos[conceptoDeAsignacion(pago.rubro)] = monto;
    usado = monto;
  }
  const resta = r2(monto - usado);
  if (Math.abs(resta) > 0.009) pagos.Cuota = r2(pagos.Cuota + resta);
  const efect = (pago.metodo ?? "").toLowerCase() === "efectivo";
  return { general: efect ? 0 : monto, efect: efect ? monto : 0, pagos };
}

function detalleDe(notas: string[], letra: number, pago: number): string {
  const cortas = notas
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter((n) => n && n.length <= 80 && !/lectura ia/i.test(n));
  if (cortas.length) return cortas.slice(0, 2).join(" · ");
  if (letra > 0.009 && pago <= 0.009) return "NO PAGO";
  return "";
}

function cmpCarro(a: FilaInforme, b: FilaInforme): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  const ea = ORDEN_EMPRESA.indexOf(a.empresa);
  const eb = ORDEN_EMPRESA.indexOf(b.empresa);
  if (ea !== eb) return (ea < 0 ? 99 : ea) - (eb < 0 ? 99 : eb);
  return a.carro.localeCompare(b.carro, "es", { numeric: true, sensitivity: "base" });
}

export function filasDelInforme(
  carros: CarroInforme[],
  cargos: CargoInforme[],
  pagos: PagoInforme[],
  desde: string,
  hasta: string,
): FilaInforme[] {
  const cargosDe = new Map<string, CargoInforme[]>();
  const pagosDe = new Map<string, PagoInforme[]>();
  for (const c of cargos) {
    const lista = cargosDe.get(c.contratoId) ?? [];
    lista.push(c);
    cargosDe.set(c.contratoId, lista);
  }
  for (const p of pagos) {
    const lista = pagosDe.get(p.contratoId) ?? [];
    lista.push(p);
    pagosDe.set(p.contratoId, lista);
  }

  const filas: FilaInforme[] = [];
  for (const carro of carros) {
    if (!carro.numero.trim() || !carro.empresa) continue;
    const alta = carro.desdeContrato || desde;
    const inicio = alta > desde ? alta : desde;
    if (inicio > hasta) continue;

    const apertura = montosVacios();
    for (const c of cargosDe.get(carro.id) ?? []) {
      if (c.fecha >= inicio) continue;
      const cual = conceptoDeCargo(c.tipo, c.concepto, c.codigo);
      const cubeta = cual === "letra" ? "Cuota" : cual;
      apertura[cubeta] = r2(apertura[cubeta] + c.monto);
    }
    for (const p of pagosDe.get(carro.id) ?? []) {
      if (p.fecha >= inicio) continue;
      const parte = partirPago(p);
      for (const concepto of CONCEPTOS) {
        apertura[concepto] = r2(apertura[concepto] - parte.pagos[concepto]);
      }
    }

    let dia = inicio;
    let primero = true;
    while (dia <= hasta) {
      const deudas = montosVacios();
      const pagosDia = montosVacios();
      let letra = 0;
      let general = 0;
      let efect = 0;
      const notas: string[] = [];
      if (primero) {
        for (const concepto of CONCEPTOS) deudas[concepto] = apertura[concepto];
        primero = false;
      }
      for (const c of cargosDe.get(carro.id) ?? []) {
        if (c.fecha !== dia) continue;
        const cual = conceptoDeCargo(c.tipo, c.concepto, c.codigo);
        if (cual === "letra") letra = r2(letra + c.monto);
        else deudas[cual] = r2(deudas[cual] + c.monto);
      }
      for (const p of pagosDe.get(carro.id) ?? []) {
        if (p.fecha !== dia) continue;
        const parte = partirPago(p);
        general = r2(general + parte.general);
        efect = r2(efect + parte.efect);
        for (const concepto of CONCEPTOS) pagosDia[concepto] = r2(pagosDia[concepto] + parte.pagos[concepto]);
        if (p.notas) notas.push(p.notas);
      }
      filas.push({
        fecha: dia,
        carro: carro.numero.trim(),
        empresa: carro.empresa,
        conductor: carro.conductor.trim(),
        letra: r2(letra),
        general: r2(general),
        efect: r2(efect),
        detalle: detalleDe(notas, letra, general + efect),
        pagos: pagosDia,
        deudas,
      });
      dia = sumarDias(dia, 1);
    }
  }
  filas.sort(cmpCarro);
  return filas;
}

export function pagoDe(fila: FilaInforme): number {
  return r2(fila.general + fila.efect);
}

export function totalDeudaDe(fila: FilaInforme): number {
  return r2(sumar(fila.deudas) - sumar(fila.pagos) + fila.letra);
}

/** Deuda del carro al corte, con la misma cuenta del extracto. */
export function deudaDeCarro(filas: FilaInforme[], empresa: string, carro: string): MontosInforme & { total: number } {
  const deudas = montosVacios();
  let letras = 0;
  const pagos = montosVacios();
  for (const fila of filas) {
    if (fila.empresa !== empresa || fila.carro !== carro) continue;
    letras = r2(letras + fila.letra);
    for (const concepto of CONCEPTOS) {
      deudas[concepto] = r2(deudas[concepto] + fila.deudas[concepto]);
      pagos[concepto] = r2(pagos[concepto] + fila.pagos[concepto]);
    }
  }
  const neto = montosVacios();
  for (const concepto of CONCEPTOS) neto[concepto] = r2(deudas[concepto] - pagos[concepto]);
  neto.Cuota = r2(neto.Cuota + letras);
  return { ...neto, total: sumar(neto) };
}

export function metaDelInforme(
  desde: string,
  hasta: string,
  meta: number | null,
  nota: string | null,
  flota: number,
): MetaInforme {
  const mes = inicioMes(hasta);
  const cruza = inicioMes(desde) !== mes;
  const base = nota?.trim() || (meta != null && meta > 0 ? "" : "Sin meta cargada en la plataforma");
  return {
    mes: desde,
    dias: diasHabilesEnRango(desde, hasta),
    diasMes: diasHabilesEnRango(mes, finMes(hasta)),
    meta: meta != null && meta > 0 ? r2(meta) : null,
    nota: cruza ? [base, "El rango cruza meses. La meta es la del mes del corte."].filter(Boolean).join(" ") : base,
    flota,
  };
}

export function conductoresDe(filas: FilaInforme[]): string[] {
  return [...new Set(filas.map((f) => f.conductor).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );
}

export function carrosDe(filas: FilaInforme[]): { empresa: string; carro: string; conductor: string }[] {
  const vistos = new Map<string, { empresa: string; carro: string; conductor: string; fecha: string }>();
  for (const fila of filas) {
    const clave = `${fila.empresa}|${fila.carro}`;
    const previo = vistos.get(clave);
    if (!previo || fila.fecha >= previo.fecha) {
      vistos.set(clave, {
        empresa: fila.empresa,
        carro: fila.carro,
        conductor: fila.conductor,
        fecha: fila.fecha,
      });
    }
  }
  return [...vistos.values()].sort((a, b) => {
    const ea = ORDEN_EMPRESA.indexOf(a.empresa);
    const eb = ORDEN_EMPRESA.indexOf(b.empresa);
    if (ea !== eb) return (ea < 0 ? 99 : ea) - (eb < 0 ? 99 : eb);
    return a.carro.localeCompare(b.carro, "es", { numeric: true, sensitivity: "base" });
  });
}

export function fechasDe(filas: FilaInforme[]): string[] {
  return [...new Set(filas.map((f) => f.fecha))].sort();
}
