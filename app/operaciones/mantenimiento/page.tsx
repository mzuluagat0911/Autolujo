import { PageHeader, EmptyState } from "@/components/kit";
import { mantenimientoKm, KM_MANTENIMIENTO } from "@/lib/operaciones/alertas";
import { MantenimientoVista } from "./vista";

export const dynamic = "force-dynamic";

export default async function MantenimientoPage() {
  const { disponible, items } = await mantenimientoKm();
  const vencidos = items.filter((i) => i.estado === "vencido").length;

  return (
    <div className="mx-auto max-w-5xl py-10">
      <PageHeader
        eyebrow="Operaciones"
        title="Mantenimiento por km"
        subtitle={`FULL cada ${KM_MANTENIMIENTO.toLocaleString("es-PA")} km. En rojo los que ya deben citarse.`}
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Por citar (≥ {KM_MANTENIMIENTO.toLocaleString("es-PA")} km)
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rojo">{vencidos}</p>
          </div>
        }
      />

      {!disponible ? (
        <div className="mt-6">
          <EmptyState
            title="Aún no hay mantenimientos cargados"
            hint="Carga la fecha del último mantenimiento por carro. El km lo aporta Diacor."
          />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Sin datos de mantenimiento"
            hint="Cuando cargues la fecha del último mantenimiento, sumamos el km de Diacor y verás quién citar."
          />
        </div>
      ) : (
        <MantenimientoVista items={items} />
      )}
    </div>
  );
}
