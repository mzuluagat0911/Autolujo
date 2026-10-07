// Puntaje en sombra (fase 2). Explica candidatos y recomienda.
// No aplica dinero por sí solo: la llave está en activacion-cruce.ts.

import {
  canonCarro,
  canonReferencia,
  carroAtribuible,
  contratoPorCarro,
  esMismoComprobante,
  fechaCubrePago,
  montoExacto,
  numeroCarroOperativo,
  type ContratoFlota,
  type PagoCandidato,
  type VeredictoCruce,
} from "./cruce";
import { mismaCuenta } from "./cuenta";
import { fechaContable } from "./fecha";

export const SOMBRA_VERSION = "sombra-v1";

const UMBRAL_AUTO = 80;
const UMBRAL_REVISION = 45;
const BRECHA_AUTO = 25;

export type SenalCruce = {
  codigo: string;
  peso: number;
  detalle: string;
};

export type CandidatoSombra = {
  pagoId: string;
  contratoId: string | null;
  numero: string | null;
  puntaje: number;
  bloqueado: boolean;
  bloqueos: string[];
  senales: SenalCruce[];
};

export type RecomendacionSombra = {
  version: typeof SOMBRA_VERSION;
  tipo: "automatico" | "revision" | "omitido";
  puntaje: number | null;
  pagoId: string | null;
  contratoId: string | null;
  motivo: string;
  coincide: boolean;
  candidatos: CandidatoSombra[];
};

type Movimiento = {
  monto: number;
  fecha: string | null;
  numeroCarro: string | null;
  nombre: string | null;
  referencia?: string | null;
  descripcion?: string | null;
};

type ExtractoCtx = {
  empresaId: string;
  numeroCuenta: string | null;
  numerosCuenta?: string[];
};

function contratoDelPago(
  pago: PagoCandidato,
  flota: ContratoFlota[],
  porCarroMov: ContratoFlota | null,
): ContratoFlota | null {
  const carroPago = numeroCarroOperativo(pago.numeroCarro);
  return (
    contratoPorCarro(flota, carroPago).unico ??
    (pago.contratoId ? flota.find((c) => c.contratoId === pago.contratoId) ?? null : null) ??
    porCarroMov
  );
}

function anclaFuerte(senales: SenalCruce[]): boolean {
  return senales.some((s) => s.codigo === "carro" || s.codigo === "referencia_exacta");
}

function puntajeDe(senales: SenalCruce[]): number {
  return senales.reduce((s, n) => s + n.peso, 0);
}

