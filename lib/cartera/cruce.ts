// Cruce extracto ↔ comprobante. Puro: sin base de datos.
//
// Un movimiento del banco SOLO se marca conciliado si calza con un comprobante
// pendiente en TODOS los criterios: empresa del carro, cuenta destino (si se
// leyó), código de carro, monto exacto y fecha (el día del pago o el siguiente,
// por la hora de corte del banco). El banco del extracto es el destino
// (Banco General); el banco del comprobante es el emisor del cliente y no se
// usa para decidir, porque casi nunca coincide.
//
// Todo lo demás —incluido el match por nombre— queda en revisión. El nombre
// solo SUGIERE un contrato para que una persona confirme.

import { mismaCuenta } from "./cuenta";
import { fechaContable, sumarDias } from "./fecha";

export function canonCarro(s: string): string {
  const t = String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^([A-Z]*)0*(\d+)$/.exec(t);
  return m ? m[1] + String(parseInt(m[2], 10)) : t;
}

export function extraerCarro(desc: string, empresa: string | null): string | null {
  if (empresa === "GOLD") {
    const m = /\bG\s*-?\s*0*(\d{1,3})\b/i.exec(desc);
    return m ? "G" + parseInt(m[1], 10) : null;
  }
  const m = /\b(?:carro|cuota|veh[ií]culo|unidad|#)\s*#?\s*0*(\d{1,3})\b/i.exec(desc);
  return m ? String(parseInt(m[1], 10)) : null;
}

export function extraerNombre(desc: string): string | null {
  const m = /TRANSFERENCIA DE\s+(.+)/i.exec(desc) || /DEP[OÓ]SITO DE\s+(.+)/i.exec(desc);
  if (!m) return null;
  let n = m[1].split(/\s+(?:carro|cuota|veh[ií]culo|pago|seguro|\(|G\s?-?\d)/i)[0];
  n = n.replace(/\s+[A-Z]?\d.*$/i, "").trim();
  return n.length >= 5 ? n : null;
}

export function canonNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function montoExacto(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * El banco acredita a veces al día siguiente. Aceptamos el día del pago en
 * Panamá o el inmediato posterior. Nada más: un comprobante de la semana
 * pasada no calza con un movimiento de hoy.
 */
export function fechaCubrePago(pagadoAt: string, fechaMov: string): boolean {
  const dia = fechaContable(pagadoAt);
  return fechaMov === dia || fechaMov === sumarDias(dia, 1);
}

export type PagoCandidato = {
  id: string;
  contratoId: string | null;
  empresaId: string | null;
  monto: number;
  pagadoAt: string;
  numeroCarro: string | null;
  cuentaDestino: string | null;
  origen: string | null;
};

export type ContratoFlota = {
  contratoId: string;
  letra: number;
  numero: string;
  clienteNombre: string | null;
  empresaId: string;
};

export type VeredictoCruce =
  | { tipo: "perfecto"; pago: PagoCandidato; contrato: ContratoFlota }
  | { tipo: "ambiguo"; motivo: string }
  | {
      tipo: "revisar";
      motivo: string;
      sugerido: ContratoFlota | null;
      via: "carro" | "nombre" | null;
    };

function contratoPorCarro(
  flota: ContratoFlota[],
  numero: string | null,
): { unico: ContratoFlota | null; cuantos: number } {
  if (!numero) return { unico: null, cuantos: 0 };
  const key = canonCarro(numero);
  const hits = flota.filter((c) => canonCarro(c.numero) === key);
  return { unico: hits.length === 1 ? hits[0] : null, cuantos: hits.length };
}

/**
 * ¿Este comprobante es el de este movimiento, sin duda?
 * Origen `manual` (oficina) no cruza: el efectivo no aparece en Banco General.
 */
export function esCrucePerfecto(
  pago: PagoCandidato,
  mov: { monto: number; fecha: string | null; numeroCarro: string | null },
  extracto: { empresaId: string; numeroCuenta: string | null },
  contrato: ContratoFlota,
): boolean {
  if (pago.origen === "manual") return false;
  if (!mov.fecha) return false;
  if (!montoExacto(pago.monto, mov.monto)) return false;
  if (!fechaCubrePago(pago.pagadoAt, mov.fecha)) return false;
  if (contrato.empresaId !== extracto.empresaId) return false;
  if (pago.empresaId && pago.empresaId !== extracto.empresaId) return false;

  const carroPago = pago.numeroCarro ? canonCarro(pago.numeroCarro) : null;
  const carroMov = mov.numeroCarro ? canonCarro(mov.numeroCarro) : null;
  const carroContrato = canonCarro(contrato.numero);
  if (carroMov && carroMov !== carroContrato) return false;
  if (carroPago && carroPago !== carroContrato) return false;
  if (!carroMov && !carroPago) return false;

  if (pago.cuentaDestino && extracto.numeroCuenta) {
    if (!mismaCuenta(pago.cuentaDestino, extracto.numeroCuenta)) return false;
  }

  if (pago.contratoId && pago.contratoId !== contrato.contratoId) {
    return false;
  }
  return true;
}

function nombresCalzan(a: string, b: string): boolean {
  const wa = canonNombre(a).split(" ").filter((w) => w.length >= 3);
  const wb = canonNombre(b).split(" ").filter((w) => w.length >= 3);
  if (wa.length === 0 || wb.length === 0) return false;
  if (wa.join(" ") === wb.join(" ")) return true;
  const [corto, largo] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return corto.length >= 2 && corto.every((w) => largo.includes(w));
}

function sugerirPorNombre(flota: ContratoFlota[], nombre: string | null): ContratoFlota | null {
  if (!nombre) return null;
  const hits = flota.filter((c) => c.clienteNombre && nombresCalzan(nombre, c.clienteNombre));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Decide qué hacer con un movimiento del extracto frente a los comprobantes
 * pendientes que todavía no se han usado en este archivo.
 */
export function decidirMovimiento(
  mov: { monto: number; fecha: string | null; numeroCarro: string | null; nombre: string | null },
  pendientes: PagoCandidato[],
  flota: ContratoFlota[],
  extracto: { empresaId: string; numeroCuenta: string | null },
): VeredictoCruce {
  const { unico: porCarro, cuantos } = contratoPorCarro(flota, mov.numeroCarro);

  const perfectos: { pago: PagoCandidato; contrato: ContratoFlota }[] = [];
  for (const pago of pendientes) {
    const delPago = contratoPorCarro(flota, pago.numeroCarro).unico
      ?? (pago.contratoId ? flota.find((c) => c.contratoId === pago.contratoId) ?? null : null)
      ?? porCarro;
    if (!delPago) continue;
    if (esCrucePerfecto(pago, mov, extracto, delPago)) {
      perfectos.push({ pago, contrato: delPago });
    }
  }

  if (perfectos.length === 1) {
    return { tipo: "perfecto", pago: perfectos[0].pago, contrato: perfectos[0].contrato };
  }
  if (perfectos.length > 1) {
    return { tipo: "ambiguo", motivo: "Varios comprobantes calzan con este movimiento: hay que elegir a mano." };
  }

  if (cuantos > 1) {
    return {
      tipo: "revisar",
      motivo: `El carro ${mov.numeroCarro} tiene ${cuantos} contratos activos.`,
      sugerido: null,
      via: "carro",
    };
  }

  if (porCarro) {
    return {
      tipo: "revisar",
      motivo: "El carro está claro, pero no hay un comprobante que calce en monto, fecha y cuenta.",
      sugerido: porCarro,
      via: "carro",
    };
  }

  const porNombre = sugerirPorNombre(flota, mov.nombre);
  if (porNombre) {
    return {
      tipo: "revisar",
      motivo: `Sugerido por nombre (${porNombre.clienteNombre}): no se aplica solo.`,
      sugerido: porNombre,
      via: "nombre",
    };
  }

  return {
    tipo: "revisar",
    motivo: mov.numeroCarro
      ? `El carro ${mov.numeroCarro} no es de esta empresa o no tiene contrato activo.`
      : "Sin carro identificable y sin comprobante que calce.",
    sugerido: null,
    via: null,
  };
}
