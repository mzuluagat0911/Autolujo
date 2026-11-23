// Elige qué fichas cargar según la pregunta y la pantalla donde está el equipo.

import { moduloDeRuta } from "@/lib/equipo/modulos";
import { PANTALLAS_ASISTENTE } from "./enlaces";

export type FichaId = "cobro" | "operaciones" | "comercial" | "seguros";

const TODAS: FichaId[] = ["cobro", "operaciones", "comercial", "seguros"];

const DESDE_MODULO: Partial<Record<string, FichaId>> = {
  cartera: "cobro",
  operaciones: "operaciones",
  comercial: "comercial",
  seguros: "seguros",
  resumen: "cobro",
};

const PALABRAS: { ficha: FichaId; re: RegExp }[] = [
  {
    ficha: "cobro",
    re: /\b(cobr|debe|deuda|letra|cuota|domingo|extracto|estado\s*de\s*cuenta|saldo|recargo|acuerdo|abono|comprobante|concili|pago\s*hoy|a\s*pagar|panapass|cumplea|mensaje|cierre\s*de\s*semana)/i,
  },
  {
    ficha: "operaciones",
    re: /\b(mantenim|kit\s*de\s*tiempos|\bkit\b|atf|licencia|placa|revisado|chapist|hoja\s*de\s*vida|od[oó]metro|kilometr|kmdesde|atrasokm|informe\s*de\s*la\s*semana|n[eé]stor|amalia)/i,
  },
  {
    ficha: "comercial",
    re: /\b(luc[ií]a|comercial|lead|seguimiento|vencid|temperatura|caliente|tibio|fr[ií]o|cita|embudo|ganad|perdid|campa[nñ]a|asesor|resultados)/i,
  },
  {
    ficha: "seguros",
    re: /\b(seguro|choque|colisi[oó]n|finiquito|audiencia|fud|parte\s*polic|p[oó]liza|reclamo|taller|circulando|aseguradora|registro\s*vehicular)/i,
  },
];

function fichaDeRuta(ruta: string | null | undefined): FichaId | null {
  if (!ruta) return null;
  const path = ruta.split(/[?#]/)[0] ?? "";
  const modulo = moduloDeRuta(path);
  if (!modulo) return null;
  return DESDE_MODULO[modulo] ?? null;
}

function etiquetaRuta(ruta: string): string | null {
  const path = (ruta.split(/[?#]/)[0] ?? "").replace(/\/$/, "") || "/";
  const exacta = PANTALLAS_ASISTENTE.find((p) => p.href === path);
  if (exacta) return exacta.label;
  const padre = PANTALLAS_ASISTENTE.filter((p) => p.href !== "/" && path.startsWith(p.href + "/")).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return padre?.label ?? path;
}

/** Une la pantalla actual con las palabras de la pregunta. Sin señal → todas. */
export function fichasPara(pregunta: string, ruta?: string | null): {
  fichas: FichaId[];
  pantalla: string | null;
  desdeRuta: FichaId | null;
} {
  const desdeRuta = fichaDeRuta(ruta);
  const desdeTexto = new Set<FichaId>();
  for (const p of PALABRAS) {
    if (p.re.test(pregunta)) desdeTexto.add(p.ficha);
  }

  const unidas = new Set<FichaId>();
  if (desdeRuta) unidas.add(desdeRuta);
  for (const f of desdeTexto) unidas.add(f);

  const fichas = unidas.size === 0 ? [...TODAS] : TODAS.filter((f) => unidas.has(f));
  const pantalla = ruta ? etiquetaRuta(ruta) : null;
  return { fichas, pantalla, desdeRuta };
}

export function rutaAsistenteOk(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const limpia = raw.trim().split(/[?#]/)[0] ?? "";
  if (!limpia.startsWith("/") || limpia.startsWith("//") || limpia.includes("..")) return null;
  if (limpia.length > 120) return null;
  return limpia;
}
