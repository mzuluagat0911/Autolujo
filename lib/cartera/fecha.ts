// Tiempo del negocio: TODO se mide en hora de Panamá, no en UTC.
// El servidor corre en UTC y Panamá es UTC−5, así que entre las 7:00 p.m. y la
// medianoche `new Date().toISOString()` ya devuelve el día siguiente. Usar estos
// helpers en cualquier parte que compare o guarde una fecha del negocio.

export const TZ = "America/Panama";

/** Hora a la que se pierde el descuento por pago puntual. */
export const HORA_CORTE = 19;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function partesPanama(d: Date): { fecha: string; hora: number; minuto: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const parte of fmt.formatToParts(d)) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    hora: Number(p.hour),
    minuto: Number(p.minute),
  };
}

/** Fecha de hoy en Panamá, "YYYY-MM-DD". */
export function hoyPanama(d: Date = new Date()): string {
  return partesPanama(d).fecha;
}

/** Hora actual en Panamá, "19:45". */
export function horaPanama(d: Date = new Date()): string {
  const { hora, minuto } = partesPanama(d);
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

/** ¿Ya pasaron las 7:00 p.m. en Panamá? (se perdió el descuento del día) */
export function pasoCorte(d: Date = new Date()): boolean {
  return partesPanama(d).hora >= HORA_CORTE;
}

/** Día de la semana de una fecha "YYYY-MM-DD" (0 = domingo). */
export function diaSemana(fecha: string): number {
  // Anclado al mediodía UTC para que ningún desfase de zona cambie el día.
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export function esDomingo(fecha: string): boolean {
  return diaSemana(fecha) === 0;
}

/** Suma (o resta) días a una fecha "YYYY-MM-DD". */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "29 de agosto" */
export function fechaLarga(fecha: string): string {
  const [, mes, dia] = fecha.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]}`;
}

/** "sábado 29 de agosto" */
export function fechaConDia(fecha: string): string {
  return `${DIAS[diaSemana(fecha)]} ${fechaLarga(fecha)}`;
}

/** Instante en zona Panamá → Date UTC. */
export function instantePanama(fecha: string, hora: number, minuto = 0): Date {
  return new Date(
    `${fecha}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00-05:00`,
  );
}

/** Límites del día operativo en Panamá (para consultas a `pagado_at`). */
export function rangoDiaPanama(fecha: string): { desde: Date; corte: Date; hasta: Date } {
  return {
    desde: instantePanama(fecha, 0, 0),
    corte: instantePanama(fecha, HORA_CORTE, 0),
    hasta: instantePanama(sumarDias(fecha, 1), 0, 0),
  };
}

/** ¿El pago entró ese día en Panamá y antes de las 7:00 p.m.? */
export function esPagoPuntual(pagadoAt: string | Date, fechaDia: string): boolean {
  const d = typeof pagadoAt === "string" ? new Date(pagadoAt) : pagadoAt;
  const { fecha, hora, minuto } = partesPanama(d);
  if (fecha !== fechaDia) return false;
  return hora < HORA_CORTE;
}

/** ¿Hubo algún pago ese día en Panamá (puntual o tarde)? */
export function esPagoDelDia(pagadoAt: string | Date, fechaDia: string): boolean {
  const d = typeof pagadoAt === "string" ? new Date(pagadoAt) : pagadoAt;
  return partesPanama(d).fecha === fechaDia;
}

/** Arma `pagado_at` desde fecha + hora "HH:mm" del formulario. */
export function pagadoAtDesdeForm(fecha: string, hora: string): string {
  const [h, m] = hora.split(":").map((x) => Number(x));
  return instantePanama(fecha, h || 0, m || 0).toISOString();
}

/** Fecha contable (columna `fecha`) a partir del instante real del pago. */
export function fechaContable(pagadoAt: string | Date): string {
  const d = typeof pagadoAt === "string" ? new Date(pagadoAt) : pagadoAt;
  return hoyPanama(d);
}
