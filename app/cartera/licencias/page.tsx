import Link from "next/link";
import { PageHeader, StatusChip, EmptyState } from "@/components/kit";
import { licenciasSemaforo, type NivelSemaforo } from "@/lib/operaciones/alertas";

export const dynamic = "force-dynamic";

function tono(n: NivelSemaforo): "crit" | "warn" | "good" {
  if (n === "vencido" || n === "rojo") return "crit";
  if (n === "amarillo") return "warn";
  return "good";
}
function etiqueta(dias: number): string {
  if (dias < 0) return `Vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "Vence HOY";
  return `Vence en ${dias} día${dias === 1 ? "" : "s"}`;
}

export default async function LicenciasPage() {
  const { disponible, items } = await licenciasSemaforo();
  const rojos = items.filter((i) => i.nivel === "rojo" || i.nivel === "vencido").length;

  return (
    <div className="mx-auto max-w-5xl py-10">
      <PageHeader
        eyebrow="Operaciones"
        title="Licencias"
        subtitle="Semáforo por vencimiento. Rojo = 0–30 días (o vencida) · Amarillo = 31–90 · Verde = 92+."
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Por vencer / vencidas</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rojo">{rojos}</p>
          </div>
        }
      />

      {!disponible ? (
        <div className="mt-6"><EmptyState title="Aún no hay licencias cargadas" hint="Corre la migración 0019 y carga la fecha de vencimiento de licencia de cada cliente (clientes.fecha_vencimiento_licencia)." /></div>
      ) : items.length === 0 ? (
        <div className="mt-6"><EmptyState title="Sin licencias registradas" hint="Cuando cargues las fechas de vencimiento, el semáforo aparecerá aquí." /></div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Situación</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/cartera/clientes/${i.id}`} className="hover:underline">{i.nombre}</Link>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {i.vehiculoId && i.carro ? (
                      <Link href={`/operaciones/hoja-vida/${i.vehiculoId}`} className="hover:underline">
                        {i.carro}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">{i.fecha}</td>
                  <td className="px-4 py-3"><StatusChip tone={tono(i.nivel)}>{etiqueta(i.dias)}</StatusChip></td>
                  <td className="px-4 py-3 tabular-nums text-muted">{i.contacto ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
