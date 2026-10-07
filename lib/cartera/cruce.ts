// Cruce extracto ↔ comprobante. Puro: sin base de datos.
//
// Un movimiento del banco SOLO se marca conciliado si calza con un comprobante
// pendiente en TODOS los criterios: empresa, cuenta destino (si se leyó),
// monto exacto, fecha (día del pago o el siguiente) y un ancla operativa:
//   - # de carro con su letra (G25 no es el 25; el número pelado solo calza
//     con un carro que no lleva letra), y/o
//   - referencia del voucher. El número de la columna del banco suele ser
//     otro: si el carro ancla, esa diferencia no bloquea. Sin carro, las
//     referencias tienen que coincidir.
// El banco del extracto es el destino (Banco General); el banco del
// comprobante es el emisor del cliente y no se usa para decidir.
//
// Lo que no calza con ningún comprobante no va a revisión: son otros ingresos.
// Revisión queda solo cuando hay varios comprobantes y hay que elegir.

import { mismaCuenta } from "./cuenta";
import { fechaContable, sumarDias } from "./fecha";

export function canonCarro(s: string): string {
  const t = String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^([A-Z]*)0*(\d+)$/.exec(t);
  return m ? m[1] + String(parseInt(m[2], 10)) : t;
}

/**
 * ¿El # del comprobante (OCR) es el mismo carro que el del chat?
 * El OCR a menudo se come la G: lee "15" cuando en la foto dice "G15".
 * Si los dígitos calzan y el chat ya trae prefijo (G15), no es contradicción.
 */
export function carroCompatibleConChat(
  leido: string | null | undefined,
  delChat: string | null | undefined,
): boolean {
  if (!leido || !delChat) return false;
  const a = canonCarro(leido.replace(/^carro\s+/i, ""));
  const b = canonCarro(delChat.replace(/^carro\s+/i, ""));
  if (!a || !b) return false;
  if (a === b) return true;
  const digA = a.replace(/\D/g, "");
  const digB = b.replace(/\D/g, "");
  if (!digA || digA !== digB) return false;
  const prefA = a.replace(/\d/g, "");
  const prefB = b.replace(/\d/g, "");
  // Uno sin letra (OCR) y el otro con (G15), o misma letra.
  return !prefA || !prefB || prefA === prefB;
}

/**
 * ¿Esta lectura es ese carro?
 * La letra forma parte del código: G25, 25 y A25 son tres carros. Un número
 * pelado no se atribuye al carro que lleva letra, aunque sea el único de
 * la flota.
 */
export function carroAtribuible(
  leido: string | null | undefined,
  delCarro: string | null | undefined,
): boolean {
  if (!leido || !delCarro) return false;
  const a = canonCarro(leido.replace(/^carro\s+/i, ""));
  const b = canonCarro(delCarro.replace(/^carro\s+/i, ""));
  return Boolean(a && b && a === b);
}

/** "AL · Carro 67" o "KW · Carro 102" es el 67 o el 102. La letra de flota (G25) se queda. */
export function numeroCarroOperativo(leido: string | null | undefined): string | null {
  if (!leido) return null;
  let t = String(leido).trim();
  t = t.replace(/^(AL|KW|GD|AUTOLUJO|KOWUA|GOLD)\s*[·•.\-]?\s*/i, "");
  t = t.replace(/^carro\s+/i, "").trim();
  return t || null;
}

/**
 * Códigos con letra en un comentario (G25, G-14, CamposG41, G45f).
 * "cr323" no cuenta: es el comentario de banca móvil, no un prefijo.
 * Si hay más de un código distinto, no se elige.
 */
function codigosConLetra(desc: string): string[] {
  const upper = desc.toUpperCase();
  const vistos = new Set<string>();
  const re = /([A-Z])[\s-]*0*(\d{1,3})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(upper))) {
    const letra = m[1];
    const num = String(parseInt(m[2], 10));
    const idx = m.index;
    if (
      letra === "R" &&
      idx > 0 &&
      upper[idx - 1] === "C" &&
      (idx < 2 || !/[A-Z0-9]/.test(upper[idx - 2] ?? ""))
    ) {
      continue;
    }
    const abre = idx === 0 || !/[A-Z0-9]/.test(upper[idx - 1] ?? "");
    // Pegado a un nombre (CamposG41) solo la G, que es el código de flota.
    if (!abre && letra !== "G") continue;
    const resto = upper.slice(idx + m[0].length);
    if (/^[A-Z]{2,}/.test(resto)) continue;
    vistos.add(letra + num);
  }
  return [...vistos];
}

