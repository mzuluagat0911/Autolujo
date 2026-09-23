// Desglose del extracto diario (plantilla `extracto_detalle`).
// Arma las líneas que ve el cliente: cuenta, recargos, acuerdos, cargos extras.
//
// TOTAL A PAGAR HOY = letra/recargo/cierre/abono + UN solo ítem adicional
// (prioridad: acuerdos → mantenimiento → saldo menor). El mensaje lista todo
// lo debido; los ítems no cobrados hoy llevan “(pendiente)”.
//
// Acuerdos: UNA sola línea con la cuota del día + saldo al lado.

import { createServerSupabase } from "@/lib/supabase/server";
import { money, type EstadoCuenta } from "./estado-cuenta";
import {
  candidatosDesdeExtracto,
  elegirExtraDelDia,
  esCargoBase,
  totalConUnExtra,
  type ItemExtraElegido,
} from "./prioridad-extras";

export type LineaExtracto = { etiqueta: string; monto: number };

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
 * El arreglo se lista aparte como en los extractos de caja.
 */
function cuentaYRecargo(e: EstadoCuenta): { cuenta: number; recargo: number } {
  const pen = e.penalidad;
  const letra = e.letra;
  const acuerdoHoy = Math.max(e.acuerdoHoy, 0);
  const base = Math.max(e.totalHoy - acuerdoHoy, 0);

  if (letra > 0.009 && pen > 0.009) {
    let best: { cuenta: number; recargo: number } | null = null;
    for (let n = 1; n <= 60; n++) {
      for (let k = 0; k <= n + 1; k++) {
        const cuenta = n * letra;
        const recargo = k * pen;
        if (Math.abs(cuenta + recargo - base) < 0.05) {
          if (!best || cuenta > best.cuenta) best = { cuenta, recargo };
        }
      }
    }
    if (best) return best;
  }

  // Solo el recargo REAL (ya pasado el corte o multa registrada). Nunca inventar
  // $5 “por no pagar” solo porque hay saldo anterior — eso ensucia el extracto.
  const deLinea = e.lineas.find((l) => l.concepto === "por no pagar a tiempo");
  const recargo = deLinea && deLinea.monto > 0.009 ? deLinea.monto : e.recargo;
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
  opts?: { acuerdoSaldo?: number; extras?: LineaExtracto[] },
): ExtractoArmado {
  const extrasAll = (opts?.extras ?? []).filter((x) => x.monto > 0.009);
  const extrasBase = extrasAll.filter((x) => esCargoBase(x.etiqueta)); // ej. cierre
  const extrasCompetidores = extrasAll.filter((x) => !esCargoBase(x.etiqueta));
  const extrasSum = extrasAll.reduce((s, x) => s + x.monto, 0);

  let { cuenta, recargo } = cuentaYRecargo(e);
  // Extras ya van en saldo/totalHoy: sacarlos de “cuenta” para no duplicar.
  cuenta = Math.max(cuenta - extrasSum, 0);

  const lineasBase: LineaExtracto[] = [];
  if (cuenta > 0.009) lineasBase.push({ etiqueta: "cuenta", monto: cuenta });

  const abono = e.lineas.find((l) => l.concepto === "pagado hoy" && l.monto < -0.009);
  if (abono) lineasBase.push({ etiqueta: "abono", monto: Math.abs(abono.monto) });

  if (recargo > 0.009) lineasBase.push({ etiqueta: "por no pagar", monto: recargo });

  for (const x of extrasBase) {
    lineasBase.push(x);
  }

  const baseMonto = lineasBase.reduce((s, l) => s + l.monto, 0);

  const candidatos = candidatosDesdeExtracto({
    acuerdoHoy: e.acuerdoHoy,
    acuerdoSaldo: opts?.acuerdoSaldo,
    extras: extrasCompetidores,
  });
  const extraElegido = elegirExtraDelDia(candidatos);
  const totalCobrarHoy = Math.round(totalConUnExtra(baseMonto, extraElegido) * 100) / 100;

  const out: LineaExtracto[] = [...lineasBase];

  // Acuerdos: siempre visible si hay; “(pendiente)” si hoy no es el ítem elegido.
  if (e.acuerdoHoy > 0.009) {
    const saldoAcuerdo = Math.max(Number(opts?.acuerdoSaldo) || 0, 0);
    const cobrando =
      extraElegido?.categoria === "acuerdo" &&
      Math.abs(extraElegido.montoHoy - e.acuerdoHoy) < 0.05;
    const etiquetaBase =
      saldoAcuerdo > e.acuerdoHoy + 0.009
        ? `acuerdos (saldo ${money(saldoAcuerdo)})`
        : "acuerdos";
    out.push({
      etiqueta: cobrando ? etiquetaBase : `${etiquetaBase} (pendiente)`,
      monto: e.acuerdoHoy,
    });
  }

  // Aviso de domingo MAÑANA (cuota del día domingo, no saldo arrastrado).
  if (e.domingo && e.domingo > 0.009) {
    out.push({
      etiqueta: `domingo ${e.domingoDia ?? ""}`.trim(),
      monto: e.domingo,
    });
  }

  for (const x of extrasCompetidores) {
    const esElegido =
      extraElegido != null &&
      extraElegido.categoria !== "acuerdo" &&
      extraElegido.etiqueta === x.etiqueta &&
      Math.abs(extraElegido.montoHoy - x.monto) < 0.05;
    out.push({
      etiqueta: esElegido ? x.etiqueta : `${x.etiqueta} (pendiente)`,
      monto: x.monto,
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
    .map((l) => `${money(l.monto)} ${l.etiqueta}`)
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
  for (const [id, m] of maps) {
    out.set(
      id,
      [...m.entries()].map(([etiqueta, monto]) => ({ etiqueta, monto })),
    );
  }
  return out;
}

/**
 * Parte el “saldo anterior” en cuotas atrasadas + cargos vivos del ledger
 * (mantenimiento, panapass, cierre, etc.).
 * La suma de las partes ≈ pendienteAnterior (tope por lo que cabe en el saldo).
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
    .sort((a, b) => b.monto - a.monto);

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
