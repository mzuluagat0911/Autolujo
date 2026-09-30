// Diario y domingo se guardan junto al cargo. El saldo (monto) es lo que
// se debita. Estas cuotas no cambian el cobro del día.

const MARCA = / \[\[r:([\d.]+)\|([\d.]+)\]\]$/;

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

export function leerMontosRecargo(concepto: string | null | undefined): {
  diario: number | null;
  domingo: number | null;
} {
  const m = String(concepto ?? "").match(MARCA);
  if (!m) return { diario: null, domingo: null };
  return { diario: Number(m[1]) || 0, domingo: Number(m[2]) || 0 };
}

export function marcarConceptoRecargo(concepto: string, diario: number, domingo: number): string {
  const base = conceptoSinMarca(concepto) || "Cargo";
  const d = Math.round(Math.max(diario, 0) * 100) / 100;
  const s = Math.round(Math.max(domingo, 0) * 100) / 100;
  return `${base} [[r:${d}|${s}]]`;
}
