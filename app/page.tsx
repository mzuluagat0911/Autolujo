import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Stats = {
  ok: boolean;
  empresas: number;
  clientes: number;
  contratos: number;
  error: string | null;
};

async function getStats(): Promise<Stats> {
  try {
    const sb = createServerSupabase();
    const [empresas, clientes, contratos] = await Promise.all([
      sb.from("empresas").select("*", { count: "exact", head: true }),
      sb.from("clientes").select("*", { count: "exact", head: true }),
      sb.from("contratos").select("*", { count: "exact", head: true }),
    ]);
    const firstError = empresas.error ?? clientes.error ?? contratos.error;
    if (firstError) throw firstError;
    return {
      ok: true,
      empresas: empresas.count ?? 0,
      clientes: clientes.count ?? 0,
      contratos: contratos.count ?? 0,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      empresas: 0,
      clientes: 0,
      contratos: 0,
      error: e instanceof Error ? e.message : "Error desconocido",
    };
  }
}

const MODULOS = [
  { href: "/cartera/empresas", titulo: "Empresas", desc: "Autolujo, Kowua, Gold" },
  { href: "/cartera/vehiculos", titulo: "Vehículos", desc: "Flota y estado" },
  { href: "/cartera/tarifario", titulo: "Tarifario", desc: "Letra diaria por año/modelo" },
  { href: "/cartera/clientes", titulo: "Clientes", desc: "Datos y score" },
  { href: "/cartera/contratos", titulo: "Contratos", desc: "Cuotas y acuerdos" },
  { href: "/cartera/reglas", titulo: "Reglas", desc: "Multas, cierre, exceso km" },
];

export default async function Home() {
  const stats = await getStats();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between border-b border-line pb-5">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" />
          <span className="text-[15px] font-bold tracking-tight">Auto Lujo</span>
          <span className="text-muted">·</span>
          <span className="text-[15px] text-muted">Cartera</span>
        </div>
        <span className="font-mono text-xs text-muted">Wizard administrativo</span>
      </header>

      {!stats.ok ? (
        <section className="mt-10 rounded-2xl border border-line bg-surface p-8">
          <h1 className="text-xl font-bold">Falta conectar Supabase</h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            El proyecto está montado, pero aún no lee la base de datos. Completa
            estos dos pasos y recarga:
          </p>
          <ol className="mt-5 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="font-mono font-bold text-brand">1.</span>
              <span>
                Pega{" "}
                <code className="rounded bg-brand-wash px-1.5 py-0.5 font-mono text-[13px] text-brand">
                  supabase/migrations/0001_cartera_schema.sql
                </code>{" "}
                en el SQL Editor de Supabase y ejecútalo.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono font-bold text-brand">2.</span>
              <span>
                Agrega las variables de Supabase en Vercel (Settings →
                Environment Variables) o en{" "}
                <code className="rounded bg-brand-wash px-1.5 py-0.5 font-mono text-[13px] text-brand">
                  .env.local
                </code>{" "}
                para desarrollo local (ver{" "}
                <code className="font-mono text-[13px]">.env.example</code>).
              </span>
            </li>
          </ol>
          <p className="mt-6 rounded-lg bg-paper p-3 font-mono text-xs text-muted">
            {stats.error}
          </p>
        </section>
      ) : (
        <>
          <section className="mt-8 grid grid-cols-3 gap-4">
            <Tile label="Empresas" value={stats.empresas} />
            <Tile label="Clientes" value={stats.clientes} />
            <Tile label="Contratos" value={stats.contratos} />
          </section>

          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Módulo de Cartera
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MODULOS.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="group rounded-xl border border-line bg-surface p-5 transition hover:border-brand"
                >
                  <div className="font-semibold group-hover:text-brand">
                    {m.titulo}
                  </div>
                  <div className="mt-1 text-sm text-muted">{m.desc}</div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="font-mono text-xs uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 text-3xl font-extrabold tabular-nums">{value}</div>
    </div>
  );
}
