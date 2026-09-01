"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "./brand";

type Item = { label: string; href: string; status: "active" | "pronto" };
type Group = { section: string | null; items: Item[] };

const NAV: Group[] = [
  {
    // Home de la plataforma: el pulso de todo el negocio.
    section: null,
    items: [
      { label: "Resumen", href: "/admin", status: "active" },
    ],
  },
  {
    // MÓDULO CARTERA (el primero que construimos) — su tablero + herramientas.
    section: "Cartera",
    items: [
      { label: "Panel de cartera", href: "/cartera", status: "active" },
      { label: "Estado de cuenta", href: "/cartera/estados-cuenta", status: "active" },
      { label: "Conversaciones", href: "/cartera/conversaciones", status: "active" },
      { label: "Pagos por conciliar", href: "/cartera/pagos", status: "active" },
      { label: "Extractos bancarios", href: "/cartera/extractos", status: "active" },
      { label: "Carros", href: "/cartera/vehiculos", status: "active" },
      { label: "Clientes", href: "/cartera/clientes", status: "active" },
      { label: "Tarifario", href: "/cartera/tarifario", status: "active" },
    ],
  },
  {
    // Los demás módulos del negocio — la visión de la plataforma.
    section: "Módulos del negocio",
    items: [
      { label: "Comercial y Atención", href: "/comercial", status: "pronto" },
      { label: "Operaciones", href: "/operaciones", status: "pronto" },
      { label: "Seguros", href: "/seguros", status: "pronto" },
      { label: "Administrativo", href: "/administrativo", status: "pronto" },
    ],
  },
  {
    section: "Configuración",
    items: [
      { label: "Empresas", href: "/cartera/empresas", status: "active" },
      { label: "Usuarios y roles", href: "/usuarios", status: "pronto" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

// Rutas públicas (sin menú ni chrome de la app): landing y páginas legales.
const RUTAS_PUBLICAS = ["/", "/privacidad", "/terminos"];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Páginas públicas: sin barra lateral ni topbar.
  if (RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return <div className="min-h-screen bg-paper font-brand-ui">{children}</div>;
  }

  return (
    <div className="flex min-h-screen bg-paper">
      {open && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
        />
      )}

      <aside
        className={`fixed z-40 flex h-screen w-[17.5rem] flex-col bg-black text-white transition-transform md:sticky md:top-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative px-6 pb-8 pt-8">
          <div className="absolute left-0 top-8 h-10 w-[3px] bg-gold" />
          <Brand />
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-8">
          {NAV.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-8" : undefined}>
              {group.section && (
                <div className="mb-3 px-3 text-[10px] font-medium uppercase tracking-[0.28em] text-gold/80">
                  {group.section}
                </div>
              )}
              <ul>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavRow item={item} active={isActive(pathname, item.href)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-white">Administrador</p>
            <p className="text-[10px] font-light uppercase tracking-[0.18em] text-white/40">
              Siempre seguro
            </p>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center bg-black px-4 md:hidden">
          <button aria-label="Abrir menú" onClick={() => setOpen(true)} className="p-2 text-white">
            <MenuIcon />
          </button>
          <span className="ml-2 font-serif text-sm text-white">AutoLujo</span>
        </div>
        <main className="min-w-0 flex-1 px-5 sm:px-8 lg:px-12">{children}</main>
      </div>
    </div>
  );
}

function NavRow({ item, active }: { item: Item; active: boolean }) {
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
      className={`relative flex items-center px-3 py-2 text-[13px] transition ${
        active ? "font-medium text-gold" : "font-light text-white/60 hover:text-white"
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-gold" />}
      {item.label}
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
