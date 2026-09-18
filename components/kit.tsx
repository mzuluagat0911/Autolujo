import Link from "next/link";
import type { ReactNode } from "react";

export function GoldRule({ className = "" }: { className?: string }) {
  return <span className={`block h-[2px] w-10 bg-ink ${className}`} aria-hidden="true" />;
}

export function Money({ amount, className = "" }: { amount: number; className?: string }) {
  const n = new Intl.NumberFormat("es-PA", { maximumFractionDigits: 0 }).format(amount);
  return (
    <span className={`tabular-nums ${className}`}>
      <span className="mr-1 align-[0.45em] text-[0.42em] font-semibold tracking-[0.1em] text-muted">USD</span>
      {n}
    </span>
  );
}

/** Encabezado de página — limpio, sans, sobre blanco. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {eyebrow && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{eyebrow}</p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Band({
  title,
  status = "active",
  children,
}: {
  title: string;
  status?: "active" | "pronto";
  children: ReactNode;
}) {
  return (
    <section className={status === "pronto" ? "opacity-60" : undefined}>
      <div className="mb-5 flex items-center gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <span className="h-px flex-1 bg-line" />
        {status === "pronto" ? <ProntoBadge /> : <ActivoBadge />}
      </div>
      {children}
    </section>
  );
}

export function ProntoBadge() {
  return (
    <StatusChip tone="neutral">En preparación</StatusChip>
  );
}

function ActivoBadge() {
  return <StatusChip tone="good">En marcha</StatusChip>;
}

export function Kpi({
  label,
  value,
  hint,
  tone = "default",
  size = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "crit" | "pronto";
  size?: "default" | "hero";
}) {
  const color =
    tone === "good" ? "text-verde"
    : tone === "warn" ? "text-ambar"
    : tone === "crit" ? "text-rojo"
    : tone === "pronto" ? "text-faint"
    : "text-ink";

  if (size === "hero") {
    return (
      <div className="rounded-xl bg-surface p-6 ring-1 ring-line">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
        <div className={`mt-4 text-4xl font-bold leading-none tracking-tight tabular-nums lg:text-5xl ${color}`}>
          {value}
        </div>
        {hint && <p className="mt-3 text-sm text-muted">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${color}`}>
        {tone === "pronto" ? "—" : value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Badge / etiqueta de estado — pill con punto + tint. */
