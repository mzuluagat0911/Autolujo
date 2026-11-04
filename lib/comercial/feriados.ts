import { sumarDias } from "@/lib/cartera/fecha";

const FIJOS: { mmdd: string; nombre: string }[] = [
  { mmdd: "01-01", nombre: "Año Nuevo" },
  { mmdd: "01-09", nombre: "Día de los Mártires" },
  { mmdd: "05-01", nombre: "Día del Trabajo" },
  { mmdd: "11-03", nombre: "Separación de Panamá de Colombia" },
  { mmdd: "11-04", nombre: "Día de la Bandera" },
  { mmdd: "11-05", nombre: "Día de Colón" },
  { mmdd: "11-10", nombre: "Primer Grito de Independencia" },
  { mmdd: "11-28", nombre: "Independencia de España" },
  { mmdd: "12-08", nombre: "Día de las Madres" },
  { mmdd: "12-25", nombre: "Navidad" },
];

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8,
  sep: 9, oct: 10, nov: 11, dic: 12,
};

function plano(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Domingo de Pascua, algoritmo gregoriano. */
export function domingoPascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function movibles(anio: number): { fecha: string; nombre: string }[] {
  const pascua = domingoPascua(anio);
  return [
    { fecha: sumarDias(pascua, -48), nombre: "Lunes de Carnaval" },
    { fecha: sumarDias(pascua, -47), nombre: "Martes de Carnaval" },
    { fecha: sumarDias(pascua, -3), nombre: "Jueves Santo" },
    { fecha: sumarDias(pascua, -2), nombre: "Viernes Santo" },
  ];
}

export function feriadoNacional(fecha: string): string | null {
  const anio = Number(fecha.slice(0, 4));
  const mmdd = fecha.slice(5);
  const fijo = FIJOS.find((f) => f.mmdd === mmdd);
  if (fijo) return fijo.nombre;
  return movibles(anio).find((f) => f.fecha === fecha)?.nombre ?? null;
}

export function esFeriadoNacional(fecha: string): boolean {
  return feriadoNacional(fecha) != null;
}

/** Cómo abre el área comercial ese día. Manda sobre la regla genérica de feriado. */
export type JornadaOperativa =
  | { tipo: "habitual" }
  | { tipo: "media" }
  | { tipo: "cerrado" }
  | { tipo: "sabado_confirmar" };

/** Noviembre 2026: calendario que pasó el equipo, no el feriado de ley. */
const OPERATIVA: Record<string, JornadaOperativa> = {
  "2026-11-03": { tipo: "media" },
  "2026-11-04": { tipo: "habitual" },
  "2026-11-05": { tipo: "cerrado" },
  "2026-11-10": { tipo: "media" },
  "2026-11-28": { tipo: "sabado_confirmar" },
};

export function jornadaOperativa(fecha: string): JornadaOperativa | null {
  return OPERATIVA[fecha] ?? null;
}

/** Bloque para el contexto de Lucía mientras rige este noviembre. */
export function textoNoviembre2026(hoy: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy) || hoy > "2026-11-28") return null;
  return [
    "NOVIEMBRE 2026 (manda sobre la regla genérica de feriado):",
    "- Lunes 2: jornada habitual (8:00 a 4:00 entre semana).",
    "- Martes 3: 8:00 a.m. a 12:00 m., medio equipo, Juan Díaz y La Chorrera. No agendes tarde.",
    "- Miércoles 4: jornada habitual, aunque sea Día de la Bandera. Las dos sedes 8:00 a 4:00.",
    "- Jueves 5: CERRADO por descanso obligatorio. No agendes. Ofrece el 4 o el 6.",
    "- Martes 10: 8:00 a.m. a 12:00 m., medio equipo, las dos sedes. No agendes tarde.",
    "- Sábado 28: Independencia de España. Por ahora se agenda como sábado (8 a 12, las dos sedes). Aún se confirma si se labora; no lo cierres.",
  ].join("\n");
}

