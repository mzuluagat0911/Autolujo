// Si el comprobante no trae hora, el pago queda con la hora en que se concilió.
// El mediodía en punto era la marca vieja de "no había hora". Un pago de oficina
// a las 12:00 sí trae hora: lo eligió el equipo.

import { hoyPanama } from "./fecha";

export const MARCA_SIN_HORA = "SIN_HORA";

type Reloj = { hora: number; minuto: number; segundo: number };

function relojPanama(iso: string): Reloj | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Panama",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const parte of fmt.formatToParts(d)) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  return { hora: Number(p.hour), minuto: Number(p.minute), segundo: Number(p.second) };
}

/** 12:00:00 en Panamá: así se guardaba un comprobante sin hora. */
export function esMediodiaSinHora(pagadoAt: string | null | undefined): boolean {
  if (!pagadoAt) return false;
  const reloj = relojPanama(pagadoAt);
  return Boolean(reloj && reloj.hora === 12 && reloj.minuto === 0 && reloj.segundo === 0);
}

export function pagoSinHora(opts: {
  origen: string | null | undefined;
  notas: string | null | undefined;
  pagadoAt: string | null | undefined;
}): boolean {
  if ((opts.origen ?? "") === "manual") return false;
  if ((opts.notas ?? "").includes(MARCA_SIN_HORA)) return true;
  return esMediodiaSinHora(opts.pagadoAt);
}

/** Si el pago no tenía hora, lo deja en el instante de la conciliación. */
export async function atribuirHoraConciliacion(
  sb: { from: (tabla: string) => any },
  pagoId: string,
  cuando: Date = new Date(),
): Promise<void> {
  const { data } = await sb
    .from("pagos")
    .select("origen, notas, pagado_at")
    .eq("id", pagoId)
    .maybeSingle();
  if (!data) return;
  const row = data as { origen?: string | null; notas?: string | null; pagado_at?: string | null };
  if (!pagoSinHora({ origen: row.origen, notas: row.notas, pagadoAt: row.pagado_at })) return;
  const { error } = await sb
    .from("pagos")
    .update({ pagado_at: cuando.toISOString(), fecha: hoyPanama(cuando) })
    .eq("id", pagoId);
  if (error) console.error("[hora-pago]", error.message);
}
