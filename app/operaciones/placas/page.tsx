import { PageHeader, EmptyState } from "@/components/kit";
import { revisadoSemaforo } from "@/lib/operaciones/alertas";
import { PlacasVista } from "./vista";

export const dynamic = "force-dynamic";

export default async function PlacasPage() {
  const { disponible, items } = await revisadoSemaforo();
  const rojos = items.filter((i) => i.nivel === "rojo" || i.nivel === "vencido").length;

  return (
    <div className="mx-auto max-w-5xl py-10">
      <PageHeader
        eyebrow="Operaciones"
        title="Placas y revisado"
        subtitle="Semáforo por vencimiento del revisado. El cliente retira su sticker hasta el 30 de cada mes."
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Por vencer / vencidos
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rojo">{rojos}</p>
          </div>
        }
      />

      {!disponible ? (
        <div className="mt-6">
          <EmptyState
            title="Aún no hay revisados cargados"
            hint="Carga el vencimiento del revisado por carro (vehiculos.revisado_vence)."
          />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Sin revisados registrados"
            hint="Cuando cargues los vencimientos, el semáforo aparecerá aquí."
          />
        </div>
      ) : (
        <PlacasVista items={items} />
      )}
    </div>
  );
}
