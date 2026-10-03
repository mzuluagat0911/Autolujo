// Desglose del extracto diario (plantilla `extracto_detalle`).
// Arma las líneas que ve el cliente: cuenta, recargos, acuerdos, cargos extras.
//
// TOTAL A PAGAR HOY = letra/recargo/cierre + UN solo concepto
// (el del carro, o el de menor valor). El mensaje lista el resto como pendiente.
//
// Anti-duplicado: un cargo extra (mant/otros/cierre) solo se resta de “cuenta”
// hasta donde quepa en pendienteAnterior. La letra/cuota de hoy no se toca.
// Un cargo con fecha posterior a hoy es aviso: no entra al total y no abre la letra.
// Cargos históricos ya absorbidos por pagos (saldo arrastrado = 0) no vacían
// el extracto ni se listan como pendientes fantasmas.
//
// Acuerdos: UNA sola línea con la cuota del día + saldo al lado.

import { createServerSupabase } from "@/lib/supabase/server";
import { money, type EstadoCuenta } from "./estado-cuenta";
import { esDomingo, fechaLarga, hoyPanama } from "./fecha";
import { conceptoSinMarca, leerPlanCargo, rebanadaDelDia } from "./recargo-montos";
import { tajadaDomingoQueFalta } from "./cifras";
import {
  candidatosDesdeExtracto,
  elegirExtraDelDia,
  esCargoBase,
  esEtiquetaDomingo,
  totalConUnExtra,
  type ItemExtraElegido,
} from "./prioridad-extras";
import { cubetaDeConcepto } from "./rubros-pago";

export type LineaExtracto = {
  etiqueta: string;
  monto: number;
  /** Solo aviso: no lleva $ delante ni suma al total. */
  aviso?: boolean;
  /** Está en el saldo, pero se cobra en una fecha posterior. No entra al total de hoy. */
  reserva?: number;
  /**
   * Cuota que entra hoy si el cargo tiene diario/domingo. El `monto` sigue
   * siendo el saldo, para no contarlo como letra. Si falta, hoy entra el saldo.
   */
  cobrarHoy?: number;
  cuotaDiaria?: number;
  cuotaDomingo?: number;
};

const SKIP_CODIGOS = new Set(["PAGO_TARDE"]);

/** Etiquetas cortas para el WhatsApp, según código o texto del cargo. */
export function etiquetaCargo(concepto: string | null, codigo: string | null, tipo: string): string {
  const limpio = conceptoSinMarca(concepto);
  concepto = limpio || null;
  const c = (codigo ?? "").toUpperCase();
  if (c === "CIERRE_SEMANA") return "Recargo Cierre semana";
  if (c === "122") return "exceso de kilometraje";
  if (c === "123") return "gastos administrativos";
  if (c === "124") return "mantenimiento";
  if (c === "127" || c === "SALIDA_LIMITE") return "multa salida sin autorización";
  if (c === "SALIDA_INT") return (concepto ?? "salida al interior").trim() || "salida al interior";
  if (c === "COBRO_DOM") return "recogida del vehículo";
  if (c === "APERTURA") return "apertura remota";
  if (c === "DOMINGOS") return "domingo";
  if (c === "PANAPASS") return "panapass";
  if (c === "AFILIACION") return "abono inicial";
  if (tipo === "panapass") return "panapass";
  if (tipo === "afiliacion") return "abono inicial";
  const t = (concepto ?? "").trim().toLowerCase();
  if (!t) return tipo || "cargo";
  if (/panapass/.test(t)) return "panapass";
  if (/abono\s*inicial|afiliaci[oó]n/.test(t)) return "abono inicial";
  if (/mantenimiento/.test(t)) return "mantenimiento";
  if (/cierre(\s+de)?\s+semana/.test(t)) return "Recargo Cierre semana";
  if (/exceso/.test(t) && /km|kilom/.test(t)) return "exceso de kilometraje";
  if (/recogida|domicilio/.test(t)) return "recogida del vehículo";
  if (/presencial/.test(t)) return "cobro presencial";
  if (/domingo/.test(t)) return "domingo";
  if (/penonom/.test(t)) return "extensión a penonomé";
  if (/extensi[oó]n/.test(t) && /contrato/.test(t)) return "extensión en el contrato";
  if (/seguro/.test(t) && /edad|menor/.test(t)) return "seguro menor edad";
  if (/aguadulce|agua\s*dulce/.test(t)) return "salida a aguadulce";
  return concepto!.trim();
}