export function extraerCarro(desc: string, _empresa: string | null): string | null {
  // La letra del comentario manda, aunque el archivo se haya cargado en otra empresa.
  const letras = codigosConLetra(desc);
  if (letras.length > 1) return null;
  if (letras.length === 1) return letras[0];
  // "carro 68", "auto 97", "unidad 54", "cr323" (comentario de banca móvil).
  const m =
    /\b(?:carro|auto|cuota|veh[ií]culo|unidad|#)\s*#?\s*0*(\d{1,3})\b/i.exec(desc) ||
    /\bcr\s*-?\s*0*(\d{1,3})\b/i.exec(desc);
  return m ? String(parseInt(m[1], 10)) : null;
}

/**
 * Carro desde celdas del Excel BG: descripción + "Referencia 2".
 * Ref2 con letra ("G66") conserva la letra. Un número pelado ("66", "313")
 * queda pelado: no se convierte en G66.
 */
export function extraerCarroCeldas(
  descripcion: string,
  ref2: string | null | undefined,
  empresa: string | null,
): string | null {
  const memo = (ref2 ?? "").trim();
  const blob = [descripcion, memo].filter(Boolean).join(" ");
  const desdeTexto = extraerCarro(blob, empresa);
  if (desdeTexto) return desdeTexto;
  if (!memo) return null;
  const letras = codigosConLetra(memo);
  if (letras.length === 1) return letras[0];
  if (/^\d{1,3}$/.test(memo)) return String(parseInt(memo, 10));
  return null;
}

export function extraerNombre(desc: string): string | null {
  const m = /TRANSFERENCIA DE\s+(.+)/i.exec(desc) || /DEP[OÓ]SITO DE\s+(.+)/i.exec(desc);
  if (!m) return null;
  let n = m[1].split(/\s+(?:carro|cuota|veh[ií]culo|pago|seguro|\(|G\s?-?\d)/i)[0];
  n = n.replace(/\s+[A-Z]?\d.*$/i, "").trim();
  return n.length >= 5 ? n : null;
}

/**
 * Normaliza el ID de la transferencia para comparar exacto.
 * Alias reales: referencia, Nº confirmación, Nº comprobante, comprobante de canje.
 */
export function canonReferencia(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return t.length >= 4 ? t : null;
}

export function mismaReferencia(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ca = canonReferencia(a);
  const cb = canonReferencia(b);
  return Boolean(ca && cb && ca === cb);
}

/**
 * El mismo comprobante enviado otra vez: monto, día, referencia, cuenta y carro.
 * La hora no cuenta: el lector la mueve. Si un lado trae referencia o cuenta y
 * el otro no, no es el mismo.
 */
export function esMismoComprobante(
  a: {
    monto: number;
    pagadoAt?: string | null;
    fecha?: string | null;
    referencia?: string | null;
    cuentaDestino?: string | null;
    numeroCarro?: string | null;
    contratoId?: string | null;
  },
  b: {
    monto: number;
    pagadoAt?: string | null;
    fecha?: string | null;
    referencia?: string | null;
    cuentaDestino?: string | null;
    numeroCarro?: string | null;
    contratoId?: string | null;
  },
): boolean {
  if (!montoExacto(a.monto, b.monto)) return false;
  const fa = (a.fecha ?? "").slice(0, 10) || (a.pagadoAt ? fechaContable(a.pagadoAt) : "");
  const fb = (b.fecha ?? "").slice(0, 10) || (b.pagadoAt ? fechaContable(b.pagadoAt) : "");
  if (!fa || !fb || fa !== fb) return false;
  const ra = canonReferencia(a.referencia);
  const rb = canonReferencia(b.referencia);
  if ((ra ?? "") !== (rb ?? "")) return false;
  const ca = (a.cuentaDestino ?? "").replace(/\D/g, "");
  const cb = (b.cuentaDestino ?? "").replace(/\D/g, "");
  if ((ca ? "1" : "0") !== (cb ? "1" : "0")) return false;
  if (ca && cb && !mismaCuenta(a.cuentaDestino!, b.cuentaDestino!)) return false;
  if (a.contratoId && b.contratoId && a.contratoId !== b.contratoId) return false;
  const na = a.numeroCarro ? canonCarro(a.numeroCarro) : "";
  const nb = b.numeroCarro ? canonCarro(b.numeroCarro) : "";
  if (na && nb && na !== nb) return false;
  // Sin referencia, sin carro y sin contrato no hay cómo saber que es el mismo.
  if (!ra && !na && !nb && !a.contratoId && !b.contratoId) return false;
  return true;
}

/** Saca la referencia del texto del extracto o del comentario bancario. */
export function extraerReferencia(desc: string): string | null {
  const re =
    /(?:comprobante\s+de\s+canje|n[uúºo°\.]*\s*(?:de\s+)?(?:confirmaci[oó]n|comprobante)|confirmaci[oó]n|comprobante|referencia|ref\.?)\s*[#:.\-]?\s*([A-Z0-9][A-Z0-9\-]{3,})/i;
  const m = re.exec(desc);
  if (!m) return null;
  return canonReferencia(m[1]);
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
  /** Confirmación / comprobante / canje / ref del voucher WA. */
  referencia?: string | null;
  destinoInterior?: string | null;
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
  | {
      tipo: "repetido";
      pago: PagoCandidato;
      contrato: ContratoFlota;
      /** El resto es el mismo comprobante. Se rechaza y no queda en revisión. */
      rechazar: PagoCandidato[];
    }
  | { tipo: "ambiguo"; motivo: string; pagos: PagoCandidato[] }
  | { tipo: "sin_comprobante"; motivo: string }
  | {
      tipo: "revisar";
      motivo: string;
      sugerido: ContratoFlota | null;
      via: "carro" | "nombre" | null;
    };

/**
 * Huella estable para no re-encolar el mismo movimiento al re-subir el archivo.
 * Tiene que coincidir con `huella_movimiento` en la migración 0034.
 */
export function huellaMovimiento(
  fecha: string | null,
  monto: number,
  descripcion: string,
): string {
  const desc = String(descripcion)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\$[\d.,]+/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 140);
  return `${fecha ?? ""}|${Math.round(Number(monto) * 100)}|${desc}`;
}

export function contratoPorCarro(
  flota: ContratoFlota[],
  numero: string | null,
): { unico: ContratoFlota | null; cuantos: number } {
  if (!numero) return { unico: null, cuantos: 0 };
  const key = canonCarro(numero.replace(/^carro\s+/i, ""));
  const exactos = flota.filter((c) => canonCarro(c.numero) === key);
  if (exactos.length === 0) return { unico: null, cuantos: 0 };
  return { unico: exactos.length === 1 ? exactos[0] : null, cuantos: exactos.length };
}

/**
 * ¿Este comprobante es el de este movimiento, sin duda?
 * Origen `manual` (oficina) no cruza: el efectivo no aparece en Banco General.
 *
 * Ancla: carro y/o la referencia del voucher. El número que trae la columna
 * del Excel a menudo no es el del comprobante; si el carro calza, no bloquea.
 * Sin carro, las referencias tienen que ser la misma (o la del voucher tiene
 * que aparecer en la descripción).
 */
export function esCrucePerfecto(
  pago: PagoCandidato,
  mov: {
    monto: number;
    fecha: string | null;
    numeroCarro: string | null;
    referencia?: string | null;
    descripcion?: string | null;
  },
  extracto: { empresaId: string; numeroCuenta: string | null; numerosCuenta?: string[] },
  contrato: ContratoFlota,
): boolean {
  if (pago.origen === "manual") return false;
  if (!mov.fecha) return false;
  if (!montoExacto(pago.monto, mov.monto)) return false;
  if (!fechaCubrePago(pago.pagadoAt, mov.fecha)) return false;
  if (contrato.empresaId !== extracto.empresaId) return false;
  if (pago.empresaId && pago.empresaId !== extracto.empresaId) return false;

  const carroContrato = canonCarro(contrato.numero);
  const carroMov = numeroCarroOperativo(mov.numeroCarro);
  const carroPago = numeroCarroOperativo(pago.numeroCarro);
  if (carroMov && !carroAtribuible(carroMov, carroContrato)) return false;
  if (carroPago && !carroAtribuible(carroPago, carroContrato)) return false;

  const refPago = canonReferencia(pago.referencia);
  const refMov = canonReferencia(mov.referencia);
  const refEnDescripcion = Boolean(
    refPago &&
      mov.descripcion &&
      mov.descripcion.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(refPago),
  );
  const anclaCarro = Boolean(
    (carroMov && carroAtribuible(carroMov, carroContrato)) ||
      (carroPago && carroAtribuible(carroPago, carroContrato)),
  );
  const anclaRef = Boolean((refPago && refMov && refPago === refMov) || refEnDescripcion);
  if (refPago && refMov && refPago !== refMov && !anclaCarro && !refEnDescripcion) return false;
  if (!anclaCarro && !anclaRef) return false;

  if (pago.cuentaDestino) {
    const candidatas = [
      ...(extracto.numerosCuenta ?? []),
      ...(extracto.numeroCuenta ? [extracto.numeroCuenta] : []),
    ];
    if (candidatas.length > 0 && !candidatas.some((n) => mismaCuenta(pago.cuentaDestino!, n))) {
      return false;
    }
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
  mov: {
    monto: number;
    fecha: string | null;
    numeroCarro: string | null;
    nombre: string | null;
    referencia?: string | null;
    descripcion?: string | null;
  },
  pendientes: PagoCandidato[],
  flota: ContratoFlota[],
  extracto: { empresaId: string; numeroCuenta: string | null; numerosCuenta?: string[] },
): VeredictoCruce {
  const carroMov = numeroCarroOperativo(mov.numeroCarro);
  const { unico: porCarro, cuantos } = contratoPorCarro(flota, carroMov);
  const refMov = canonReferencia(mov.referencia);

  const perfectos: { pago: PagoCandidato; contrato: ContratoFlota }[] = [];
  for (const pago of pendientes) {
    const carroPago = numeroCarroOperativo(pago.numeroCarro);
    const delPago = contratoPorCarro(flota, carroPago).unico
      ?? (pago.contratoId ? flota.find((c) => c.contratoId === pago.contratoId) ?? null : null)
      ?? porCarro;
    if (!delPago) continue;
    if (esCrucePerfecto(pago, mov, extracto, delPago)) {
      perfectos.push({ pago, contrato: delPago });
    }
  }

  // Si varios calzan por carro/monto/fecha, la referencia exacta desempata.
  if (perfectos.length > 1 && refMov) {
    const porRef = perfectos.filter((p) => mismaReferencia(p.pago.referencia, refMov));
    if (porRef.length === 1) {
      return { tipo: "perfecto", pago: porRef[0].pago, contrato: porRef[0].contrato };
    }
  }

  if (perfectos.length === 1) {
    return { tipo: "perfecto", pago: perfectos[0].pago, contrato: perfectos[0].contrato };
  }
  if (perfectos.length > 1) {
    const cabeza = perfectos[0];
    const iguales = perfectos.every((p) => esMismoComprobante(cabeza.pago, p.pago));
    if (iguales) {
      return {
        tipo: "repetido",
        pago: cabeza.pago,
        contrato: cabeza.contrato,
        rechazar: perfectos.slice(1).map((p) => p.pago),
      };
    }
    return {
      tipo: "ambiguo",
      motivo: `Aviso: ${perfectos.length} comprobantes calzan con este movimiento y no son iguales en todos los datos. Hay que elegir a mano.`,
      pagos: perfectos.map((p) => p.pago),
    };
  }

  if (cuantos > 1) {
    return {
      tipo: "sin_comprobante",
      motivo: `El carro ${mov.numeroCarro} tiene ${cuantos} contratos activos y ningún comprobante único. No queda en revisión.`,
    };
  }

  if (porCarro) {
    return {
      tipo: "sin_comprobante",
      motivo: "El carro está en el extracto, pero no hay un comprobante con ese monto y esa fecha. No queda en revisión.",
    };
  }

  const porNombre = sugerirPorNombre(flota, mov.nombre);
  if (porNombre) {
    return {
      tipo: "sin_comprobante",
      motivo: `El nombre parece ${porNombre.clienteNombre}, pero no hay comprobante que calce. No queda en revisión.`,
    };
  }

  return {
    tipo: "sin_comprobante",
    motivo: mov.numeroCarro
      ? `El carro ${mov.numeroCarro} no tiene un comprobante pendiente que calce. No queda en revisión.`
      : refMov
        ? `La referencia ${refMov} no calza con un comprobante pendiente. No queda en revisión.`
        : "Sin comprobante que calce. No queda en revisión.",
  };
}
