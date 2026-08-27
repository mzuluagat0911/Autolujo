import Link from "next/link";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// GrilleRule — motivo de marca: la parrilla dorada del logo, en miniatura.
// Firma recurrente que le da identidad propia a la plataforma.
// ---------------------------------------------------------------------------
export function GrilleRule({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-col gap-[3px] ${className}`} aria-hidden="true">
      <span className="block h-[2px] w-5 rounded-full bg-gold/85" />
      <span className="block h-[2px] w-7 rounded-full bg-gold/55" />
      <span className="block h-[2px] w-4 rounded-full bg-gold/35" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Money — cifra en dólares con "USD" pequeño y muted, número protagonista.
// ---------------------------------------------------------------------------
export function Money({ amount, className = "" }: { amount: number; className?: string }) {
  const n = new Intl.NumberFormat("es-PA", { maximumFractionDigits: 0 }).format(amount);
  return (
    <span className={`tabular-nums ${className}`}>
      <span className="mr-1.5 align-[0.35em] text-[0.42em] font-semibold uppercase tracking-wide text-muted">
        USD
      </span>
      {n}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PageHeader — eyebrow con puntos "· ·", título serif, subtítulo. Sin borde.
// ---------------------------------------------------------------------------
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
    <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div>
        {eyebrow && (
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-gold">
            · {eyebrow} ·
          </div>
        )}
        <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-[34px]">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band — sección de dominio con el motivo parrilla + estado.
// ---------------------------------------------------------------------------
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
    <section className={status === "pronto" ? "opacity-75" : undefined}>
      <div className="mb-4 flex items-center gap-3">
        <GrilleRule />
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {title}
        </h2>
        {status === "pronto" ? <ProntoBadge /> : <ActivoBadge />}
      </div>
      {children}
    </section>
  );
}

export function ProntoBadge() {
  return (
    <span className="rounded-full border border-gold/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-gold">
      Activando
    </span>
  );
}

function ActivoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-good/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-good">
      <span className="h-1.5 w-1.5 rounded-full bg-good" />
      Activo
    </span>
  );
}

// ---------------------------------------------------------------------------
// Card — superficie base: elevación sutil + hairline, en vez de borde duro.
// ---------------------------------------------------------------------------
const CARD =
  "rounded-xl bg-surface p-4 ring-1 ring-line/60 shadow-[0_1px_2px_rgba(20,20,20,0.04)]";

// ---------------------------------------------------------------------------
// Kpi — stat tile. size="hero" para el número protagonista (serif + dorado).
// ---------------------------------------------------------------------------
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
  tone?: "default" | "warn" | "crit" | "pronto";
  size?: "default" | "hero";
}) {
  if (size === "hero") {
    return (
      <div className="flex h-full flex-col rounded-2xl bg-surface p-6 ring-1 ring-line/60 shadow-[0_2px_16px_rgba(20,20,20,0.05)]">
        <GrilleRule className="mb-5" />
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {label}
        </div>
        <div className="mt-auto pt-4 font-serif text-[40px] font-bold leading-none tracking-tight text-gold">
          {value}
        </div>
        {hint && <div className="mt-3 text-sm text-muted">{hint}</div>}
      </div>
    );
  }

  const color =
    tone === "warn"
      ? "text-warn"
      : tone === "crit"
        ? "text-crit"
        : tone === "pronto"
          ? "text-faint"
          : "text-ink";

  return (
    <div className={CARD}>
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${color}`}>
        {tone === "pronto" ? "—" : value}
      </div>
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusChip — pastilla de estado (punto + texto; nunca solo color).
// ---------------------------------------------------------------------------
export function StatusChip({
  tone,
  children,
}: {
  tone: "good" | "warn" | "crit" | "neutral" | "gold";
  children: ReactNode;
}) {
  const map: Record<string, string> = {
    good: "text-good border-good/30 bg-good/5",
    warn: "text-warn border-warn/30 bg-warn/5",
    crit: "text-crit border-crit/30 bg-crit/5",
    gold: "text-gold border-gold/30 bg-gold/5",
    neutral: "text-muted border-line-strong bg-surface-2",
  };
  const dot: Record<string, string> = {
    good: "bg-good",
    warn: "bg-warn",
    crit: "bg-crit",
    gold: "bg-gold",
    neutral: "bg-faint",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — vacío con el motivo parrilla, que guía.
// ---------------------------------------------------------------------------
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-5 py-10 text-center ring-1 ring-line/50">
      <div className="mb-4 flex justify-center">
        <GrilleRule />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubCard — acceso a un sub-módulo (home de un dominio).
// ---------------------------------------------------------------------------
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
      <div className={`${CARD} p-5 opacity-60`}>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          <ProntoBadge />
        </div>
        <p className="mt-1 text-sm text-muted">{desc}</p>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="group rounded-xl bg-surface p-5 ring-1 ring-line/60 shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition hover:ring-gold/50"
    >
      <div className="font-semibold transition group-hover:text-gold">{title}</div>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </Link>
  );
}
