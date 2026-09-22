// Regla de cobro diario de ítems adicionales (además de letra / recargo / cierre):
//
//   SIEMPRE: letra (cuenta + saldo anterior de letra) + recargo si aplica + cierre de semana
//            + abono de enganche si hay plan activo.
//   MÁS: un SOLO ítem adicional por día, en este orden:
//     1. Acuerdos de pago
//     2. Mantenimiento
//     3. Resto (domingos, extensiones, km, etc.) — el de MENOR saldo primero
//
// Cuando ese ítem llega a cero, al día siguiente entra el siguiente de la cola.
// El mensaje puede listar TODO lo debido; el TOTAL A PAGAR HOY solo incluye el
// ítem elegido.

export type CategoriaExtra = "acuerdo" | "mantenimiento" | "otro";

export type ItemExtra = {
  categoria: CategoriaExtra;
  /** Etiqueta corta para el WhatsApp (`acuerdos`, `mantenimiento`, …). */
  etiqueta: string;
  /** Monto que se pide HOY de ese ítem (cuota diaria o saldo completo). */
  montoHoy: number;
  /** Saldo total del ítem (para mostrar “saldo $XX”), si aplica. */
  saldo?: number;
};

export type ItemExtraElegido = ItemExtra & {
  /** Por qué salió hoy (para logs / agente). */
  motivo: string;
};

/** Cargos que van SIEMPRE con la letra (no compiten como “ítem adicional”). */
export function esCargoBase(etiqueta: string): boolean {
  const t = etiqueta.toLowerCase();
  return (
    t === "cuenta" ||
    t.startsWith("saldo anterior") ||
    t === "por no pagar" ||
    t.includes("cierre de semana") ||
    t === "abono" ||
    t.startsWith("abono (") ||
    t.includes("abono adelantado")
  );
}

export function categoriaDeEtiqueta(etiqueta: string): CategoriaExtra {
  const t = etiqueta.toLowerCase();
  if (t.startsWith("acuerdo") || t.includes("abono inicial")) return "acuerdo";
  if (t.includes("manten")) return "mantenimiento";
  return "otro";
}

/**
 * Elige el único ítem adicional a cobrar hoy.
 * `candidatos` ya deben excluir cargos base (cierre, etc.).
 */
export function elegirExtraDelDia(candidatos: ItemExtra[]): ItemExtraElegido | null {
  const vivos = candidatos.filter((c) => c.montoHoy > 0.009);
  if (vivos.length === 0) return null;

  const acuerdos = vivos.filter((c) => c.categoria === "acuerdo");
  if (acuerdos.length > 0) {
    // Si hubiera varios, cobramos el de menor montoHoy (cuota).
    const pick = [...acuerdos].sort((a, b) => a.montoHoy - b.montoHoy)[0]!;
    return { ...pick, motivo: "prioridad 1: acuerdos de pago" };
  }

  const mants = vivos.filter((c) => c.categoria === "mantenimiento");
  if (mants.length > 0) {
    const pick = [...mants].sort((a, b) => a.montoHoy - b.montoHoy)[0]!;
    return { ...pick, motivo: "prioridad 2: mantenimiento" };
  }

  const otros = vivos.filter((c) => c.categoria === "otro");
  if (otros.length === 0) return null;
  // Menor saldo primero; si no hay saldo, menor montoHoy.
  const pick = [...otros].sort((a, b) => {
    const sa = a.saldo != null && a.saldo > 0.009 ? a.saldo : a.montoHoy;
    const sb = b.saldo != null && b.saldo > 0.009 ? b.saldo : b.montoHoy;
    if (sa !== sb) return sa - sb;
    return a.montoHoy - b.montoHoy;
  })[0]!;
  return { ...pick, motivo: "prioridad 3: saldo menor" };
}

/**
 * Arma candidatos desde acuerdo del día + líneas extra (mantenimiento, domingo, …).
 * `cierre` y similares NO entran aquí.
 */
export function candidatosDesdeExtracto(opts: {
  acuerdoHoy: number;
  acuerdoSaldo?: number;
  extras: { etiqueta: string; monto: number }[];
}): ItemExtra[] {
  const out: ItemExtra[] = [];
  if (opts.acuerdoHoy > 0.009) {
    out.push({
      categoria: "acuerdo",
      etiqueta: "acuerdos",
      montoHoy: opts.acuerdoHoy,
      saldo: opts.acuerdoSaldo != null && opts.acuerdoSaldo > 0.009 ? opts.acuerdoSaldo : undefined,
    });
  }
  for (const x of opts.extras) {
    if (x.monto <= 0.009) continue;
    if (esCargoBase(x.etiqueta)) continue;
    const cat = categoriaDeEtiqueta(x.etiqueta);
    out.push({
      categoria: cat,
      etiqueta: x.etiqueta,
      montoHoy: x.monto,
      saldo: x.monto,
    });
  }
  return out;
}

/** Suma base (letra/recargo/cierre/abono) + el ítem elegido. */
export function totalConUnExtra(base: number, elegido: ItemExtra | null): number {
  return Math.max(base + (elegido?.montoHoy ?? 0), 0);
}
