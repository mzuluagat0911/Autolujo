import { PageHeader, StatusChip, EmptyState } from "@/components/kit";
import { revisadoSemaforo, type NivelSemaforo } from "@/lib/operaciones/alertas";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

export const dynamic = "force-dynamic";

function tono(n: NivelSemaforo): "crit" | "warn" | "good" {
  if (n === "vencido" || n === "rojo") return "crit";
  if (n === "amarillo") return "warn";
  return "good";
}
function etiqueta(dias: number): string {
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} d`;
  if (dias === 0) return "Vence HOY";
  return `Vence en ${dias} d`;
}

export default async function PlacasPage() {
  const { disponible, items } = await revisadoSemaforo();
  const rojos = items.filter((i) => i.nivel === "rojo" || i.nivel === "vencido").length;

  return (
    <div className="mx-auto max-w-4xl py-10">
      <PageHeader
        eyebrow="Operaciones"
        title="Placas y revisado"
        subtitle="Semáforo por vencimiento del revisado. Recuerda: el cliente retira su sticker hasta el 30 de cada mes."
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Por vencer / vencidos</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rojo">{rojos}</p>
          </div>
        }
      />

      {!disponible ? (
        <div className="mt-6"><EmptyState title="Aún no hay revisados cargados" hint="Corre la migración 0019 y carga el vencimiento del revisado por carro (vehiculos.revisado_vence)." /></div>
      ) : items.length === 0 ? (
        <div className="mt-6"><EmptyState title="Sin revisados registrados" hint="Cuando cargues los vencimientos, el semáforo aparecerá aquí." /></div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Revisado vence</th>
                <th className="px-4 py-3 font-medium">Situación</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.empresa}-${i.vehiculoNumero}`} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-semibold tabular-nums">{etiquetaCarroUi(i.empresa, i.vehiculoNumero)}</td>
                  <td className="px-4 py-3">{i.cliente ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">{i.fecha}</td>
                  <td className="px-4 py-3"><StatusChip tone={tono(i.nivel)}>{etiqueta(i.dias)}</StatusChip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
