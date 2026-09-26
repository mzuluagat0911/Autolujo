// Desglose del extracto diario (plantilla `extracto_detalle`).
// Arma las líneas que ve el cliente: cuenta, recargos, acuerdos, cargos extras.
//
// TOTAL A PAGAR HOY = letra/recargo/cierre + UN solo concepto
// (el del carro, o el de menor valor). El mensaje lista el resto como pendiente.
//
// Anti-duplicado: un cargo extra (mant/otros/cierre) solo se resta de “cuenta”
// hasta donde quepa en pendienteAnterior. La letra/cuota de hoy no se toca.
// Cargos históricos ya absorbidos por pagos (saldo arrastrado = 0) no vacían
// el extracto ni se listan como pendientes fantasmas.
//
// Acuerdos: UNA sola línea con la cuota del día + saldo al lado.

import { createServerSupabase } from "@/lib/supabase/server";
import { money, type EstadoCuenta } from "./estado-cuenta";
import {
  candidatosDesdeExtracto,
  elegirExtraDelDia,
  esCargoBase,
  esEtiquetaDomingo,
  totalConUnExtra,
  type ItemExtraElegido,
} from "./prioridad-extras";

export type LineaExtracto = { etiqueta: string; monto: number; /** Solo aviso: no lleva $ delante ni suma al total. */ aviso?: boolean };

const SKIP_CODIGOS = new Set(["PAGO_TARDE"]);