/**
 * Parte cuenta vs recargo del total de hoy (sin el arreglo del día).
 *
 * “Por no pagar” SOLO si hay recargo real: línea “por no pagar a tiempo”
 * o `e.recargo` (corte ya pasado / multa PAGO_TARDE). Nunca encajar el saldo
 * en N letras + K×$5: eso etiqueta atraso de letra como recargo.
 * Ejemplo G20 (24 sep 2026): saldo $165 con letra $35 y penalidad $5 cuadraba
 * en $140 + $25. No había ni una multa PAGO_TARDE; los $25 eran deuda.
 */
function cuentaYRecargo(e: EstadoCuenta): { cuenta: number; recargo: number } {
  const acuerdoEnTotal = Math.max(
    Number((e as EstadoCuenta & { faltaAcuerdo?: number }).faltaAcuerdo) || 0,
    0,
  );
  const base = Math.max(e.totalHoy - acuerdoEnTotal, 0);
  const deLinea = e.lineas.find((l) => l.concepto === "por no pagar a tiempo");
  const recargo = deLinea && deLinea.monto > 0.009 ? deLinea.monto : Math.max(e.recargo, 0);
  return { cuenta: Math.max(base - recargo, 0), recargo };
}

export type ExtractoArmado = {
  lineas: LineaExtracto[];
  /** Monto que se pide HOY (letra + recargo/cierre + un ítem extra). */
  totalCobrarHoy: number;
  /** Ítem adicional elegido hoy, o null. */
  extraElegido: ItemExtraElegido | null;
};