function evaluarCandidato(
  pago: PagoCandidato,
  contrato: ContratoFlota,
  mov: Movimiento,
  extracto: ExtractoCtx,
): CandidatoSombra {
  const bloqueos: string[] = [];
  const senales: SenalCruce[] = [];

  if (pago.origen === "manual") bloqueos.push("El pago es de oficina y no está en el banco.");
  if (!mov.fecha) bloqueos.push("El movimiento no tiene fecha.");
  if (contrato.empresaId !== extracto.empresaId) bloqueos.push("El contrato es de otra empresa.");
  if (pago.empresaId && pago.empresaId !== extracto.empresaId) bloqueos.push("El comprobante es de otra empresa.");

  const carroContrato = canonCarro(contrato.numero);
  const carroMov = numeroCarroOperativo(mov.numeroCarro);
  const carroPago = numeroCarroOperativo(pago.numeroCarro);
  if (carroMov && !carroAtribuible(carroMov, carroContrato)) {
    bloqueos.push(`El carro ${carroMov} no es el ${carroContrato}.`);
  }
  if (carroPago && !carroAtribuible(carroPago, carroContrato)) {
    bloqueos.push(`El comprobante dice ${carroPago} y el contrato es ${carroContrato}.`);
  }
  if (pago.contratoId && pago.contratoId !== contrato.contratoId) {
    bloqueos.push("El comprobante ya pertenece a otro contrato.");
  }
  if (mov.fecha && pago.pagadoAt && !fechaCubrePago(pago.pagadoAt, mov.fecha)) {
    bloqueos.push("La fecha queda fuera del día del pago o del día siguiente.");
  }
  if (!montoExacto(pago.monto, mov.monto)) bloqueos.push("El monto no es exacto.");

  if (pago.cuentaDestino) {
    const candidatas = [
      ...(extracto.numerosCuenta ?? []),
      ...(extracto.numeroCuenta ? [extracto.numeroCuenta] : []),
    ];
    if (candidatas.length > 0 && !candidatas.some((n) => mismaCuenta(pago.cuentaDestino!, n))) {
      bloqueos.push("La cuenta destino no es de esta empresa.");
    } else if (candidatas.length > 0) {
      senales.push({ codigo: "cuenta", peso: 15, detalle: "La cuenta destino es de la empresa." });
    }
  }

  if (bloqueos.length === 0) {
    if (contrato.empresaId === extracto.empresaId) {
      senales.push({ codigo: "empresa", peso: 10, detalle: "Misma empresa." });
    }
    if (carroMov && carroAtribuible(carroMov, carroContrato)) {
      senales.push({ codigo: "carro", peso: 35, detalle: `Carro ${carroContrato} en el extracto.` });
    } else if (carroPago && carroAtribuible(carroPago, carroContrato)) {
      senales.push({ codigo: "carro", peso: 25, detalle: `Carro ${carroContrato} en el comprobante.` });
    }
    if (montoExacto(pago.monto, mov.monto)) {
      senales.push({ codigo: "monto", peso: 25, detalle: "Monto exacto." });
    }
    if (mov.fecha && pago.pagadoAt) {
      const dia = fechaContable(pago.pagadoAt);
      senales.push(
        mov.fecha === dia
          ? { codigo: "fecha", peso: 15, detalle: "Mismo día." }
          : { codigo: "fecha", peso: 10, detalle: "El banco acreditó al día siguiente." },
      );
    }
    const refPago = canonReferencia(pago.referencia);
    const refMov = canonReferencia(mov.referencia);
    const compacta = (mov.descripcion ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (refPago && refMov && refPago === refMov) {
      senales.push({ codigo: "referencia_exacta", peso: 40, detalle: "La referencia del voucher coincide." });
    } else if (refPago && compacta.includes(refPago)) {
      senales.push({
        codigo: "referencia_texto",
        peso: 20,
        detalle: "La referencia solo aparece en el texto. No alcanza para automático.",
      });
    } else if (refPago && refMov && refPago !== refMov) {
      senales.push({
        codigo: "referencia_distinta",
        peso: 0,
        detalle: "El número del banco no es el del voucher. El carro sostiene el cruce.",
      });
    }
    if (pago.contratoId && pago.contratoId === contrato.contratoId) {
      senales.push({ codigo: "contrato", peso: 10, detalle: "El comprobante ya está en este contrato." });
    }
  }

  return {
    pagoId: pago.id,
    contratoId: contrato.contratoId,
    numero: contrato.numero,
    puntaje: bloqueos.length > 0 ? 0 : puntajeDe(senales),
    bloqueado: bloqueos.length > 0,
    bloqueos,
    senales,
  };
}

function elegir(
  vivos: CandidatoSombra[],
  bloqueados: CandidatoSombra[],
): Pick<RecomendacionSombra, "tipo" | "puntaje" | "pagoId" | "contratoId" | "motivo"> {
  const ordenados = [...vivos].sort((a, b) => b.puntaje - a.puntaje);
  const primero = ordenados[0];
  if (!primero || primero.puntaje < UMBRAL_REVISION) {
    const contradiccion = bloqueados.find((c) => c.bloqueos.length > 0);
    return {
      tipo: "omitido",
      puntaje: primero?.puntaje ?? null,
      pagoId: null,
      contratoId: null,
      motivo: contradiccion
        ? contradiccion.bloqueos[0]!
        : "Sin comprobante que pase el piso de revisión.",
    };
  }

  const resto = ordenados.slice(1);
  const segundo = resto[0];
  const fuerte = anclaFuerte(primero.senales);
  const holgado = !segundo || primero.puntaje - segundo.puntaje >= BRECHA_AUTO;
  if (primero.puntaje >= UMBRAL_AUTO && fuerte && holgado) {
    const ancla = primero.senales.find((s) => s.codigo === "carro" || s.codigo === "referencia_exacta");
    return {
      tipo: "automatico",
      puntaje: primero.puntaje,
      pagoId: primero.pagoId,
      contratoId: primero.contratoId,
      motivo: ancla?.detalle ?? "Ancla, monto y fecha.",
    };
  }

  const cuantos = ordenados.filter((c) => c.puntaje >= UMBRAL_REVISION).length;
  return {
    tipo: "revision",
    puntaje: primero.puntaje,
    pagoId: primero.pagoId,
    contratoId: primero.contratoId,
    motivo: fuerte
      ? `${cuantos} candidatos y no hay una brecha clara.`
      : "La mejor señal no tiene carro ni referencia exacta.",
  };
}

function coincideConMotor(motor: VeredictoCruce, sombra: Pick<RecomendacionSombra, "tipo" | "pagoId">): boolean {
  if (motor.tipo === "perfecto" || motor.tipo === "repetido") {
    return sombra.tipo === "automatico" && sombra.pagoId === motor.pago.id;
  }
  if (motor.tipo === "ambiguo" || motor.tipo === "revisar") return sombra.tipo === "revision";
  return sombra.tipo === "omitido";
}

export function puntuarMovimiento(
  mov: Movimiento,
  pendientes: PagoCandidato[],
  flota: ContratoFlota[],
  extracto: ExtractoCtx,
  motor: VeredictoCruce,
): RecomendacionSombra {
  const carroMov = numeroCarroOperativo(mov.numeroCarro);
  const porCarro = contratoPorCarro(flota, carroMov).unico;
  const vistos = new Set<string>();
  const candidatos: CandidatoSombra[] = [];

  for (const pago of pendientes) {
    if (vistos.has(pago.id)) continue;
    vistos.add(pago.id);
    const contrato = contratoDelPago(pago, flota, porCarro);
    if (!contrato) continue;
    candidatos.push(evaluarCandidato(pago, contrato, mov, extracto));
  }

  const vivos = candidatos.filter((c) => !c.bloqueado);
  const bloqueados = candidatos.filter((c) => c.bloqueado);
  const decision = elegir(colapsarRepetidos(vivos, pendientes), bloqueados);
  const top = [...candidatos].sort((a, b) => Number(a.bloqueado) - Number(b.bloqueado) || b.puntaje - a.puntaje).slice(0, 3);

  return {
    version: SOMBRA_VERSION,
    ...decision,
    coincide: coincideConMotor(motor, decision),
    candidatos: top,
  };
}

function colapsarRepetidos(vivos: CandidatoSombra[], pendientes: PagoCandidato[]): CandidatoSombra[] {
  const porId = new Map(pendientes.map((p) => [p.id, p]));
  const queda: CandidatoSombra[] = [];
  for (const c of vivos) {
    const pago = porId.get(c.pagoId);
    const repetido = queda.some((prev) => {
      const otro = porId.get(prev.pagoId);
      return Boolean(pago && otro && esMismoComprobante(pago, otro));
    });
    if (!repetido) queda.push(c);
  }
  return queda;
}

export function textoSombra(r: RecomendacionSombra): string {
  const acuerdo = r.coincide ? "coincide" : "no coincide";
  if (r.tipo === "omitido") return `Sombra: omitido · ${acuerdo} · ${r.motivo}`;
  const verbo = r.tipo === "automatico" ? "automático" : "revisión";
  return `Sombra: ${verbo} ${r.puntaje ?? 0} · ${acuerdo} · ${r.motivo}`;
}

export function partirNotaSombra(motivo: string | null): {
  motivo: string | null;
  sombra: string | null;
  aprendizaje: string | null;
} {
  if (!motivo) return { motivo: null, sombra: null, aprendizaje: null };
  let aprendizaje: string | null = null;
  let base = motivo;
  const marcaA = "\nAprendizaje: ";
  const ia = base.indexOf(marcaA);
  if (ia >= 0) {
    aprendizaje = base.slice(ia + 1).trim();
    base = base.slice(0, ia);
  }
  const marca = "\nSombra: ";
  const i = base.indexOf(marca);
  if (i < 0) return { motivo: base.trim() || null, sombra: null, aprendizaje };
  return {
    motivo: base.slice(0, i).trim() || null,
    sombra: base.slice(i + 1).trim(),
    aprendizaje,
  };
}
