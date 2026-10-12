import { horaPanama, hoyPanama } from "@/lib/cartera/fecha";

export type AvisoCita = "24h" | "dia";

/** Instante de la cita en hora de Panamá. */
export function instanteCita(fecha: string, hora: string): Date {
  const hhmm = hora.slice(0, 5);
  return new Date(`${fecha}T${hhmm}:00-05:00`);
}

/**
 * La confirmación sale el día anterior, desde 24 horas antes.
 * El recordatorio sale el día de la cita, desde las 8:00 a. m.
 * Si ambos coinciden, manda primero la confirmación.
 */
export function avisoCitaPendiente(opts: {
  fecha: string;
  hora: string;
  ahora?: Date;
  aviso24hAt?: string | null;
  avisoDiaAt?: string | null;
}): AvisoCita | null {
  const ahora = opts.ahora ?? new Date();
  const cita = instanteCita(opts.fecha, opts.hora);
  if (Number.isNaN(cita.getTime()) || ahora.getTime() >= cita.getTime()) return null;
  const hoy = hoyPanama(ahora);
  const hace24h = cita.getTime() - 24 * 60 * 60 * 1000;
  if (!opts.aviso24hAt && hoy < opts.fecha && ahora.getTime() >= hace24h) return "24h";
  if (!opts.avisoDiaAt && hoy === opts.fecha && Number(horaPanama(ahora).slice(0, 2)) >= 8) return "dia";
  return null;
}
