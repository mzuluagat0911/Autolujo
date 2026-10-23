// Lo que se marca en Usuarios. El menú y la dirección usan esta misma lista.
// Vive en equipo.rol para no pedir una columna nueva:
//   admin | cartera | comercial | modulos:resumen,cartera,...

export const MODULOS = [
  {
    id: "resumen",
    label: "Resumen",
    hint: "El pulso del negocio.",
  },
  {
    id: "cartera",
    label: "Cartera",
    hint: "Cobro, estados de cuenta, chats de clientes, pagos, conciliación, carros, rastreo y tarifario. También los avisos de esos chats.",
  },
  {
    id: "operaciones",
    label: "Operaciones",
    hint: "Hoja de vida, mantenimiento, chapistería, licencias y placas.",
  },
  {
    id: "comercial",
    label: "Comercial",
    hint: "Chats de ventas, citas y resultados. También los avisos de leads.",
  },
  {
    id: "seguros",
    label: "Seguros",
    hint: "Choques, paquete y pólizas.",
  },
  {
    id: "configuracion",
    label: "Configuración",
    hint: "Empresas, alcance de cartera y meta de cobranza.",
  },
  {
    id: "equipo",
    label: "Equipo",
    hint: "Crear accesos y marcar estos módulos.",
  },
] as const;

export type ModuloId = (typeof MODULOS)[number]["id"];

const ORDEN: ModuloId[] = MODULOS.map((m) => m.id);
const IDS = new Set<string>(ORDEN);

export function parseRol(rol: string | null | undefined): ModuloId[] {
  const v = (rol ?? "").trim();
  if (v === "admin") return [...ORDEN];
  if (v === "cartera") return ["cartera"];
  if (v === "comercial") return ["comercial"];
  if (!v.startsWith("modulos:")) return [];
  const pedidos = new Set(
    v
      .slice("modulos:".length)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => IDS.has(s)),
  );
  return ORDEN.filter((id) => pedidos.has(id));
}

export function serializarRol(ids: readonly string[]): string {
  const pedidos = new Set(ids.filter((id) => IDS.has(id)));
  const lista = ORDEN.filter((id) => pedidos.has(id));
  if (lista.length === ORDEN.length) return "admin";
  if (lista.length === 1 && lista[0] === "cartera") return "cartera";
  if (lista.length === 1 && lista[0] === "comercial") return "comercial";
  return `modulos:${lista.join(",")}`;
}

export function moduloDeRuta(path: string): ModuloId | null {
  if (path === "/usuarios" || path.startsWith("/usuarios/")) return "equipo";
  if (path === "/admin/metas" || path.startsWith("/admin/metas/")) return "configuracion";
  if (path === "/admin/alcance" || path.startsWith("/admin/alcance/")) return "configuracion";
  if (path === "/cartera/empresas" || path.startsWith("/cartera/empresas/")) return "configuracion";
  if (path === "/admin" || path.startsWith("/admin/")) return "resumen";
  if (path === "/cartera" || path.startsWith("/cartera/")) return "cartera";
  if (path === "/operaciones" || path.startsWith("/operaciones/")) return "operaciones";
  if (path === "/comercial" || path.startsWith("/comercial/")) return "comercial";
  if (path === "/seguros" || path.startsWith("/seguros/")) return "seguros";
  if (path === "/administrativo" || path.startsWith("/administrativo/")) return "resumen";
  return null;
}

export function puedeVerRuta(modulos: readonly ModuloId[], path: string): boolean {
  const modulo = moduloDeRuta(path);
  if (!modulo) return true;
  return modulos.includes(modulo);
}

const CASA: { id: ModuloId; href: string }[] = [
  { id: "resumen", href: "/admin" },
  { id: "cartera", href: "/cartera" },
  { id: "operaciones", href: "/operaciones" },
  { id: "comercial", href: "/comercial" },
  { id: "seguros", href: "/seguros" },
  { id: "configuracion", href: "/cartera/empresas" },
  { id: "equipo", href: "/usuarios" },
];

export function casaDe(modulos: readonly ModuloId[]): string {
  for (const casa of CASA) {
    if (modulos.includes(casa.id)) return casa.href;
  }
  return "/ingreso";
}

export function escuchaAvisos(modulos: readonly ModuloId[]): { cartera: boolean; comercial: boolean } {
  return {
    cartera: modulos.includes("cartera"),
    comercial: modulos.includes("comercial"),
  };
}