/** Línea de HOY para el contexto. null si no hay nada especial. */
export function textoJornadaHoy(fecha: string): string | null {
  const op = jornadaOperativa(fecha);
  const nombre = feriadoNacional(fecha);
  if (!op) {
    if (!nombre) return null;
    return `HOY ES FERIADO (${nombre}). Juan Díaz 8:00 a 12:00. La Chorrera no se agenda.`;
  }
  if (op.tipo === "cerrado") {
    return `HOY CERRADO por descanso obligatorio${nombre ? ` (${nombre})` : ""}. No agendes. Ofrece el hábil anterior o el siguiente.`;
  }
  if (op.tipo === "media") {
    return `HOY ${nombre ? `es feriado (${nombre}). ` : ""}Comercial atiende 8:00 a.m. a 12:00 m. en Juan Díaz y La Chorrera, medio equipo. No agendes tarde.`;
  }
  if (op.tipo === "habitual") {
    return `HOY ${nombre ? `es ${nombre}, pero ` : ""}comercial trabaja jornada habitual. Las dos sedes 8:00 a.m. a 4:00 p.m.`;
  }
  return `HOY ${nombre ? `es ${nombre}. ` : ""}Por ahora se agenda como sábado, 8:00 a.m. a 12:00 m. en las dos sedes. Aún se confirma si se labora.`;
}

/** "10 de noviembre", "10 nov", "2026-11-10". Si el día ya pasó, usa el año siguiente. */
export function fechaMencionada(texto: string, hoy: string): string | null {
  const t = plano(texto);
  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const nombres = Object.keys(MESES).join("|");
  const named = t.match(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${nombres})\\b`));
  if (!named) return null;
  const dia = Number(named[1]);
  const mes = MESES[named[2]];
  if (!mes || dia < 1 || dia > 31) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return null;
  const anio = Number(hoy.slice(0, 4));
  const cand = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return cand < hoy ? `${anio + 1}-${cand.slice(5)}` : cand;
}

export function preguntaSiAbreFeriado(texto: string): boolean {
  const t = plano(texto);
  return /feriado|estan abiert|abren|hay atencion|trabajan (ese|el) dia/.test(t);
}

export function textoFeriado(fecha?: string | null): string {
  const op = fecha ? jornadaOperativa(fecha) : null;
  const nombre = fecha ? feriadoNacional(fecha) : null;
  const etiqueta = nombre ? ` (${nombre})` : "";
  if (op?.tipo === "cerrado") {
    return `Ese día está cerrado por descanso obligatorio${etiqueta}. ¿Le sirve el hábil anterior o el siguiente?`;
  }
  if (op?.tipo === "media") {
    return `Ese día es feriado${etiqueta}. El área comercial atiende de 8:00 a.m. a 12:00 m. en Juan Díaz y La Chorrera, con medio equipo. ¿Le sirve esa mañana?`;
  }
  if (op?.tipo === "habitual") {
    return `Ese día${etiqueta ? ` es ${nombre}` : " es feriado"}, pero comercial trabaja jornada habitual. Juan Díaz y La Chorrera de 8:00 a.m. a 4:00 p.m. ¿Le sirve a las 8, las 9 o las 10, o por la tarde a la 1, las 2 o las 3?`;
  }
  if (op?.tipo === "sabado_confirmar") {
    return `Ese sábado es feriado${etiqueta}. Por ahora se agenda de 8:00 a.m. a 12:00 m. en las dos sedes, como un sábado. Si cambia, le avisamos. ¿Le sirve esa mañana?`;
  }
  const dia = nombre ? `Ese día es feriado (${nombre}). ` : "Ese día es feriado. ";
  return `${dia}Juan Díaz atiende de 8:00 a.m. a 12:00 m. La Chorrera no se agenda. ¿Le sirve esa mañana o el hábil siguiente?`;
}
