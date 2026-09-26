/** Rubros que el equipo puede marcar al registrar un pago a mano. */
export type RubroPago =
  | "cuenta"
  | "recargo"
  | "mantenimiento"
  | "panapass"
  | "domingo"
  | "cierre_semana"
  | "acuerdo"
  | "exceso_km"
  | "ajuste"
  | "salida_interior";

export const RUBROS_PAGO: { value: RubroPago; label: string }[] = [
  { value: "cuenta", label: "Cuota / cuenta" },
  { value: "recargo", label: "Recargo (pago tarde)" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "acuerdo", label: "Acuerdo / arreglo" },
  { value: "panapass", label: "Panapass" },
  { value: "domingo", label: "Domingo" },
  { value: "cierre_semana", label: "Cierre de semana" },
  { value: "exceso_km", label: "Exceso de km" },
  { value: "ajuste", label: "Negociación / ajuste" },
];

export function etiquetaRubro(rubro: string | null | undefined): string {
  if (!rubro || rubro === "cuenta") return "cuota / cuenta";
  if (rubro === "salida_interior") return "salida al interior";
  const hit = RUBROS_PAGO.find((r) => r.value === rubro);
  return hit?.label.toLowerCase() ?? rubro;
}

export function esRubroConcepto(v: string): v is Exclude<RubroPago, "salida_interior"> {
  return RUBROS_PAGO.some((r) => r.value === v);
}

/**
 * Conceptos que el equipo puede poner al reasignar un pago o al cargar un cargo.
 * `cubeta` es la etiqueta con la que el extracto los agrupa. Si es null, es letra.
 */
export const CONCEPTOS_PAGO = [
  { value: "cuenta_diaria", label: "Cuota / letra", cubeta: null },
  { value: "saldo_anterior", label: "Saldo anterior", cubeta: null },
  { value: "acuerdo", label: "Arreglo / acuerdo", cubeta: null },
  { value: "recargo", label: "Recargo", cubeta: "por no pagar" },
  { value: "domingo", label: "Domingo", cubeta: "domingo" },
  { value: "mantenimiento", label: "Mantenimiento", cubeta: "mantenimiento" },
  { value: "panapass", label: "Panapass", cubeta: "panapass" },
  { value: "cierre_semana", label: "Cierre de semana", cubeta: "cierre de semana" },
  { value: "exceso_km", label: "Exceso de km", cubeta: "exceso de kilometraje" },
  { value: "ajuste", label: "Negociación / ajuste", cubeta: "ajuste" },
  { value: "salida_interior", label: "Salida al interior", cubeta: null },
] as const;

export type ConceptoPago = (typeof CONCEPTOS_PAGO)[number]["value"];

/** Cargo que se crea si asignan el concepto y no había uno pendiente que lo cubra. */
export const CARGO_DE_CONCEPTO: Record<
  string,
  { tipo: string; codigo: string | null; concepto: string }
> = {
  domingo: { tipo: "otras", codigo: "DOMINGOS", concepto: "Domingo" },
  mantenimiento: { tipo: "otras", codigo: "124", concepto: "Mantenimiento" },
  panapass: { tipo: "panapass", codigo: "PANAPASS", concepto: "Panapass" },
  cierre_semana: { tipo: "multa", codigo: "CIERRE_SEMANA", concepto: "No cerrar semana al día" },
  exceso_km: { tipo: "exceso_km", codigo: "122", concepto: "Exceso de kilometraje" },
  ajuste: { tipo: "ajuste", codigo: null, concepto: "Ajuste / negociación" },
};

export function cubetaDeConcepto(tipo: string, etiqueta?: string | null): string | null {
  const t = (tipo ?? "").toLowerCase();
  const hit = CONCEPTOS_PAGO.find((c) => c.value === t);
  if (hit?.cubeta) return hit.cubeta;
  const et = (etiqueta ?? "").trim().toLowerCase();
  if (/recargo|por no pagar/.test(et)) return "por no pagar";
  if (/\bdomingo\b/.test(et)) return "domingo";
  if (/manten/.test(et)) return "mantenimiento";
  if (/panapass/.test(et)) return "panapass";
  if (/cierre\s+de\s+semana/.test(et)) return "cierre de semana";
  if (/exceso/.test(et) && /km|kilom/.test(et)) return "exceso de kilometraje";
  if (/negociaci[oó]n|^ajuste\b/.test(et)) return "ajuste";
  return null;
}
