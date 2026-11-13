// Sedes de visita comercial. El horario de pago en oficina es otro.
// Panamá (Juan Díaz): lunes a viernes 8:00–16:00, sábado y domingo 8:00–12:00.
// La Chorrera: lunes a viernes 8:00–16:00, sábado 8:00–12:00. Domingo cerrado.

import { diaSemana, hoyPanama } from "@/lib/cartera/fecha";
import {
  esFeriadoNacional,
  feriadoNacional,
  jornadaOperativa,
  textoNoviembre2026,
} from "./feriados";

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

function planoSede(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "Juan días", "juandiaz" y "La Chorrera" cuentan como sede. null si nombró las dos o ninguna. */
export function sedeDesdeTexto(texto: string): SedeId | null {
  const t = planoSede(texto);
  const juan = /juan\s*dia[sz]?/.test(t) || /\bjuandia[sz]?\b/.test(t);
  const chorrera = /\bchorrera\b/.test(t);
  if (juan && chorrera) return null;
  if (juan) return "juan_diaz";
  if (chorrera) return "chorrera";
  return null;
}

/** Horas concretas según la ventana. Nunca "en punto o a la media". */
export function mensajePedirHora(sede: SedeId | null, fecha?: string | null): string {
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  if (!dia) return "La cita va cada 15 minutos, desde las 8:00. ¿Le sirve 8:00, 8:15 u 8:30?";
  const ventana = ventanaCita(sede ?? "juan_diaz", dia);
  if (!ventana) {
    if (sede === "chorrera" && ventanaCita("juan_diaz", dia)) {
      return "Ese día La Chorrera no abre. En Juan Díaz la cita va cada 15 minutos, desde las 8:00. ¿Le sirve 8:00, 8:15 u 8:30?";
    }
    return validarHorario(sede ?? "juan_diaz", dia, "09:00") ?? "¿Qué otro día le queda?";
  }
  if (ventana.hasta <= 12 * 60) {
    return "Por la mañana la cita va cada 15 minutos, desde las 8:00. ¿Le sirve 8:00, 8:15 u 8:30?";
  }
  return "La cita va cada 15 minutos. Por la mañana desde las 8:00 y por la tarde desde la 1:00. ¿Cuál le sirve?";
}

function ventanaHabitual(sede: SedeId, fecha: string): { desde: number; hasta: number } | null {
  const dia = diaSemana(fecha);
  if (sede === "chorrera" && dia === 0) return null;
  if (dia === 0 || dia === 6) return { desde: 8 * 60, hasta: 12 * 60 };
  return { desde: 8 * 60, hasta: 16 * 60 };
}

/** Minutos desde medianoche en que se puede citar, o null si ese día la sede no abre. */
export function ventanaCita(sede: SedeId, fecha: string): { desde: number; hasta: number } | null {
  const op = jornadaOperativa(fecha);
  if (op?.tipo === "cerrado") return null;
  if (op?.tipo === "media" || op?.tipo === "sabado_confirmar") {
    return { desde: 8 * 60, hasta: 12 * 60 };
  }
  if (op?.tipo === "habitual") return ventanaHabitual(sede, fecha);
  const dia = diaSemana(fecha);
  const feriado = esFeriadoNacional(fecha);
  if (sede === "chorrera" && (dia === 0 || feriado)) return null;
  if (dia === 0 || dia === 6 || feriado) return { desde: 8 * 60, hasta: 12 * 60 };
  return { desde: 8 * 60, hasta: 16 * 60 };
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
  if (!ventana) {
    const op = jornadaOperativa(fecha);
    if (op?.tipo === "cerrado") {
      const feriado = feriadoNacional(fecha);
      return `Ese día está cerrado por descanso obligatorio${feriado ? ` (${feriado})` : ""}. ¿Le sirve el hábil anterior o el siguiente?`;
    }
    const feriado = feriadoNacional(fecha);
    if (feriado) {
      return `Ese día es feriado (${feriado}). La Chorrera no se agenda. Juan Díaz atiende de 8:00 a.m. a 12:00 m.`;
    }
    return `${nombre} no abre el domingo. En Juan Díaz el domingo es de 8:00 a.m. a 12:00 m.`;
  }
  const minutos = horaAMinutos(hora);
  if (minutos == null) return "La hora va cada 15 minutos, por ejemplo 9:00, 9:15 o 9:30.";
  if (minutos < ventana.desde || minutos > ventana.hasta) {
    return `En ${nombre} ese día se cita de ${minutosAHora(ventana.desde)} a ${minutosAHora(ventana.hasta)}.`;
  }
  if (minutos % 15 !== 0) return "La cita queda cada 15 minutos, por ejemplo 9:00, 9:15 o 9:30.";
  return null;
}

export function textoSedes(hoy = hoyPanama()): string {
  const lineas = [
    "SEDES PARA LA VISITA:",
    "- Juan Díaz: lunes a viernes 8:00 a.m. a 4:00 p.m. Sábado y domingo 8:00 a.m. a 12:00 m.",
    `  Dirección: ${SEDES[0].direccion}.`,
    "- La Chorrera: lunes a viernes 8:00 a.m. a 4:00 p.m. Sábado 8:00 a.m. a 12:00 m. El domingo no se agenda.",
    `  Dirección: ${SEDES[1].direccion}.`,
    "La cita es cada 15 minutos (8:00, 8:15, 8:30…). Si una hora está tomada, ofrece la siguiente de 15 minutos, no saltes una hora. No ofrezcas una hora fuera de la ventana. Prohibido preguntar «en punto o a la media».",
    "Feriados nacionales (si el contexto no trae otra jornada): Juan Díaz 8:00 a.m. a 12:00 m. La Chorrera no se agenda. Si preguntan si abren, dilo primero.",
    "Si comercial abre ese día, también feriado, la visita y la entrega son normales: sí se puede llevar el carro el mismo día.",
    "Si preguntan cómo llegar, da la dirección. El sistema manda el video de esa sede.",
  ];
  const noviembre = textoNoviembre2026(hoy);
  if (noviembre) lineas.push(noviembre);
  return lineas.join("\n");
}
