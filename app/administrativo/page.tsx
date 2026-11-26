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
        subtitle="Inventario de taller: salidas a carro, compras, transferencias entre sedes y cobros."
      />

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Empezá por la sede
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SEDES_INVENTARIO.map((s) => (
            <Link
              key={s.id}
              href={`/administrativo/inventario?sede=${s.id}`}
              className="rounded-xl bg-surface p-6 ring-1 ring-line transition hover:bg-surface-2"
            >
              <p className="text-xl font-semibold tracking-tight">{s.label}</p>
              <p className="mt-2 text-sm text-muted">
                Ver stock, registrar salida a un carro, transferir o comprar.
              </p>
              <p className="mt-4 text-sm font-medium text-ink">Abrir inventario →</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-xl bg-surface p-5 ring-1 ring-line">
        <h2 className="text-base font-semibold">Flujo del día</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <span className="font-medium text-ink">1. Salida a carro</span> — buscá la pieza y poné el
            # del carro.
          </li>
          <li>
            <span className="font-medium text-ink">2. Cobro</span> — en la pestaña Cobros, elegí si
            paga el cliente o la empresa.
          </li>
          <li>
            <span className="font-medium text-ink">3. Comprar</span> — mirá “Qué comprar” según lo que
            más salió; registrá la entrada.
          </li>
          <li>
            <span className="font-medium text-ink">4. Transferir</span> — si falta en una sede y sobra
            en la otra.
          </li>
        </ol>
      </section>
    </PageShell>
  );
}
