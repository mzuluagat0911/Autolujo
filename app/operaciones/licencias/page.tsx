import { PageHeader, EmptyState } from "@/components/kit";
import { licenciasSemaforo } from "@/lib/operaciones/alertas";
import { LicenciasVista } from "./vista";

export const dynamic = "force-dynamic";

export default async function LicenciasPage() {
  const { disponible, items } = await licenciasSemaforo();
  const rojos = items.filter((i) => i.nivel === "rojo" || i.nivel === "vencido").length;

  return (
    <div className="mx-auto max-w-5xl py-10">
      <PageHeader
        eyebrow="Operaciones"
        title="Licencias"
        subtitle="Semáforo por vencimiento. Rojo = 0–30 días (o vencida) · Amarillo = 31–90 · Verde = 91+."
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Por vencer / vencidas
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rojo">{rojos}</p>
          </div>
        }
      />

      {!disponible ? (
        <div className="mt-6">
          <EmptyState
            title="Aún no hay licencias cargadas"
            hint="Corre la migración 0025 y carga la fecha de vencimiento de licencia de cada cliente."
          />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Sin licencias registradas"
            hint="Cuando cargues las fechas de vencimiento, el semáforo aparecerá aquí."
          />
        </div>
      ) : (
        <LicenciasVista items={items} />
      )}
    </div>
  );
}
