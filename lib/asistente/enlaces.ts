// Convierte las rutas que menciona el asistente en enlaces internos.
// Solo abre una pantalla que el usuario ya puede ver.

import { moduloDeRuta, type ModuloId } from "@/lib/equipo/modulos";

export const PANTALLAS_ASISTENTE: { href: string; label: string }[] = [
  { href: "/admin", label: "Resumen" },
  { href: "/cartera", label: "Panel de cartera" },
  { href: "/cartera/estados-cuenta", label: "Estado de cuenta" },
  { href: "/cartera/conversaciones", label: "Conversaciones" },
  { href: "/cartera/pagos", label: "Comprobantes" },
  { href: "/cartera/extractos", label: "Conciliación" },
  { href: "/cartera/vehiculos", label: "Carros" },
  { href: "/cartera/rastreo", label: "Rastreo" },
  { href: "/cartera/clientes", label: "Clientes" },
  { href: "/cartera/ex-clientes", label: "Ex clientes" },
  { href: "/cartera/tarifario", label: "Tarifario" },
  { href: "/cartera/cobros-taller", label: "Cobros de taller" },
  { href: "/operaciones", label: "Operaciones" },
  { href: "/operaciones/hoja-vida", label: "Hoja de vida" },
  { href: "/operaciones/mantenimiento", label: "Mantenimiento" },
  { href: "/operaciones/chapisteria", label: "Chapistería" },
  { href: "/operaciones/licencias", label: "Licencias" },
  { href: "/operaciones/placas", label: "Placas y revisado" },
  { href: "/cartera/empresas", label: "Empresas" },
  { href: "/admin/alcance", label: "Alcance de cartera" },
  { href: "/admin/metas", label: "Meta de cobranza" },
  { href: "/usuarios", label: "Usuarios y roles" },
  { href: "/comercial", label: "Chats de comercial" },
  { href: "/comercial/citas", label: "Citas" },
  { href: "/comercial/actividad", label: "Actividad" },
  { href: "/comercial/resultados", label: "Resultados" },
  { href: "/comercial/contrato", label: "Nuevo contrato" },
  { href: "/comercial/clientes", label: "Datos del cliente" },
  { href: "/seguros", label: "Choques" },
  { href: "/seguros/nuevo", label: "Registrar choque" },
  { href: "/seguros/polizas", label: "Pólizas" },
  { href: "/seguros/registros", label: "Registros vehiculares" },
  { href: "/seguros/registros-publicos", label: "Registros públicos" },
  { href: "/administrativo", label: "Administrativo" },
  { href: "/administrativo/inventario", label: "Inventario" },
];

const POR_HREF = new Map(PANTALLAS_ASISTENTE.map((p) => [p.href, p.label]));

export type Trozo =
  | { tipo: "texto"; texto: string }
  | { tipo: "link"; texto: string; href: string };

export function rutaPermitida(modulos: readonly ModuloId[], href: string): string | null {
  const limpia = href.trim();
  if (!limpia.startsWith("/") || limpia.startsWith("//") || limpia.includes("..")) return null;
  const path = limpia.split(/[?#]/)[0] ?? "";
  if (!POR_HREF.has(path)) return null;
  const modulo = moduloDeRuta(path);
  if (!modulo || !modulos.includes(modulo)) return null;
  return path;
}

function etiquetaDe(path: string): string {
  return POR_HREF.get(path) ?? path;
}

const MD = /\[([^\]\n]{1,80})\]\((\/[^)\s]+)\)/g;
const SUELTAS = new RegExp(
  `(${PANTALLAS_ASISTENTE.map((p) => p.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length)
    .join("|")})(?![a-z0-9/-])`,
  "g",
);

function trozosSueltos(texto: string, modulos: readonly ModuloId[]): Trozo[] {
  const out: Trozo[] = [];
  let cursor = 0;
  for (const m of texto.matchAll(SUELTAS)) {
    const index = m.index ?? 0;
    const path = rutaPermitida(modulos, m[1] ?? "");
    if (index > cursor) out.push({ tipo: "texto", texto: texto.slice(cursor, index) });
    if (path) out.push({ tipo: "link", texto: etiquetaDe(path), href: path });
    else out.push({ tipo: "texto", texto: m[0] });
    cursor = index + m[0].length;
  }
  if (cursor < texto.length) out.push({ tipo: "texto", texto: texto.slice(cursor) });
  return out.length ? out : [{ tipo: "texto", texto }];
}

export function trozosDeMensaje(texto: string, modulos: readonly ModuloId[]): Trozo[] {
  const out: Trozo[] = [];
  let cursor = 0;
  for (const m of texto.matchAll(MD)) {
    const index = m.index ?? 0;
    if (index > cursor) out.push(...trozosSueltos(texto.slice(cursor, index), modulos));
    const path = rutaPermitida(modulos, m[2] ?? "");
    const etiqueta = (m[1] ?? "").trim();
    if (path) out.push({ tipo: "link", texto: etiqueta || etiquetaDe(path), href: path });
    else out.push({ tipo: "texto", texto: etiqueta });
    cursor = index + m[0].length;
  }
  if (cursor < texto.length) out.push(...trozosSueltos(texto.slice(cursor), modulos));
  return out.length ? out : [{ tipo: "texto", texto }];
}

const NOMBRE_MODULO: Record<ModuloId, string> = {
  resumen: "Resumen",
  cartera: "Cartera",
  operaciones: "Operaciones",
  comercial: "Comercial",
  seguros: "Seguros",
  administrativo: "Administrativo",
  configuracion: "Configuración",
  equipo: "Equipo",
};

export function listaPantallas(modulos: readonly ModuloId[]): string {
  return PANTALLAS_ASISTENTE.filter((p) => rutaPermitida(modulos, p.href))
    .map((p) => `- [${p.label}](${p.href})`)
    .join("\n");
}

/** Dónde vive cada pantalla, aunque el usuario no tenga ese módulo (sin enlace). */
export function mapaCompleto(): string {
  return PANTALLAS_ASISTENTE.map((p) => {
    const m = moduloDeRuta(p.href);
    return `- ${p.label}: módulo ${m ? NOMBRE_MODULO[m] : "—"}`;
  }).join("\n");
}
