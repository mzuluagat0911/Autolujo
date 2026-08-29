"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "./brand";

type Item = { label: string; href: string; status: "active" | "pronto" };
type Group = { section: string | null; items: Item[] };

const NAV: Group[] = [
  {
    section: null,
    items: [
      { label: "Resumen", href: "/", status: "active" },
      { label: "Agentes", href: "/agentes", status: "pronto" },
    ],
  },
  {
    section: "Operación",
    items: [
      { label: "Cartera", href: "/cartera", status: "active" },
      { label: "Conversaciones", href: "/cartera/conversaciones", status: "active" },
      { label: "Pagos por conciliar", href: "/cartera/pagos", status: "active" },
      { label: "Comercial y Atención", href: "/comercial", status: "pronto" },
      { label: "Operaciones", href: "/operaciones", status: "pronto" },
      { label: "Seguros", href: "/seguros", status: "pronto" },
      { label: "Administrativo", href: "/administrativo", status: "pronto" },
    ],
  },
  {
    section: "Directorio",
    items: [
      { label: "Clientes", href: "/cartera/clientes", status: "active" },
      { label: "Flota / Vehículos", href: "/cartera/vehiculos", status: "active" },
      { label: "Contratos", href: "/contratos", status: "pronto" },
    ],
  },
  {
    section: "Datos",
    items: [
      { label: "Extractos bancarios", href: "/extractos", status: "pronto" },
      { label: "Tarifario", href: "/cartera/tarifario", status: "active" },
      { label: "Reglas", href: "/reglas", status: "pronto" },
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

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // sidebar móvil

  // cerrar el drawer al navegar
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const activeLabel =
    NAV.flatMap((g) => g.items)
      .filter((i) => i.status === "active" && isActive(pathname, i.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? "AutoLujo";

  return (
    <div className="flex min-h-screen">
      {/* Overlay móvil */}
      {open && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed z-40 flex h-screen w-64 flex-col bg-side-bg text-side-ink transition-transform md:sticky md:top-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-center border-b border-gold/15 bg-black px-4">
          <Brand />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-6" : undefined}>
              {group.section && (
                <div className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-side-muted">
                  {group.section}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavRow item={item} active={isActive(pathname, item.href)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-side-line px-5 py-4">
          <div className="text-xs text-side-muted">Inversiones Auto Lujo Panamá</div>
        </div>
      </aside>

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            aria-label="Abrir menú"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-line p-2 md:hidden"
          >
            <MenuIcon />
          </button>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-gold md:inline">
            · {activeLabel} ·
          </span>
          <div className="flex-1" />
          <ThemeToggle />
          <div className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ink font-mono text-xs font-bold text-surface">
              AL
            </span>
            <span className="hidden text-sm text-muted sm:inline">Administrador</span>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function NavRow({ item, active }: { item: Item; active: boolean }) {
  if (item.status === "pronto") {
    return (
      <div className="flex cursor-default items-center justify-between rounded-lg px-3 py-2 text-sm text-side-muted/70">
        <span>{item.label}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-side-active/60">
          pronto
        </span>
      </div>
    );
  }
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2 rounded-lg border-l-2 px-3 py-2 text-sm transition ${
        active
          ? "border-side-active bg-side-active/10 font-medium text-side-ink"
          : "border-transparent text-side-muted hover:bg-white/5 hover:text-side-ink"
      }`}
    >
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
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
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
      className="rounded-lg border border-line p-2 text-muted transition hover:text-ink"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" strokeLinecap="round" />
    </svg>
  );
}
