import Link from "next/link";
import { PageHeader, PageShell } from "@/components/kit";
import { SEDES_INVENTARIO } from "@/lib/administrativo/inventario";

export const dynamic = "force-dynamic";

export default function AdministrativoPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Administrativo"
        title="Panel"
        subtitle="Inventarios de chapistería y mecánica por sede (Juan Díaz y La Chorrera)."
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SEDES_INVENTARIO.map((s) => (
          <Link
            key={s.id}
            href={`/administrativo/inventario?sede=${s.id}`}
            className="rounded-xl bg-surface p-5 ring-1 ring-line transition hover:bg-surface-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Inventario
            </p>
            <p className="mt-2 text-lg font-semibold tracking-tight">{s.label}</p>
            <p className="mt-1 text-sm text-muted">Ver stock, entradas y salidas</p>
          </Link>
        ))}
        <Link
          href="/administrativo/inventario"
          className="rounded-xl bg-surface p-5 ring-1 ring-line transition hover:bg-surface-2 sm:col-span-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Catálogo completo
          </p>
          <p className="mt-2 text-lg font-semibold tracking-tight">Abrir inventario</p>
          <p className="mt-1 text-sm text-muted">
            Chapistería y mecánica · misma lista · stock en 0 hasta que Ángela actualice
          </p>
        </Link>
      </div>
    </PageShell>
  );
}
