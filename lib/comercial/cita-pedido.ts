import { fechaConDia, sumarDias } from "@/lib/cartera/fecha";
import { nombreDeWhatsApp } from "./lead";
import { sedePorId } from "./sedes";

/** Celular legible. Panamá en 8 dígitos; el resto con su código de país. */
export function telefonoVisible(wa: string, celular: string | null): string {
  const raw = (celular || wa).replace(/\D/g, "");
  if (raw.startsWith("507") && raw.length === 11) {
    const d = raw.slice(3);
    return `${d.slice(0, 4)}-${d.slice(4)}`;
  }
  if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  if (raw.startsWith("57") && raw.length === 12) {
    const d = raw.slice(2);
    return `+57 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  if (raw.length > 8) return `+${raw}`;
  return celular || wa;
}

/** Un sí a la cita, y nada más. "Ok, me interesa un carro" no confirma. */
export function textoEsConfirmacion(texto: string): boolean {
  const t = texto
    .trim()
    .toLowerCase()
    .replace(/[❓❔]/g, "?")
    .replace(/[!.,]+$/g, "");
  if (!t || t.length > 40 || t.includes("?")) return false;
  return /^(?:s[ií]|ok|okay|okey|dale|confirmo|confirmad[oa]|listo|va|de acuerdo|perfecto|ah[ií] (?:voy|estar[eé]))$/.test(t);
}

function plano(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** "13:00" → "1 p. m." */
export function horaComercial(hora: string): string {
  const [hs, ms] = hora.slice(0, 5).split(":");
  let h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h)) return hora;
  const sufijo = h >= 12 ? "p. m." : "a. m.";
  h = h % 12 || 12;
  if (!m) return `${h} ${sufijo}`;
  return `${h}:${String(m).padStart(2, "0")} ${sufijo}`;
}

/** Está corrigiendo o preguntando el día de la visita que ya tiene. */
export function preguntaPorElDiaDeLaCita(texto: string): boolean {
  const t = plano(texto);
  return /mi cita|no era hoy|era hoy|es hoy|la cita es|para hoy|que dia/.test(t);
}

/** "?" o un signo suelto. No es una pregunta nueva. */
export function esDudaSuelta(texto: string): boolean {
  return /^[\s?¿!¡.❓❔]+$/.test(texto.trim());
}

/** Un "?" repite la cita solo si lo anterior no era una pregunta concreta. */
export function repiteCitaPorDuda(texto: string, anterior: string | null): boolean {
  if (!esDudaSuelta(texto)) return false;
  if (!anterior?.trim()) return true;
  const t = plano(anterior);
  return !/paz|transit|historial|llanta|colision|choque|recibo|abono|letra|cuanto|precio|donde|horario|requisit|autom|manual/.test(
    t,
  );
}

export function pideMoverLaCita(texto: string): boolean {
  const t = plano(texto);
  return /cambi|reagend|mover|pasala|pasarla|cancel|mejor en/.test(t);
}

/** El día real de la cita, sin ofrecer la otra sede. */
export function textoDeLaCitaAbierta(opts: {
  nombre: string | null;
  fecha: string;
  hora: string;
  sede: string;
  hoy: string;
}): string {
  const nombre = nombreDeWhatsApp(opts.nombre);
  const cuando =
    opts.fecha === opts.hoy
      ? `hoy, ${fechaConDia(opts.fecha)}`
      : opts.fecha === sumarDias(opts.hoy, 1)
        ? `mañana, ${fechaConDia(opts.fecha)}`
        : `el ${fechaConDia(opts.fecha)}`;
  const sede = sedePorId(opts.sede)?.nombre ?? "la sede";
  const cabeza = nombre ? `${nombre}, su cita queda` : "Su cita queda";
  return `${cabeza} ${cuando}, a las ${horaComercial(opts.hora)}, en ${sede}. Ahí lo esperamos.`;
}

/** Si la cita es hoy, no puede decir mañana. Y no ofrece moverla si no se lo pidieron. */
export function ajustarMensajeDeCita(
  texto: string,
  opts: { hoy: string; fechaCita: string | null; cliente: string },
): string {
  let out = texto;
  if (opts.fechaCita && opts.fechaCita === opts.hoy) {
    const dia = fechaConDia(opts.hoy).toLowerCase();
    if (out.toLowerCase().includes(dia)) out = out.replace(/\bmañana\b/gi, "hoy");
    out = out.replace(/\bcita de mañana\b/gi, "cita de hoy");
    out = out.replace(/\bcita para mañana\b/gi, "cita para hoy");
  }
  if (!pideMoverLaCita(opts.cliente)) {
    out = out
      .replace(/,?\s*o prefiere(?: que la)? agend(?:arla|emos) en [^?.!]+[?.!]?/gi, ".")
      .replace(/\s+\./g, ".")
      .replace(/\.\.+/g, ".")
      .replace(/\?\./g, "?");
  }
  return out.replace(/\s+/g, " ").trim();
}

/** La cita ya está en ese día, hora, sede y nombre. No hace falta volver a confirmarla. */
export function pedidoRepiteCita(
  abierta: { sede: string; fecha: string; hora: string; nombre: string } | null,
  pedido: {
    accion: string;
    sede: string | null;
    fecha: string | null;
    hora: string | null;
    nombre: string | null;
  },
): boolean {
  if (!abierta) return false;
  if (pedido.accion !== "agendar" && pedido.accion !== "reagendar") return false;
  const sede = pedido.sede ?? abierta.sede;
  const fecha = pedido.fecha ?? abierta.fecha;
  const hora = pedido.hora ?? abierta.hora;
  const nombre = (pedido.nombre ?? abierta.nombre).trim().toLowerCase();
  return (
    sede === abierta.sede &&
    fecha === abierta.fecha &&
    hora === abierta.hora &&
    nombre === abierta.nombre.trim().toLowerCase()
  );
}
