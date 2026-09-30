// Diario y domingo, o una fecha específica, se guardan junto al cargo.
// El saldo (monto) es lo que se debita el día que el cargo ya venció.
// Antes de esa fecha no entra al cobro y no abre la letra de hoy.
// Las cuotas diaria y de domingo no parten el débito: cuando vence, entra el saldo.

const MARCA = / \[\[(?:r:([\d.]+)\|([\d.]+)|f:(\d{4}-\d{2}-\d{2}))\]\]$/;

const SIN_CUOTA = new Set([
  "PAGO_TARDE",
  "CIERRE_SEMANA",
  "DOMINGOS",
  "SALIDA_INT",
  "SALIDA_LIMITE",
]);

/** Cargos a los que se les parte la cuota. La multa y el domingo del contrato no. */
export function esCargoConCuota(c: {
  tipo?: string | null;
  concepto?: string | null;
  concepto_codigo?: string | null;
}): boolean {
  const codigo = (c.concepto_codigo ?? "").toUpperCase();
  if (SIN_CUOTA.has(codigo)) return false;
  const tipo = c.tipo ?? "";
  if (tipo === "multa" || tipo === "afiliacion" || tipo === "acuerdo" || tipo === "renta") return false;
  return tipo === "otras" || tipo === "panapass" || tipo === "exceso_km" || tipo === "ajuste" || tipo === "siniestro";
}

export function conceptoSinMarca(concepto: string | null | undefined): string {
  return String(concepto ?? "").replace(MARCA, "").trim();
}

export type PlanCargo = {
  modo: "diario" | "fecha" | null;
  diario: number | null;
  domingo: number | null;
  /** Fecha en la que entra el saldo completo. Vacío si el modo es diario. */
  fecha: string | null;
};

export function leerPlanCargo(concepto: string | null | undefined): PlanCargo {
  const m = String(concepto ?? "").match(MARCA);
  if (!m) return { modo: null, diario: null, domingo: null, fecha: null };
  if (m[3]) return { modo: "fecha", diario: null, domingo: null, fecha: m[3] };
  return { modo: "diario", diario: Number(m[1]) || 0, domingo: Number(m[2]) || 0, fecha: null };
}

export function leerMontosRecargo(concepto: string | null | undefined): {
  diario: number | null;
  domingo: number | null;
} {
  const p = leerPlanCargo(concepto);
  return { diario: p.diario, domingo: p.domingo };
}

export function marcarConceptoRecargo(concepto: string, diario: number, domingo: number): string {
  const base = conceptoSinMarca(concepto) || "Cargo";
  const d = Math.round(Math.max(diario, 0) * 100) / 100;
  const s = Math.round(Math.max(domingo, 0) * 100) / 100;
  return `${base} [[r:${d}|${s}]]`;
}

/** El saldo completo se cobra ese día. No hay cuota diaria ni de domingo. */
export function marcarFechaEspecifica(concepto: string, fecha: string): string {
  const base = conceptoSinMarca(concepto) || "Cargo";
  return `${base} [[f:${fecha}]]`;
}
