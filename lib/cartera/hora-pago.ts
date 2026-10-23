// La hora del pago es la hora en que se concilió. La del comprobante se usa
// solo mientras sigue pendiente. Un pago de oficina conserva la hora que
// escribió el equipo, porque ahí mismo queda registrado.

import { hoyPanama } from "./fecha";

/** Deja el pago en el instante de la conciliación. */
export async function atribuirHoraConciliacion(
  sb: { from: (tabla: string) => any },
  pagoId: string,
  cuando: Date = new Date(),
): Promise<void> {
  const { data } = await sb.from("pagos").select("origen").eq("id", pagoId).maybeSingle();
  if (!data) return;
  if ((data as { origen?: string | null }).origen === "manual") return;
  const { error } = await sb
    .from("pagos")
    .update({ pagado_at: cuando.toISOString(), fecha: hoyPanama(cuando) })
    .eq("id", pagoId);
  if (error) console.error("[hora-pago]", error.message);
}
