// Sedes de visita comercial. El horario de pago en oficina es otro.
// Panamá (Juan Díaz): lunes a viernes 8:00–15:30, sábado y domingo 8:00–12:00.
// La Chorrera: lunes a viernes 8:00–15:30, sábado 8:00–12:00. Domingo cerrado.

import { diaSemana } from "@/lib/cartera/fecha";

export type SedeId = "juan_diaz" | "chorrera";

export type Sede = {
  id: SedeId;
  nombre: string;
  direccion: string;
  maps: string;
};

export const SEDES: Sede[] = [
  {
    id: "juan_diaz",
    nombre: "Juan Díaz",
    direccion:
      "San Fernando, Calle 131 Este, entrando por la Iglesia Nuestra Señora de la Candelaria; galera a mano izquierda, fachada negra",
    maps: "https://www.google.com/maps/search/?api=1&query=Iglesia+Nuestra+Se%C3%B1ora+de+la+Candelaria+Calle+131+Este+San+Fernando+Juan+D%C3%ADaz+Panam%C3%A1",
  },
  {
    id: "chorrera",
    nombre: "La Chorrera",
    direccion: "Barrio Colón, Calle 11 de Octubre, Local 3 (frente al parque del Barrio Vega)",
    maps: "https://www.google.com/maps/search/?api=1&query=Calle+11+de+Octubre+Barrio+Col%C3%B3n+La+Chorrera+Panam%C3%A1",
  },
];

export function sedePorId(id: string | null | undefined): Sede | null {
  return SEDES.find((s) => s.id === id) ?? null;
}

/** Minutos desde medianoche en que se puede citar, o null si ese día la sede no abre. */
export function ventanaCita(sede: SedeId, fecha: string): { desde: number; hasta: number } | null {
  const dia = diaSemana(fecha);
  if (sede === "chorrera" && dia === 0) return null;
  if (dia === 0 || dia === 6) return { desde: 8 * 60, hasta: 12 * 60 };
  return { desde: 8 * 60, hasta: 15 * 60 + 30 };
}

export function horaAMinutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutosAHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** null si la hora cabe. Si no, el texto para decírselo al cliente. */
export function validarHorario(sede: SedeId, fecha: string, hora: string): string | null {
  const ventana = ventanaCita(sede, fecha);
  const nombre = sedePorId(sede)?.nombre ?? "esa sede";
  if (!ventana) return `${nombre} no abre el domingo. En Juan Díaz el domingo es de 8:00 a.m. a 12:00 m.`;
  const minutos = horaAMinutos(hora);
  if (minutos == null) return "La hora tiene que ser en punto o y media, por ejemplo 9:00 o 9:30.";
  if (minutos < ventana.desde || minutos > ventana.hasta) {
    return `En ${nombre} ese día se cita de ${minutosAHora(ventana.desde)} a ${minutosAHora(ventana.hasta)}.`;
  }
  if (minutos % 30 !== 0) return "La cita queda en punto o a la media, por ejemplo 9:00 o 9:30.";
  return null;
}

export function textoSedes(): string {
  return [
    "SEDES PARA LA VISITA:",
    "- Juan Díaz: lunes a viernes 8:00 a.m. a 3:30 p.m. Sábado y domingo 8:00 a.m. a 12:00 m.",
    "- La Chorrera: lunes a viernes 8:00 a.m. a 3:30 p.m. Sábado 8:00 a.m. a 12:00 m. El domingo no se agenda.",
    "La cita es cada 30 minutos. No ofrezcas una hora fuera de esa ventana.",
  ].join("\n");
}