/** Etiquetas cortas para el WhatsApp, según código o texto del cargo. */
export function etiquetaCargo(concepto: string | null, codigo: string | null, tipo: string): string {
  const c = (codigo ?? "").toUpperCase();
  if (c === "CIERRE_SEMANA") return "cierre de semana";
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
  if (/cierre\s+de\s+semana/.test(t)) return "cierre de semana";
  if (/exceso/.test(t) && /km|kilom/.test(t)) return "exceso de kilometraje";
  if (/recogida|domicilio/.test(t)) return "recogida del vehículo";
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
  opts?: { acuerdoSaldo?: number; extras?: LineaExtracto[]; preferencia?: string | null },
): ExtractoArmado {
  const extrasAll = (opts?.extras ?? []).filter((x) => x.monto > 0.009);
  // Domingo vive en domingoSaldo (aparte): se lista, nunca se resta de la letra.
  const extrasDomingo = extrasAll.filter((x) => esEtiquetaDomingo(x.etiqueta));
  const extrasParaSaldo = extrasAll.filter((x) => !esEtiquetaDomingo(x.etiqueta));

  // Un cargo “otros/mant” del ledger solo está dentro de totalHoy si cabe en el
  // saldo arrastrado (pendienteAnterior). Si ya se pagó vía el saldo agregado,
  // el monto histórico del cargo NO debe vaciar la letra de hoy (caso G23 $50).
  const pa = Math.max(Number(e.pendienteAnterior) || 0, 0);
  const partes = partesSaldoAnterior({ pendienteAnterior: pa, extras: extrasParaSaldo });
  const extrasEmbebidos = partes.filter((p) => p.etiqueta !== "cuotas atrasadas");
  const embebidosSum = extrasEmbebidos.reduce((s, x) => s + x.monto, 0);

  const extrasBase = extrasEmbebidos.filter((x) => esCargoBase(x.etiqueta)); // ej. cierre
  const extrasCompetidores = extrasEmbebidos.filter((x) => !esCargoBase(x.etiqueta));

  let { cuenta, recargo } = cuentaYRecargo(e);
  // Solo descontar lo embebido en pendienteAnterior (anti-duplicado real).
  cuenta = Math.max(cuenta - embebidosSum, 0);

  const lineasBase: LineaExtracto[] = [];
  if (cuenta > 0.009) lineasBase.push({ etiqueta: "cuenta", monto: cuenta });

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
    extras: extrasCompetidores,
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
  } else if (acuerdoHoy > 0.009 || saldoAcuerdo > 0.009) {
    out.push({
      etiqueta:
        saldoAcuerdo > 0.009
          ? `acuerdos (saldo ${money(saldoAcuerdo)})`
          : "acuerdos",
      monto: 0,
      aviso: true,
    });
  }

  // La cuota del domingo de mañana no se anuncia en el extracto.
  // Si hay domingos ya debidos, van en la línea de pendiente (aviso, no suma).

  for (const x of extrasCompetidores) {
    const esElegido =
      extraElegido != null &&
      extraElegido.categoria !== "acuerdo" &&
      extraElegido.etiqueta === x.etiqueta &&
      Math.abs(extraElegido.montoHoy - x.monto) < 0.05;
    const baseEtiqueta = x.etiqueta.replace(/\s*\(pendiente\)\s*$/i, "");
    out.push({
      etiqueta: esElegido ? baseEtiqueta : `${baseEtiqueta} (pendiente)`,
      monto: x.monto,
    });
  }

  // Domingo arrastrado: se menciona, no es cobro de hoy (sábado ni entre semana).
  for (const x of extrasDomingo) {
    const baseEtiqueta = x.etiqueta.replace(/\s*\(pendiente\)\s*$/i, "");
    out.push({
      etiqueta: `${baseEtiqueta} pendiente: ${money(x.monto)}`,
      monto: x.monto,
      aviso: true,
    });
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
  const sb = createServerSupabase();
  const { data } = await sb
    .from("acuerdos")
    .select("saldo")
    .eq("contrato_id", contratoId)
    .eq("activo", true);
  return ((data ?? []) as { saldo: number }[]).reduce((s, a) => s + Math.max(Number(a.saldo) || 0, 0), 0);
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

export async function cargosExtraAgrupados(contratoId: string): Promise<LineaExtracto[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("tipo, concepto, concepto_codigo, monto")
    .eq("contrato_id", contratoId)
    .not("tipo", "in", "(renta,cuenta_diaria,acuerdo)")
    .order("fecha", { ascending: false })
    .limit(40);

  const map = new Map<string, number>();
  for (const f of (data ?? []) as {
    tipo: string;
    concepto: string | null;
    concepto_codigo: string | null;
    monto: number;
  }[]) {
    const codigo = f.concepto_codigo ?? "";
    if (SKIP_CODIGOS.has(codigo.toUpperCase())) continue;
    const monto = Number(f.monto) || 0;
    if (monto <= 0.009) continue;
    const et = etiquetaCargo(f.concepto, f.concepto_codigo, f.tipo);
    map.set(et, (map.get(et) ?? 0) + monto);
  }
  return [...map.entries()].map(([etiqueta, monto]) => ({ etiqueta, monto }));
}

export async function acuerdosSaldoPorContrato(
  contratoIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = contratoIds.filter(Boolean);
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("acuerdos")
    .select("contrato_id, saldo")
    .in("contrato_id", ids)
    .eq("activo", true);
  for (const a of (data ?? []) as { contrato_id: string; saldo: number }[]) {
    out.set(a.contrato_id, (out.get(a.contrato_id) ?? 0) + Math.max(Number(a.saldo) || 0, 0));
  }
  return out;
}

export async function cargosExtraPorContrato(
  contratoIds: string[],
): Promise<Map<string, LineaExtracto[]>> {
  const out = new Map<string, LineaExtracto[]>();
  const ids = contratoIds.filter(Boolean);
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("cargos")
    .select("contrato_id, tipo, concepto, concepto_codigo, monto")
    .in("contrato_id", ids)
    .not("tipo", "in", "(renta,cuenta_diaria,acuerdo)")
    .order("fecha", { ascending: false });

  const maps = new Map<string, Map<string, number>>();
  for (const f of (data ?? []) as {
    contrato_id: string;
    tipo: string;
    concepto: string | null;
    concepto_codigo: string | null;
    monto: number;
  }[]) {
    const codigo = (f.concepto_codigo ?? "").toUpperCase();
    if (SKIP_CODIGOS.has(codigo)) continue;
    const monto = Number(f.monto) || 0;
    if (monto <= 0.009) continue;
    const et = etiquetaCargo(f.concepto, f.concepto_codigo, f.tipo);
    const m = maps.get(f.contrato_id) ?? new Map<string, number>();
    m.set(et, (m.get(et) ?? 0) + monto);
    maps.set(f.contrato_id, m);
  }
  // El cargo de recargo queda en el ledger por el monto original. Si un pago
  // ya lo asignó (tipo recargo), ese monto no se vuelve a discriminar.
  const abonoRecargo = await abonoRecargoPorContrato(ids);
  for (const [id, m] of maps) {
    let abono = abonoRecargo.get(id) ?? 0;
    const lineas: LineaExtracto[] = [];
    for (const [etiqueta, monto] of m) {
      let queda = monto;
      if (abono > 0.009 && esEtiquetaRecargo(etiqueta)) {
        const toma = Math.min(queda, abono);
        queda = Math.round((queda - toma) * 100) / 100;
        abono = Math.round((abono - toma) * 100) / 100;
      }
      if (queda > 0.009) lineas.push({ etiqueta, monto: queda });
    }
    if (lineas.length > 0) out.set(id, lineas);
  }
  return out;
}

function esEtiquetaRecargo(etiqueta: string): boolean {
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

async function abonoRecargoPorContrato(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("contrato_id, asignaciones")
    .in("contrato_id", ids)
    .in("estado_conciliacion", ["conciliado", "manual"]);
  for (const p of (data ?? []) as { contrato_id: string | null; asignaciones: unknown }[]) {
    if (!p.contrato_id) continue;
    let suma = 0;
    for (const a of lineasDeAsignaciones(p.asignaciones)) {
      const tipo = (a.tipo ?? "").toLowerCase();
      if (tipo === "recargo" || esEtiquetaRecargo(a.etiqueta ?? "")) {
        suma += Math.max(Number(a.aplicado) || 0, 0);
      }
    }
    if (suma > 0.009) out.set(p.contrato_id, (out.get(p.contrato_id) ?? 0) + suma);
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
