"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { salir } from "@/app/ingreso/actions";
import { escuchaAvisos, type ModuloId } from "@/lib/equipo/modulos";
import type { SesionEquipo } from "@/lib/equipo/tipos";
import { Brand } from "./brand";
import {
  AlertasAsesorProvider,
  AlertasCampana,
  useChatsEsperandoCount,
} from "./alertas-asesor";

type Item = { label: string; href: string; status: "active" | "pronto"; modulo: ModuloId };
type Group = { section: string | null; items: Item[] };

const NAV: Group[] = [
  {
    // Home de la plataforma: el pulso de todo el negocio.
    section: null,
    items: [
      { label: "Resumen", href: "/admin", status: "active", modulo: "resumen" },
    ],
  },
  {
    // MÓDULO CARTERA (el primero que construimos) — su tablero + herramientas.
    section: "Cartera",
    items: [
      { label: "Panel de cartera", href: "/cartera", status: "active", modulo: "cartera" },
      { label: "Estado de cuenta", href: "/cartera/estados-cuenta", status: "active", modulo: "cartera" },
      { label: "Conversaciones", href: "/cartera/conversaciones", status: "active", modulo: "cartera" },
      { label: "Comprobantes", href: "/cartera/pagos", status: "active", modulo: "cartera" },
      { label: "Conciliación", href: "/cartera/extractos", status: "active", modulo: "cartera" },
      { label: "Carros", href: "/cartera/vehiculos", status: "active", modulo: "cartera" },
      { label: "Rastreo", href: "/cartera/rastreo", status: "active", modulo: "cartera" },
      { label: "Clientes", href: "/cartera/clientes", status: "active", modulo: "cartera" },
      { label: "Tarifario", href: "/cartera/tarifario", status: "active", modulo: "cartera" },
      { label: "Cobros de taller", href: "/cartera/cobros-taller", status: "active", modulo: "cartera" },
    ],
  },
  {
    section: "Operaciones",
    items: [
      { label: "Panel", href: "/operaciones", status: "active", modulo: "operaciones" },
      { label: "Hoja de vida", href: "/operaciones/hoja-vida", status: "active", modulo: "operaciones" },
      { label: "Mantenimiento", href: "/operaciones/mantenimiento", status: "active", modulo: "operaciones" },
      { label: "Chapistería", href: "/operaciones/chapisteria", status: "active", modulo: "operaciones" },
      { label: "Licencias", href: "/operaciones/licencias", status: "active", modulo: "operaciones" },
      { label: "Placas y revisado", href: "/operaciones/placas", status: "active", modulo: "operaciones" },
    ],
  },
  {
    section: "Configuración",
    items: [
      { label: "Empresas", href: "/cartera/empresas", status: "active", modulo: "configuracion" },
      { label: "Alcance de cartera", href: "/admin/alcance", status: "active", modulo: "configuracion" },
      { label: "Usuarios y roles", href: "/usuarios", status: "active", modulo: "equipo" },
      { label: "Meta de cobranza", href: "/admin/metas", status: "active", modulo: "configuracion" },
    ],
  },
  {
    section: "Comercial",
    items: [
      { label: "Chats", href: "/comercial", status: "active", modulo: "comercial" },
      { label: "Citas", href: "/comercial/citas", status: "active", modulo: "comercial" },
      { label: "Resultados", href: "/comercial/resultados", status: "active", modulo: "comercial" },
    ],
  },
  {
    // Los demás módulos del negocio — la visión de la plataforma.
    section: "Módulos del negocio",
    items: [
      { label: "Seguros", href: "/seguros", status: "active", modulo: "seguros" },
      { label: "Administrativo", href: "/administrativo", status: "pronto", modulo: "resumen" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // Paneles raíz: solo exacto (si no, /cartera marca todo Cartera).
  if (href === "/admin" || href === "/cartera" || href === "/operaciones" || href === "/comercial") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

function seccionDeRuta(pathname: string): string | null {
  for (const g of NAV) {
    if (!g.section) continue;
    for (const item of g.items) {
      if (item.status === "pronto") continue;
      if (isActive(pathname, item.href)) return g.section;
    }
  }
  return null;
}

// Rutas públicas (sin menú ni chrome de la app): landing y páginas legales.
const RUTAS_PUBLICAS = ["/", "/privacidad", "/terminos", "/ingreso"];

const NAV_STORAGE = "autolujo:nav-abiertas";

export function Shell({
  children,
  equipo,
}: {
  children: ReactNode;
  equipo: SesionEquipo | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const seccionActiva = seccionDeRuta(pathname);
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [navListo, setNavListo] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Restaurar qué secciones el usuario dejó abiertas.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(NAV_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        if (parsed && typeof parsed === "object") setAbiertas(parsed);
      }
    } catch {
      /* ignore */
    }
    setNavListo(true);
  }, []);

  // Persistir toggles del acordeón.
  useEffect(() => {
    if (!navListo) return;
    try {
      sessionStorage.setItem(NAV_STORAGE, JSON.stringify(abiertas));
    } catch {
      /* ignore */
    }
  }, [abiertas, navListo]);

  // La sección de la ruta actual siempre queda abierta.
  useEffect(() => {
    if (!seccionActiva) return;
    setAbiertas((prev) => (prev[seccionActiva] ? prev : { ...prev, [seccionActiva]: true }));
  }, [seccionActiva]);

  function toggleSeccion(nombre: string) {
    setAbiertas((prev) => ({ ...prev, [nombre]: !prev[nombre] }));
  }

  function estaAbierta(nombre: string) {
    if (abiertas[nombre] != null) return abiertas[nombre]!;
    // Primera visita: abierta solo la sección de la ruta actual.
    return nombre === seccionActiva;
  }

  // Páginas públicas: sin barra lateral ni topbar.
  if (RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return <div className="min-h-screen bg-paper font-brand-ui">{children}</div>;
  }

  const modulos = new Set(equipo?.modulos ?? []);
  const escucha = escuchaAvisos(equipo?.modulos ?? []);
  const muestraAvisos = escucha.cartera || escucha.comercial;

  return (
    <AlertasAsesorProvider escucha={escucha}>
    <div className="flex min-h-screen bg-paper">
      {open && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
        />
      )}

      <aside
        className={`fixed z-40 flex h-screen w-[17.5rem] flex-col bg-black text-white transition-transform print:hidden md:sticky md:top-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative px-6 pb-8 pt-8">
          <div className="absolute left-0 top-8 h-10 w-[3px] bg-gold" />
          <Brand />
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-8">
          {NAV.map((group, gi) => {
            const items = group.items.filter((i) => modulos.has(i.modulo));
            if (items.length === 0) return null;

            // Resumen y links sueltos: siempre visibles.
            if (!group.section) {
              return (
                <div key={gi} className={gi > 0 ? "mt-6" : undefined}>
                  <ul>
                    {items.map((item) => (
                      <li key={item.href}>
                        <NavRow item={item} active={isActive(pathname, item.href)} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }

            const abierta = estaAbierta(group.section);
            const enEsta = seccionActiva === group.section;

            return (
              <div key={gi} className="mt-5">
                <button
                  type="button"
                  onClick={() => toggleSeccion(group.section!)}
                  aria-expanded={abierta}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-white/[0.04] ${
                    enEsta ? "text-gold" : "text-gold/80"
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase tracking-[0.28em]">
                    {group.section}
                  </span>
                  <ChevronIcon open={abierta} />
                </button>
                {abierta && (
                  <ul className="mt-1">
                    {items.map((item) => (
                      <li key={item.href}>
                        <NavRow item={item} active={isActive(pathname, item.href)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium tracking-wide text-white">
              {equipo?.nombre ?? "Equipo"}
            </p>
            {modulos.has("equipo") && (
              <Link
                href="/usuarios"
                className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-gold/90 hover:text-gold"
              >
                Dar accesos
              </Link>
            )}
            <form action={salir}>
              <button
                type="submit"
                className="mt-0.5 text-[10px] font-light uppercase tracking-[0.18em] text-white/40 hover:text-gold"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
          <div className="flex items-center gap-1">
            {muestraAvisos && (
              <div className="hidden md:block">
                <AlertasCampana variant="side" />
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center bg-black px-4 print:hidden md:hidden">
          <button aria-label="Abrir menú" onClick={() => setOpen(true)} className="p-2 text-white">
            <MenuIcon />
          </button>
          <span className="ml-2 font-serif text-sm text-white">AutoLujo</span>
          {muestraAvisos && (
            <div className="ml-auto">
              <AlertasCampana variant="mobile" />
            </div>
          )}
        </div>
        <main className="min-w-0 flex-1 px-5 sm:px-8 lg:px-12">{children}</main>
      </div>
    </div>
    </AlertasAsesorProvider>
  );
}

function NavRow({ item, active }: { item: Item; active: boolean }) {
  const esperando = useChatsEsperandoCount();
  const badge = item.href === "/cartera/conversaciones" ? esperando : 0;
  if (item.status === "pronto") {
    return (
      <div className="flex cursor-default items-center justify-between px-3 py-2 text-[13px] font-light text-white/28">
        <span>{item.label}</span>
        <span className="text-[8px] uppercase tracking-[0.16em] text-gold/50">Pronto</span>
      </div>
    );
  }
  return (
    <Link
      href={item.href}
      className={`relative flex items-center gap-2 px-3 py-2 text-[13px] transition ${
        active ? "font-medium text-gold" : "font-light text-white/60 hover:text-white"
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-gold" />}
      <span className="flex-1">{item.label}</span>
      {badge > 0 && (
        <span className="rounded-full bg-ambar px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {
      /* ignore */
    }
    const initial =
      saved === "dark" || saved === "light"
        ? (saved as "light" | "dark")
        : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      aria-label="Cambiar tema"
      onClick={toggle}
      className="p-1.5 text-white/40 transition hover:text-gold"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`shrink-0 text-gold/60 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeLinecap="round" />
    </svg>
  );
}