/** Líneas + total con la regla de un solo ítem adicional. */
export function armarExtractoDiario(
  e: EstadoCuenta,
  opts?: {
    acuerdoSaldo?: number;
    extras?: LineaExtracto[];
    preferencia?: string | null;
    /** Planes que esperan detrás del que se está cobrando. No suman. */
    enEspera?: { etiqueta: string; saldo: number }[];
    /** ISO YYYY-MM-DD del día del extracto (para saber si es domingo). */
    hoy?: string;
  },
): ExtractoArmado {
  const extrasAll = (opts?.extras ?? []).filter((x) => x.monto > 0.009);
  // Domingo vive en domingoSaldo (aparte): no se resta de la letra.
  const extrasDomingo = extrasAll.filter((x) => esEtiquetaDomingo(x.etiqueta));
  const extrasParaSaldo = extrasAll.filter((x) => !esEtiquetaDomingo(x.etiqueta));
  const hoyIso =
    opts?.hoy ??
    (e as EstadoCuenta & { hoyIso?: string }).hoyIso ??
    hoyPanama();
  const hoyEsDomingo = esDomingo(hoyIso);

  const baldeDomingo = extrasDomingo.reduce((s, x) => s + x.monto, 0);
  const cuotaDom =
    Math.max(Number(e.cuotaDomingo) || 0, 0) ||
    Math.max(Number(e.cuotaHoy) || 0, 0);
  const pagadoDomingoHoy = Math.max(
    Number((e as EstadoCuenta & { pagadoDomingoHoy?: number }).pagadoDomingoHoy) || 0,
    0,
  );
  const pagadoDomingoCiclo = Math.max(
    Number((e as EstadoCuenta & { pagadoDomingoCiclo?: number }).pagadoDomingoCiclo) || 0,
    0,
  );
  // El domingo se cobra el domingo. Lun–vie solo reaparece la tajada si
  // ese domingo quedó sin pagar. Si ya la pagaron, o el balde está fechado
  // para el próximo domingo, el resto es aviso y no se suma a la letra.
  const alCorteRaw = (e as EstadoCuenta & { domingoAlCorte?: number }).domingoAlCorte;
  const bucketTajada =
    typeof alCorteRaw === "number"
      ? Math.min(Math.max(alCorteRaw, 0), baldeDomingo)
      : baldeDomingo;
  const tajada = tajadaDomingoQueFalta({
    bucketNeto: bucketTajada,
    pagadoHoy: hoyEsDomingo ? pagadoDomingoHoy : pagadoDomingoCiclo,
    cuota: cuotaDom,
  });

  // Árbol domingo:
  // - Domingo calendario: tajada = cobro del día (base), resto aviso.
  // - Lun–sáb: la tajada del domingo pasado entra al total si sigue sin pagar.
  //   El sábado no abre el domingo que viene. Tajada ya pagada: solo aviso.
  const domingoComoBase = hoyEsDomingo && tajada > 0.009;
  const tajadaEntreSemana = !hoyEsDomingo && tajada > 0.009;

  // Un cargo “otros/mant” del ledger solo está dentro de totalHoy si cabe en el
  // saldo arrastrado (pendienteAnterior). Si ya se pagó vía el saldo agregado,
  // el monto histórico del cargo NO debe vaciar la letra de hoy (caso G23 $50).
  const pa = Math.max(Number(e.pendienteAnterior) || 0, 0);
  const partes = partesSaldoAnterior({ pendienteAnterior: pa, extras: extrasParaSaldo });
  const extrasEmbebidos = partes.filter((p) => p.etiqueta !== "cuotas atrasadas");
  const embebidosSum = extrasEmbebidos.reduce((s, x) => s + x.monto, 0);

  const extrasBase = extrasEmbebidos.filter((x) => esCargoBase(x.etiqueta)); // ej. cierre
  const extrasCompetidores = extrasEmbebidos.filter((x) => !esCargoBase(x.etiqueta));
  const planPorEtiqueta = new Map<string, LineaExtracto>();
  for (const x of extrasParaSaldo) {
    if (x.cobrarHoy == null) continue;
    planPorEtiqueta.set(x.etiqueta, x);
  }
  const conCuota = (etiqueta: string, embebido: number) => {
    const plan = planPorEtiqueta.get(etiqueta);
    if (!plan || plan.cobrarHoy == null) return { cobra: embebido, resto: 0, plan };
    const cobra = Math.min(embebido, plan.cobrarHoy);
    return { cobra, resto: Math.round((embebido - cobra) * 100) / 100, plan };
  };

  let { cuenta, recargo } = cuentaYRecargo(e);
  // Solo descontar lo embebido en pendienteAnterior (anti-duplicado real).
  cuenta = Math.max(cuenta - embebidosSum, 0);

  // Domingo: la tajada va en su línea. “Cuenta” queda solo la letra impaga.
  if (domingoComoBase) {
    cuenta = Math.max(cuenta - tajada, 0);
  }

  const lineasBase: LineaExtracto[] = [];
  if (cuenta > 0.009) lineasBase.push({ etiqueta: "cuenta", monto: cuenta });
  if (domingoComoBase || tajadaEntreSemana) {
    lineasBase.push({ etiqueta: "domingo", monto: tajada });
  }

  // El abono de hoy ya está neto en el saldo / totalHoy: no se re-suma como
  // “abono” (eso duplicaba y, con acuerdo, hacía creer que la letra bajaba).

  if (recargo > 0.009) lineasBase.push({ etiqueta: "por no pagar", monto: recargo });

  for (const x of extrasBase) {
    lineasBase.push(x);
  }

  const baseMonto = lineasBase.reduce((s, l) => s + l.monto, 0);

  const candidatos = candidatosDesdeExtracto({
    acuerdoHoy: Math.max(Number(e.faltaAcuerdo) || 0, 0),
    acuerdoSaldo: opts?.acuerdoSaldo,
    extras: extrasCompetidores.map((x) => {
      const { cobra } = conCuota(x.etiqueta, x.monto);
      return { etiqueta: x.etiqueta, monto: cobra, saldo: x.monto };
    }),
    domingoTajada: 0,
    domingoBalde: baldeDomingo,
  });
  const extraElegido = elegirExtraDelDia(candidatos, opts?.preferencia);
  const totalCobrarHoy = Math.round(totalConUnExtra(baseMonto, extraElegido) * 100) / 100;

  const out: LineaExtracto[] = [...lineasBase];

  // Acuerdos: si el carro tiene plan, SIEMPRE se lista.
  // - faltaAcuerdo > 0 → línea con $ y SUMA al total (extraElegido).
  // - cuota ya cubierta → aviso con saldo, sin $ de cobro (no se cobra 2 veces).
  const acuerdoHoy = Math.max(Number(e.acuerdoHoy) || 0, 0);
  const faltaAcuerdo = Math.max(Number(e.faltaAcuerdo) || 0, 0);
  const saldoAcuerdo = Math.max(Number(opts?.acuerdoSaldo) || 0, 0);
  if (faltaAcuerdo > 0.009) {
    const cobrando =
      extraElegido?.categoria === "acuerdo" &&
      Math.abs(extraElegido.montoHoy - faltaAcuerdo) < 0.05;
    const etiquetaBase =
      saldoAcuerdo > faltaAcuerdo + 0.009
        ? `acuerdos (saldo ${money(saldoAcuerdo)})`
        : "acuerdos";
    out.push({
      etiqueta: cobrando ? etiquetaBase : `${etiquetaBase} (pendiente)`,
      monto: faltaAcuerdo,
    });
  } else if (!hoyEsDomingo && (acuerdoHoy > 0.009 || saldoAcuerdo > 0.009)) {
    out.push({
      etiqueta:
        saldoAcuerdo > 0.009
          ? `acuerdos (saldo ${money(saldoAcuerdo)})`
          : "acuerdos",
      monto: 0,
      aviso: true,
    });
  }

  for (const espera of opts?.enEspera ?? []) {
    if (espera.saldo <= 0.009) continue;
    out.push({
      etiqueta: `${espera.etiqueta} (saldo ${money(espera.saldo)})`,
      monto: 0,
      aviso: true,
    });
  }

  for (const x of extrasCompetidores) {
    const baseEtiqueta = x.etiqueta.replace(/\s*\(pendiente\)\s*$/i, "");
    const { cobra, resto, plan } = conCuota(baseEtiqueta, x.monto);
    const esElegido =
      extraElegido != null &&
      extraElegido.categoria !== "acuerdo" &&
      extraElegido.categoria !== "domingo" &&
      extraElegido.etiqueta === baseEtiqueta &&
      Math.abs(extraElegido.montoHoy - cobra) < 0.05;
    if (cobra > 0.009) {
      out.push({
        etiqueta: esElegido ? baseEtiqueta : `${baseEtiqueta} (pendiente)`,
        monto: cobra,
      });
    }
    if (resto > 0.009) {
      const diaria = plan?.cuotaDiaria;
      const dom = plan?.cuotaDomingo;
      const ritmo =
        diaria != null && dom != null
          ? `, ${money(diaria)} entre semana y ${money(dom)} el domingo`
          : "";
      out.push({
        etiqueta: `${baseEtiqueta}, saldo ${money(resto)}${ritmo}`,
        monto: resto,
        aviso: true,
      });
    }
  }

  // La tajada ya está en la base. Lo que sobra del balde es el próximo domingo.
  if (domingoComoBase || tajadaEntreSemana) {
    const resto = Math.round((baldeDomingo - tajada) * 100) / 100;
    if (resto > 0.009) {
      out.push({
        etiqueta: `domingo pendiente: ${money(resto)}`,
        monto: resto,
        aviso: true,
      });
    }
  } else if (baldeDomingo > 0.009) {
    out.push({
      etiqueta: `domingo pendiente: ${money(baldeDomingo)}`,
      monto: baldeDomingo,
      aviso: true,
    });
  }

  for (const x of opts?.extras ?? []) {
    if ((x.reserva ?? 0) <= 0.009) continue;
    out.push({ etiqueta: x.etiqueta, monto: 0, aviso: true, reserva: x.reserva });
  }

  if (out.length === 0 && totalCobrarHoy > 0.009) {
    out.push({ etiqueta: "cuenta", monto: totalCobrarHoy });
  }
  return { lineas: out, totalCobrarHoy, extraElegido };
}

