// Motor de reglas de cartera — DETERMINÍSTICO. La matemática vive aquí, NO en el LLM.
// Reglas del negocio Auto Lujo (ver docs/PLAN.md). v1 — validar con datos reales de Luis.

import type {
  Tarifa,
  ConfigReglas,
  Obligacion,
  ResultadoPago,
  AsignacionPago,
} from "./types";

/**
 * Resuelve la letra diaria de un vehículo según el tarifario.
 * Toma la tarifa VIGENTE que mejor calce con empresa + modelo + año + km.
 * "Mejor calce" = la fila más específica (menos comodines) que aplique.
 */
export function resolveLetraDiaria(
  tarifas: Tarifa[],
  ctx: { empresaId: string; modelo?: string | null; anio?: number | null; km?: number },
): number | null {
  const km = ctx.km ?? 0;

  const candidatas = tarifas.filter((t) => {
    if (!t.vigente) return false;
    if (t.empresa_id !== null && t.empresa_id !== ctx.empresaId) return false;
    if (t.modelo !== null && normalizar(t.modelo) !== normalizar(ctx.modelo)) return false;
    if (t.anio !== null && t.anio !== ctx.anio) return false;
    if (km < t.km_min || km > t.km_max) return false;
    return true;
  });

  if (candidatas.length === 0) return null;

  // Preferir la más específica: cuenta cuántos criterios NO son comodín.
  candidatas.sort((a, b) => especificidad(b) - especificidad(a));
  return candidatas[0].letra_diaria;
}

function especificidad(t: Tarifa): number {
  let n = 0;
  if (t.empresa_id !== null) n++;
  if (t.modelo !== null) n++;
  if (t.anio !== null) n++;
  // rango de km acotado (no el default 0..MAX) también suma
  if (t.km_min > 0 || t.km_max < 2147483647) n++;
  return n;
}

function normalizar(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Distribuye un pago entre las obligaciones del día, en orden de prioridad.
 * Regla Auto Lujo: PRIMERO se cubre la cuota del/los acuerdo(s), LUEGO la cuenta diaria.
 *
 * Ejemplo real: cuota diaria $30 + acuerdo $5 (debería pagar $35), pero envía $20
 *   → $5 al acuerdo, $15 a la cuenta. Queda saldo pendiente en la cuenta.
 */
export function distribuirPago(monto: number, obligaciones: Obligacion[]): ResultadoPago {
  const orden = [...obligaciones].sort((a, b) => a.prioridad - b.prioridad);
  const asignaciones: AsignacionPago[] = [];
  let restante = redondear(monto);

  for (const o of orden) {
    if (restante <= 0) break;
    const aplicado = Math.min(restante, redondear(o.monto));
    if (aplicado > 0) {
      asignaciones.push({
        tipo: o.tipo,
        ref: o.ref,
        aplicado: redondear(aplicado),
        etiqueta: o.etiqueta,
      });
      restante = redondear(restante - aplicado);
    }
  }

  return {
    asignaciones,
    sobrante: redondear(restante),
    totalAplicado: redondear(monto - restante),
  };
}

/**
 * Determina si un pago genera multa por tardío.
 * El pago debe entrar antes de `hora_limite_pago` (19:00). Después, multa.
 * Nota: la multa es NEGOCIABLE — esto solo calcula la sugerida; el gerente puede ajustarla.
 */
export function calcularMulta(
  horaPago: Date,
  cfg: ConfigReglas,
): { aplica: boolean; monto: number } {
  const [h, m] = cfg.hora_limite_pago.split(":").map(Number);
  const limite = new Date(horaPago);
  limite.setHours(h, m ?? 0, 0, 0);
  const aplica = horaPago.getTime() > limite.getTime();
  return { aplica, monto: aplica ? cfg.multa_tarde : 0 };
}

/**
 * Calcula el cargo por exceso de kilometraje del mes.
 * Límite 8.000 km/mes; luego $2 por cada 10 km de exceso.
 */
export function calcularExcesoKm(kmDelMes: number, cfg: ConfigReglas): number {
  const exceso = Math.max(0, kmDelMes - cfg.km_incluido_mes);
  if (exceso <= 0) return 0;
  const bloques = Math.ceil(exceso / cfg.exceso_km_bloque);
  return redondear(bloques * cfg.exceso_km_costo);
}

/**
 * Día operativo al que corresponde un pago.
 * El día NO cierra a medianoche sino a las 12:00 del mediodía: un pago antes del
 * mediodía cuenta para el día calendario ANTERIOR.
 */
export function diaOperativo(fecha: Date, cfg: ConfigReglas): Date {
  const [h] = cfg.hora_cierre.split(":").map(Number);
  const d = new Date(fecha);
  if (fecha.getHours() < (h ?? 12)) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Domingo = "libre pero no gratuito": no cuenta cuota, pero acumula pendientes. */
export function esDomingo(fecha: Date): boolean {
  return fecha.getDay() === 0;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
