// Regla de cobro diario de ítems adicionales (además de letra / recargo / cierre):
//
//   SIEMPRE: letra (cuenta + saldo anterior de letra) + recargo si aplica + cierre de semana
//            + abono de enganche si hay plan activo.
//   MÁS: un SOLO concepto por día. Sin preferencia del carro: el de menor valor.
//   Con preferencia (prioridad_abono): ese concepto.
//
//   DOMINGO (árbol):
//   - Entrada = N × cuota_domingo. Se cobra de a UNA tajada (= cuota_domingo),
//     nunca el pot entero de un golpe.
//   - Sábado (mañana = domingo): solo AVISO. No entra al total todavía.
//   - Domingo: la tajada ES el cobro del día (reemplaza la letra).
//   - Lun–vie: si el balde sigue pendiente, la tajada SÍ entra al total como
//     el concepto del día (letra + domingo), salvo que otro concepto gane el
//     cupo (preferencia / menor valor / acuerdo abierto).
//
// Cuando ese ítem llega a cero, al día siguiente entra el siguiente de la cola.
// El mensaje puede listar TODO lo debido; el TOTAL A PAGAR HOY solo incluye el
// ítem elegido.

export type CategoriaExtra = "acuerdo" | "mantenimiento" | "domingo" | "otro";

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

/** Saldo/cuota de domingo. */
export function esEtiquetaDomingo(etiqueta: string): boolean {
  return /\bdomingo\b/i.test(etiqueta);
}

export function categoriaDeEtiqueta(etiqueta: string): CategoriaExtra {
  const t = etiqueta.toLowerCase();
  if (t.startsWith("acuerdo") || t.includes("abono inicial")) return "acuerdo";
  if (t.includes("manten")) return "mantenimiento";
  if (esEtiquetaDomingo(t)) return "domingo";
  return "otro";
}

/**
 * Tajada de domingo que puede pedirse HOY (= cuota_domingo, tope el balde).
 * Nunca el pot entero.
 */
export function tajadaDomingo(opts: {
  balde: number;
  cuotaDomingo: number;
}): number {
  const balde = Math.max(Number(opts.balde) || 0, 0);
  if (balde <= 0.009) return 0;
  const cuota = Math.max(Number(opts.cuotaDomingo) || 0, 0);
  if (cuota > 0.009) return Math.min(cuota, balde);
  return balde;
}

/**
 * Elige el único concepto adicional del día (además del recargo).
 * Sin preferencia del carro: el de menor monto. Con preferencia: ese, si hay.
 */
export function elegirExtraDelDia(
  candidatos: ItemExtra[],
  preferencia?: string | null,
): ItemExtraElegido | null {
  const vivos = candidatos.filter((c) => c.montoHoy > 0.009);
  if (vivos.length === 0) return null;

  const pref = (preferencia ?? "").trim().toLowerCase();
  if (pref && pref !== "menor") {
    const hit = vivos.find((c) => c.categoria === pref || c.etiqueta.toLowerCase().includes(pref));
    if (hit) return { ...hit, motivo: `prioridad del carro: ${pref}` };
  }

  const pick = [...vivos].sort((a, b) => a.montoHoy - b.montoHoy)[0]!;
  return { ...pick, motivo: "menor valor" };
}

/**
 * Arma candidatos desde acuerdo del día + líneas extra (mantenimiento, domingo…).
 * `cierre` y similares NO entran aquí.
 *
 * Domingo: solo compite lun–vie (y si el caller lo mete). El sábado no lo
 * manda el caller; el domingo del calendario se cobra aparte como “letra”.
 */
export function candidatosDesdeExtracto(opts: {
  acuerdoHoy: number;
  acuerdoSaldo?: number;
  extras: { etiqueta: string; monto: number }[];
  /** Tajada de domingo a cobrarse hoy (0 = no compite). */
  domingoTajada?: number;
  /** Saldo total del balde DOMINGOS (para mostrar). */
  domingoBalde?: number;
}): ItemExtra[] {
  const out: ItemExtra[] = [];
  const acuerdoAbierto = (opts.acuerdoSaldo ?? 0) > 0.009;
  if (opts.acuerdoHoy > 0.009) {
    out.push({
      categoria: "acuerdo",
      etiqueta: "acuerdos",
      montoHoy: opts.acuerdoHoy,
      saldo: acuerdoAbierto ? opts.acuerdoSaldo : undefined,
    });
  }
  // Con saldo de acuerdo, ese concepto ocupa el cupo hasta quedar en cero.
  // Mantenimiento, domingo y el resto se listan, no entran al total.
  if (acuerdoAbierto) return out;

  const tajada = Math.max(Number(opts.domingoTajada) || 0, 0);
  if (tajada > 0.009) {
    out.push({
      categoria: "domingo",
      etiqueta: "domingo",
      montoHoy: tajada,
      saldo: Math.max(Number(opts.domingoBalde) || tajada, tajada),
    });
  }

  for (const x of opts.extras) {
    if (x.monto <= 0.009) continue;
    if (esCargoBase(x.etiqueta)) continue;
    if (esEtiquetaDomingo(x.etiqueta)) continue; // ya va como tajada
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
