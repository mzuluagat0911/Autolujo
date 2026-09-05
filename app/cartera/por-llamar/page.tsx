import { PageHeader, Money, StatusChip, EmptyState } from "@/components/kit";
import { paraLlamarHoy } from "@/lib/cartera/recordatorios";
import { normalizarTelefono } from "@/lib/cartera/telefono";

export const dynamic = "force-dynamic";

const HOY = new Intl.DateTimeFormat("es-PA", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

export default async function PorLlamarPage() {
  let lista: Awaited<ReturnType<typeof paraLlamarHoy>> = [];
  let error: string | null = null;
  try {
    lista = await paraLlamarHoy();
  } catch (e) {
    error = e instanceof Error ? e.message : "Error";
  }

  const totalDeuda = lista.reduce((s, e) => s + e.totalHoy, 0);

  return (
    <div className="mx-auto max-w-5xl py-10">
      <PageHeader
        eyebrow="Cartera"
        title="Por llamar"
        subtitle={`Deben hoy y aún no han pagado · ${HOY}`}
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Pendiente hoy</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink"><Money amount={totalDeuda} /></p>
            <p className="mt-0.5 text-xs text-muted">{lista.length} por cobrar</p>
          </div>
        }
      />

      {error && (
        <p className="mt-6 rounded-lg bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line">{error}</p>
      )}

      {lista.length === 0 && !error ? (
        <EmptyState title="¡Todos al día por hoy! 🎉" hint="Cuando alguien tenga cuota pendiente sin pagar, aparecerá aquí para llamarlo." />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Debe hoy</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const tel = normalizarTelefono(e.waNumero);
                return (
                  <tr key={e.contratoId} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium tabular-nums">{e.vehiculoNumero}</td>
                    <td className="px-4 py-3">
                      <div>{e.clienteNombre}</div>
                      <div className="text-xs text-muted">{e.desglose}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums"><Money amount={e.totalHoy} /></td>
                    <td className="px-4 py-3 tabular-nums text-muted">{tel ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {tel ? (
                        <a
                          href={`tel:+${tel}`}
                          className="inline-flex rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-surface transition hover:bg-black"
                        >
                          Llamar
                        </a>
                      ) : (
                        <StatusChip tone="warn">sin teléfono</StatusChip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