/** Compat: solo líneas (mismo criterio visual que `armarExtractoDiario`). */
export function lineasExtractoBase(
  e: EstadoCuenta,
  opts?: { acuerdoSaldo?: number; extras?: LineaExtracto[] },
): LineaExtracto[] {
  return armarExtractoDiario(e, opts).lineas;
}

/** Une líneas para la variable Meta (sin saltos: Meta no los acepta en params). */
export function textoDesgloseExtracto(lineas: LineaExtracto[]): string {
  return lineas
    .map((l) => (l.aviso || l.monto <= 0.009 ? l.etiqueta : `${money(l.monto)} ${l.etiqueta}`))
    .join(" · ");
}

export async function acuerdoSaldoContrato(contratoId: string): Promise<number> {
  const det = await detalleAcuerdosContrato(contratoId);
  return det.saldo;
}

export type PlanAcuerdoVista = {
  etiqueta: string;
  saldo: number;
  montoTotal: number;
  cuotaDiaria: number;
  cuotaDomingo: number;
  frecuencia: string;
  fecha: string | null;
  /** El que se cobra. Los demás esperan a que este quede en cero. */
  cobra: boolean;
};

export async function detalleAcuerdosContrato(
  contratoId: string,
): Promise<{ saldo: number; espera: { etiqueta: string; saldo: number }[]; planes: PlanAcuerdoVista[] }> {
  const map = await partirAcuerdosPorContrato([contratoId]);
  return map.get(contratoId) ?? { saldo: 0, espera: [], planes: [] };
}

