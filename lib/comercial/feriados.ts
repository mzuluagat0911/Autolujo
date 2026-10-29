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
  const nombre = fecha ? feriadoNacional(fecha) : null;
  const dia = nombre ? `Ese día es feriado (${nombre}). ` : "Ese día es feriado. ";
  return `${dia}Juan Díaz atiende de 8:00 a.m. a 12:00 m. La Chorrera no se agenda. ¿Le sirve esa mañana o el hábil siguiente?`;
}