export function StatusChip({
  tone,
  children,
}: {
  tone: "good" | "warn" | "crit" | "neutral" | "azul" | "purpura";
  children: ReactNode;
}) {
  const map: Record<string, string> = {
    good: "bg-verde-wash text-verde",
    warn: "bg-ambar-wash text-ambar",
    crit: "bg-rojo-wash text-rojo",
    azul: "bg-azul-wash text-azul",
    purpura: "bg-purpura-wash text-purpura",
    neutral: "bg-gris-wash text-gris",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${map[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="text-base font-semibold">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function SubCard({
  href,
  title,
  desc,
  status = "active",
}: {
  href: string;
  title: string;
  desc: string;
  status?: "active" | "pronto";
}) {
  if (status === "pronto") {
    return (
      <div className="rounded-xl bg-surface p-4 ring-1 ring-line opacity-60">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{title}</span>
          <ProntoBadge />
        </div>
        <p className="mt-1 text-sm text-muted">{desc}</p>
      </div>
    );
  }
  return (
    <Link href={href} className="group block rounded-xl bg-surface p-4 ring-1 ring-line transition hover:ring-line-strong">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold group-hover:text-ink">{title}</span>
        <span className="text-muted opacity-0 transition group-hover:opacity-100">→</span>
      </div>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </Link>
  );
}

/** Chip de filtro (activo = tinta negra). */
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "bg-ink font-medium text-white"
          : "bg-paper text-muted ring-1 ring-line hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export type FilterChipItem = { id: string; label: string; count?: number };

export type FilterChipGroup = {
  chips: FilterChipItem[];
  active: string;
  onChip: (id: string) => void;
};

function ChipRow({ group }: { group: FilterChipGroup }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {group.chips.map((c) => {
        const showCount =
          c.count != null && c.count > 0 && c.id !== "todas" && c.id !== "todos";
        return (
          <FilterChip key={c.id} active={group.active === c.id} onClick={() => group.onChip(c.id)}>
            {c.label}
            {showCount ? ` · ${c.count}` : ""}
          </FilterChip>
        );
      })}
    </div>
  );
}

/**
 * Barra canónica de filtros del dashboard:
 * [ buscar ]  [chip] [chip] …   [acciones]
 * Variante `bare` para paneles que ya tienen borde (inbox).
 */
export function FiltersBar({
  search,
  searchPlaceholder = "Buscar…",
  chips,
  activeChip,
  onChip,
  chipGroups,
  actions,
  variant = "card",
  className = "",
}: {
  search?: { value: string; onChange: (v: string) => void };
  searchPlaceholder?: string;
  chips?: FilterChipItem[];
  activeChip?: string;
  onChip?: (id: string) => void;
  /** Varios grupos de chips (ej. flota + estado en Rastreo). */
  chipGroups?: FilterChipGroup[];
  actions?: ReactNode;
  variant?: "card" | "bare";
  className?: string;
}) {
  const groups: FilterChipGroup[] =
    chipGroups ??
    (chips && onChip && activeChip != null
      ? [{ chips, active: activeChip, onChip }]
      : []);

  const shell =
    variant === "bare"
      ? "flex flex-col gap-2"
      : "flex flex-col gap-3 rounded-xl bg-surface p-3 ring-1 ring-line sm:flex-row sm:flex-wrap sm:items-center";

  return (
    <div className={`${shell} ${className}`}>
      {search && (
        <label className="relative block min-w-0 flex-1 sm:max-w-md">
          <span className="sr-only">Buscar</span>
          <input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg bg-paper py-2.5 pl-9 pr-3 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
          />
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" strokeLinecap="round" />
          </svg>
        </label>
      )}
      {groups.map((g, i) => (
        <ChipRow key={i} group={g} />
      ))}
      {actions && (
        <div className={`flex flex-wrap items-center gap-2 ${variant === "card" ? "sm:ml-auto" : ""}`}>
          {actions}
        </div>
      )}
    </div>
  );
}

/** Contenedor de página con anchos del design system. */
export function PageShell({
  width = "list",
  children,
  className = "",
}: {
  width?: "list" | "form" | "fluid";
  children: ReactNode;
  className?: string;
}) {
  const max =
    width === "form" ? "max-w-3xl" : width === "fluid" ? "" : "max-w-6xl";
  return (
    <div className={`mx-auto py-10 ${max} ${className}`.trim()}>{children}</div>
  );
}

/** Tabs controlados (activo = tinta negra). */
export function Tabs({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex flex-wrap gap-1 border-b border-line ${className}`}
    >
      {tabs.map((t) => {
        const on = t.id === active;
        const showCount = t.count != null && t.count > 0;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition ${
              on
                ? "border-ink font-medium text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {showCount ? (
              <span className={`ml-1.5 tabular-nums ${on ? "text-ink/50" : "text-faint"}`}>
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Toast mínimo (presentacional). El padre controla show/hide. */
export function Toast({
  message,
  tone = "neutral",
  onDismiss,
}: {
  message: string;
  tone?: "neutral" | "good" | "warn" | "crit";
  onDismiss?: () => void;
}) {
  const toneCls =
    tone === "good"
      ? "bg-verde-wash text-verde ring-verde/20"
      : tone === "warn"
        ? "bg-ambar-wash text-ambar ring-ambar/20"
        : tone === "crit"
          ? "bg-rojo-wash text-rojo ring-rojo/20"
          : "bg-ink text-white ring-ink";
  return (
    <div
      role="status"
      className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ring-1 ${toneCls}`}
    >
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-70 hover:opacity-100"
          aria-label="Cerrar"
        >
          ×
        </button>
      )}
    </div>
  );
}