export async function preferenciaAbonoContrato(contratoId: string): Promise<string | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("contratos")
    .select("prioridad_abono")
    .eq("id", contratoId)
    .maybeSingle();
  if (error) return null;
  const v = (data as { prioridad_abono?: string | null } | null)?.prioridad_abono ?? null;
  return v && v !== "menor" ? v : null;
}

/** Misma lista que el cron: el recargo ya asignado en un pago no vuelve a salir. */
export async function cargosExtraAgrupados(contratoId: string): Promise<LineaExtracto[]> {
  const map = await cargosExtraPorContrato([contratoId]);
  return map.get(contratoId) ?? [];
}

export async function acuerdosSaldoPorContrato(
  contratoIds: string[],
): Promise<Map<string, number>> {
  const partidos = await partirAcuerdosPorContrato(contratoIds);
  const out = new Map<string, number>();
  for (const [id, p] of partidos) out.set(id, p.saldo);
  return out;
}

export async function acuerdosEnEsperaPorContrato(
  contratoIds: string[],
): Promise<Map<string, { etiqueta: string; saldo: number }[]>> {
  const partidos = await partirAcuerdosPorContrato(contratoIds);
  const out = new Map<string, { etiqueta: string; saldo: number }[]>();
  for (const [id, p] of partidos) {
    if (p.espera.length) out.set(id, p.espera);
  }
  return out;
}

export async function vistaAcuerdosPorContrato(
  contratoIds: string[],
): Promise<Map<string, { saldo: number; espera: { etiqueta: string; saldo: number }[]; planes: PlanAcuerdoVista[] }>> {
  return partirAcuerdosPorContrato(contratoIds);
}

/** El saldo que se cobra es el del plan más antiguo que aún debe.
 *  Los demás quedan en espera y no entran al total. */
