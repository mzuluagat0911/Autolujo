import Link from "next/link";
import type { ReactNode } from "react";

export function GoldRule({ className = "" }: { className?: string }) {
  return <span className={`block h-[2px] w-12 bg-gold ${className}`} aria-hidden="true" />;
}

export function Money({ amount, className = "" }: { amount: number; className?: string }) {
  const n = new Intl.NumberFormat("es-PA", { maximumFractionDigits: 0 }).format(amount);
  return (
    <span className={`tabular-nums ${className}`}>
      <span className="mr-1.5 align-[0.4em] font-sans text-[0.32em] font-medium tracking-[0.18em] text-gold">
        USD
      </span>
      {n}
    </span>
  );
}

/** Mástil negro a sangre — el gesto de marca, no un H1 genérico. */
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
    <header className="relative -mx-5 mb-10 bg-ink px-5 py-10 text-surface sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12 lg:py-14">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent"
        aria-hidden
      />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          {eyebrow && (
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.28em] text-gold">
              {eyebrow}
            </p>
          )}
          <h1 className="font-serif text-4xl font-bold leading-[0.95] tracking-tight sm:text-5xl lg:text-[3.5rem]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-4 max-w-lg text-[15px] font-light leading-relaxed text-white/55">{subtitle}</p>
          )}
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
    <section className={status === "pronto" ? "opacity-55" : undefined}>
      <div className="mb-5 flex items-baseline gap-4">
        <h2 className="font-serif text-2xl font-bold tracking-tight">{title}</h2>
        <span className="h-px flex-1 bg-line" />
        {status === "pronto" ? <ProntoBadge /> : <ActivoBadge />}
      </div>
      {children}
    </section>
  );
}

export function ProntoBadge() {
  return (
    <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-gold">En preparación</span>
  );
}

function ActivoBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-good">
      <span className="h-1.5 w-1.5 rounded-full bg-good" />
      En marcha
    </span>
  );
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
  tone?: "default" | "warn" | "crit" | "pronto";
  size?: "default" | "hero";
}) {
  if (size === "hero") {
    return (
      <div className="relative overflow-hidden bg-ink px-7 py-8 text-surface">
        <div className="absolute left-0 top-0 h-full w-[3px] bg-gold" />
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">{label}</p>
        <div className="mt-6 font-serif text-5xl font-bold leading-none tracking-tight lg:text-6xl">
          {value}
        </div>
        {hint && <p className="mt-4 text-sm font-light text-white/45">{hint}</p>}
      </div>
    );
  }

  const color =
    tone === "warn" ? "text-warn" : tone === "crit" ? "text-crit" : tone === "pronto" ? "text-faint" : "text-ink";

  return (
    <div className="border-t border-line pt-4">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className={`mt-2 font-serif text-3xl font-bold tabular-nums tracking-tight ${color}`}>
        {tone === "pronto" ? "—" : value}
      </div>
      {hint && <div className="mt-1 text-xs font-light text-faint">{hint}</div>}
    </div>
  );
}

export function StatusChip({
  tone,
  children,
}: {
  tone: "good" | "warn" | "crit" | "neutral" | "gold";
  children: ReactNode;
}) {
  const map: Record<string, string> = {
    good: "text-good border-good/35",
    warn: "text-warn border-warn/35",
    crit: "text-crit border-crit/35",
    gold: "text-gold border-gold/40",
    neutral: "text-muted border-line",
  };
  return (
    <span className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${map[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-line px-6 py-12 text-center">
      <GoldRule className="mx-auto mb-5" />
      <p className="font-serif text-lg font-bold">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-sm text-sm font-light text-muted">{hint}</p>}
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
      <div className="border-t border-line py-6 opacity-50">
        <div className="flex items-center justify-between gap-2">
          <span className="font-serif text-xl font-bold">{title}</span>
          <ProntoBadge />
        </div>
        <p className="mt-1 text-sm font-light text-muted">{desc}</p>
      </div>
    );
  }
  return (
    <Link href={href} className="group block border-t border-line py-6 transition">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-serif text-xl font-bold group-hover:text-gold">{title}</span>
        <span className="text-gold opacity-0 transition group-hover:opacity-100">→</span>
      </div>
      <p className="mt-1 text-sm font-light text-muted">{desc}</p>
    </Link>
  );
}
