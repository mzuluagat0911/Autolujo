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