async function partirAcuerdosPorContrato(
  contratoIds: string[],
): Promise<Map<string, { saldo: number; espera: { etiqueta: string; saldo: number }[]; planes: PlanAcuerdoVista[] }>> {
  const out = new Map<string, { saldo: number; espera: { etiqueta: string; saldo: number }[]; planes: PlanAcuerdoVista[] }>();
  const ids = contratoIds.filter(Boolean);
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("acuerdos")
    .select("contrato_id, saldo, monto_total, descripcion, cuota_diaria, cuota_domingo, frecuencia, fecha_especifica, created_at")
    .in("contrato_id", ids)
    .eq("activo", true)
    .order("created_at", { ascending: true });
  const porId = new Map<string, {
    saldo: number;
    montoTotal: number;
    descripcion: string | null;
    cuotaDiaria: number;
    cuotaDomingo: number;
    frecuencia: string;
    fecha: string | null;
  }[]>();
  for (const a of (data ?? []) as {
    contrato_id: string;
    saldo: number;
    monto_total: number | null;
    descripcion: string | null;
    cuota_diaria: number | null;
    cuota_domingo: number | null;
    frecuencia: string | null;
    fecha_especifica: string | null;
  }[]) {
    const lista = porId.get(a.contrato_id) ?? [];
    lista.push({
      saldo: Math.max(Number(a.saldo) || 0, 0),
      montoTotal: Math.max(Number(a.monto_total) || 0, 0),
      descripcion: a.descripcion,
      cuotaDiaria: Math.max(Number(a.cuota_diaria) || 0, 0),
      cuotaDomingo: Math.max(Number(a.cuota_domingo) || 0, 0),
      frecuencia: a.frecuencia || "dia",
      fecha: a.fecha_especifica?.slice(0, 10) ?? null,
    });
    porId.set(a.contrato_id, lista);
  }
  for (const [id, lista] of porId) {
    const vivos = lista.filter((a) => a.saldo > 0.009);
    const primero = vivos[0];
    out.set(id, {
      saldo: primero?.saldo ?? 0,
      espera: vivos.slice(1).map((a) => ({
        etiqueta: (a.descripcion ?? "acuerdo en espera").trim() || "acuerdo en espera",
        saldo: a.saldo,
      })),
      planes: vivos.map((a, i) => ({
        etiqueta: (a.descripcion ?? "Acuerdo de pago").trim() || "Acuerdo de pago",
        saldo: a.saldo,
        montoTotal: a.montoTotal,
        cuotaDiaria: a.cuotaDiaria,
        cuotaDomingo: a.cuotaDomingo,
        frecuencia: a.frecuencia,
        fecha: a.fecha,
        cobra: i === 0,
      })),
    });
  }
  return out;
}

type AcumExtra = {
  debido: number;
  futuro: number;
  vence: string | null;
  /** Suma de las cuotas de hoy. Igual a `debido` si el cargo no tiene plan. */
  cobrarHoy: number;
  cuotaDiaria?: number;
  cuotaDomingo?: number;
  cuotasMixtas?: boolean;
};

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fecha en la que el cargo entra al cobro. La marca [[f:]] manda; si no, la fecha del cargo. */
function venceCargo(concepto: string | null, fecha: string | null, hoy: string): string {
  const plan = leerPlanCargo(concepto);
  const marca = plan.fecha ?? "";
  const fila = String(fecha ?? "").slice(0, 10);
  const v = /^\d{4}-\d{2}-\d{2}$/.test(marca) ? marca : fila;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : hoy;
}

/**
 * Separa lo que ya se cobra de lo que está fechado para después.
 * `debido` sigue dentro del saldo de hoy. `futuro` no abre la letra.
 */
export function partirCargosNoLetra(lineas: LineaExtracto[]): { debido: number; futuro: number } {
  let debido = 0;
  let futuro = 0;
  for (const l of lineas) {
    if (esEtiquetaDomingo(l.etiqueta)) continue;
    if ((l.reserva ?? 0) > 0.009) futuro += l.reserva ?? 0;
    else debido += l.monto;
  }
  return { debido: centavos(debido), futuro: centavos(futuro) };
}

