import { PageHeader, StatusChip, EmptyState } from "@/components/kit";
import { mantenimientoKm, KM_MANTENIMIENTO } from "@/lib/operaciones/alertas";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-PA"));

export default async function MantenimientoPage() {
  const { disponible, items } = await mantenimientoKm();
  const vencidos = items.filter((i) => i.estado === "vencido").length;

  return (
    <div className="mx-auto max-w-4xl py-10">
      <PageHeader
        eyebrow="Operaciones"
        title="Mantenimiento por km"
        subtitle={`FULL cada ${KM_MANTENIMIENTO.toLocaleString("es-PA")} km. En rojo los que ya deben citarse.`}
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Por citar (≥ {KM_MANTENIMIENTO.toLocaleString("es-PA")} km)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rojo">{vencidos}</p>
          </div>
        }
      />

      {!disponible ? (
        <div className="mt-6"><EmptyState title="Aún no hay mantenimientos cargados" hint="Corre la migración 0019 y carga la fecha del último mantenimiento por carro (vehiculos.fecha_ultimo_mantenimiento). El km lo aporta Diacor." /></div>
      ) : items.length === 0 ? (
        <div className="mt-6"><EmptyState title="Sin datos de mantenimiento" hint="Cuando cargues la fecha del último mantenimiento, sumamos el km de Diacor y verás quién citar." /></div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Último mant.</th>
                <th className="px-4 py-3 font-medium">Km recorridos</th>
                <th className="px-4 py-3 font-medium">Situación</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.empresa}-${i.vehiculoNumero}`} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-semibold tabular-nums">{etiquetaCarroUi(i.empresa, i.vehiculoNumero)}</td>
                  <td className="px-4 py-3">{i.cliente ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">{i.desde}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{fmt(i.kmDesde)} km</td>
                  <td className="px-4 py-3">
                    {i.estado === "vencido" ? (
                      <StatusChip tone="crit">Citar ya</StatusChip>
                    ) : i.estado === "pronto" ? (
                      <StatusChip tone="warn">Pronto (faltan {fmt(i.faltan)} km)</StatusChip>
                    ) : (
                      <StatusChip tone="good">Al día</StatusChip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