export async function cargosExtraPorContrato(
  contratoIds: string[],
  hoy = hoyPanama(),
): Promise<Map<string, LineaExtracto[]>> {
  const out = new Map<string, LineaExtracto[]>();
  const ids = contratoIds.filter(Boolean);
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("contrato_id, tipo, concepto, concepto_codigo, monto, pago_id, fecha")
    .in("contrato_id", ids)
    .not("tipo", "in", "(renta,cuenta_diaria,acuerdo)")
    .order("fecha", { ascending: false });

  const maps = new Map<string, Map<string, AcumExtra>>();
  for (const f of (data ?? []) as {
    contrato_id: string;
    tipo: string;
    concepto: string | null;
    concepto_codigo: string | null;
    monto: number;
    pago_id: string | null;
    fecha: string | null;
  }[]) {
    const codigo = (f.concepto_codigo ?? "").toUpperCase();
    const monto = Number(f.monto) || 0;
    if (monto <= 0.009) continue;
    const crudo = etiquetaCargo(f.concepto, f.concepto_codigo, f.tipo);
    const esCierre =
      codigo === "CIERRE_SEMANA" || /cierre(\s+de)?\s+semana/i.test(`${crudo} ${f.concepto ?? ""}`);
    const esRecargo =
      !esCierre &&
      (codigo === "PAGO_TARDE" ||
        esEtiquetaRecargo(crudo) ||
        (f.tipo === "multa" && /recargo|por no pagar|pago despu[eé]s/i.test(f.concepto ?? "")));
    if (esRecargo && f.pago_id) continue;
    if (!esRecargo && SKIP_CODIGOS.has(codigo)) continue;
    // Un solo balde: el pago ya cruzado se resta aquí, y lo que queda
    // sale como “por no pagar”, no metido en la letra.
    const et = esRecargo ? "por no pagar" : crudo;
    const vence = venceCargo(f.concepto, f.fecha, hoy);
    const futuro = !esEtiquetaDomingo(crudo) && vence > hoy;
    const m = maps.get(f.contrato_id) ?? new Map<string, AcumExtra>();
    const prev = m.get(et) ?? { debido: 0, futuro: 0, vence: null, cobrarHoy: 0 };
    if (futuro) {
      prev.futuro = centavos(prev.futuro + monto);
      if (!prev.vence || vence < prev.vence) prev.vence = vence;
    } else {
      prev.debido = centavos(prev.debido + monto);
      prev.cobrarHoy = centavos(prev.cobrarHoy + rebanadaDelDia(f.concepto, monto, hoy));
      const plan = leerPlanCargo(f.concepto);
      const tieneCuota =
        plan.modo === "diario" &&
        ((plan.diario ?? 0) > 0.009 || (plan.domingo ?? 0) > 0.009);
      if (tieneCuota && !prev.cuotasMixtas) {
        const d = plan.diario ?? 0;
        const s = plan.domingo ?? 0;
        if (prev.cuotaDiaria == null && prev.cuotaDomingo == null) {
          prev.cuotaDiaria = d;
          prev.cuotaDomingo = s;
        } else if (prev.cuotaDiaria !== d || prev.cuotaDomingo !== s) {
          prev.cuotaDiaria = undefined;
          prev.cuotaDomingo = undefined;
          prev.cuotasMixtas = true;
        }
      }
    }
    m.set(et, prev);
    maps.set(f.contrato_id, m);
  }
  // Si un pago ya cubrió el concepto (recargo, domingo, mantenimiento, …),
  // ese monto no se vuelve a discriminar. Primero lo vencido, luego lo futuro.
  const abonos = await abonosExtraPorContrato(ids);
  for (const [id, m] of maps) {
    const porCubeta = new Map(abonos.get(id) ?? []);
    const lineas: LineaExtracto[] = [];
    for (const [etiqueta, acum] of m) {
      const cubeta = cubetaDeConcepto("", etiqueta);
      let debido = acum.debido;
      let futuro = acum.futuro;
      let abono = cubeta ? (porCubeta.get(cubeta) ?? 0) : 0;
      if (abono > 0.009 && debido > 0.009) {
        const toma = Math.min(debido, abono);
        debido = centavos(debido - toma);
        abono = centavos(abono - toma);
      }
      if (abono > 0.009 && futuro > 0.009) {
        const toma = Math.min(futuro, abono);
        futuro = centavos(futuro - toma);
        abono = centavos(abono - toma);
      }
      if (cubeta) porCubeta.set(cubeta, abono);
      if (debido > 0.009) {
        const cobrarHoy = centavos(Math.min(acum.cobrarHoy, debido));
        lineas.push({
          etiqueta,
          monto: debido,
          ...(cobrarHoy + 0.009 < debido
            ? {
                cobrarHoy,
                cuotaDiaria: acum.cuotaDiaria,
                cuotaDomingo: acum.cuotaDomingo,
              }
            : {}),
        });
      }
      if (futuro > 0.009 && acum.vence) {
        lineas.push({
          etiqueta: `${etiqueta} (se cobra el ${fechaLarga(acum.vence)}, saldo ${money(futuro)})`,
          monto: 0,
          aviso: true,
          reserva: futuro,
        });
      }
    }
    if (lineas.length > 0) out.set(id, lineas);
  }
  return out;
}

function esEtiquetaRecargo(etiqueta: string): boolean {
  if (/cierre(\s+de)?\s+semana/i.test(etiqueta)) return false;
  return /recargo|por no pagar/i.test(etiqueta);
}

function lineasDeAsignaciones(
  raw: unknown,
): { tipo?: string; etiqueta?: string; aplicado?: number }[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as { asignaciones?: unknown }).asignaciones)) {
    return (raw as { asignaciones: { tipo?: string; etiqueta?: string; aplicado?: number }[] }).asignaciones;
  }
  return [];
}

async function abonosExtraPorContrato(ids: string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("contrato_id, asignaciones")
    .in("contrato_id", ids)
    .in("estado_conciliacion", ["conciliado", "manual"]);
  for (const p of (data ?? []) as { contrato_id: string | null; asignaciones: unknown }[]) {
    if (!p.contrato_id) continue;
    const cubetas = out.get(p.contrato_id) ?? new Map<string, number>();
    for (const a of lineasDeAsignaciones(p.asignaciones)) {
      const cubeta = cubetaDeConcepto(a.tipo ?? "", a.etiqueta);
      if (!cubeta) continue;
      const suma = Math.max(Number(a.aplicado) || 0, 0);
      if (suma <= 0.009) continue;
      cubetas.set(cubeta, Math.round(((cubetas.get(cubeta) ?? 0) + suma) * 100) / 100);
    }
    if (cubetas.size > 0) out.set(p.contrato_id, cubetas);
  }
  return out;
}

/**
 * Parte el “saldo anterior” en cuotas atrasadas + cargos vivos del ledger
 * (mantenimiento, panapass, cierre, etc.).
 * La suma de las partes ≈ pendienteAnterior (tope por lo que cabe en el saldo).
 *
 * Orden de asignación (= prioridad de cobro): cargos base (cierre) primero,
 * luego mantenimiento, luego el resto de menor a mayor. Así un “otros” viejo
 * no se come el pool antes que el mantenimiento.
 */
export function partesSaldoAnterior(opts: {
  pendienteAnterior: number;
  extras: LineaExtracto[];
}): LineaExtracto[] {
  let resto = Math.round((Number(opts.pendienteAnterior) || 0) * 100) / 100;
  if (resto <= 0.009) return [];

  const partes: LineaExtracto[] = [];
  const extras = [...(opts.extras ?? [])]
    .filter((x) => x.monto > 0.009)
    .sort((a, b) => {
      const rank = (et: string) => {
        if (esCargoBase(et)) return 0;
        if (/manten/i.test(et)) return 1;
        return 2;
      };
      const ra = rank(a.etiqueta);
      const rb = rank(b.etiqueta);
      if (ra !== rb) return ra - rb;
      return a.monto - b.monto;
    });

  for (const x of extras) {
    if (resto <= 0.009) break;
    const take = Math.min(x.monto, resto);
    if (take <= 0.009) continue;
    partes.push({ etiqueta: x.etiqueta, monto: Math.round(take * 100) / 100 });
    resto = Math.round((resto - take) * 100) / 100;
  }

  if (resto > 0.009) {
    partes.unshift({ etiqueta: "cuotas atrasadas", monto: resto });
  }

  return partes;
}
