import { EmptyState, StatusChip } from "@/components/kit";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import type { KitTiempoItem, MantenimientoItem, RevisionMensualItem } from "@/lib/operaciones/alertas";
import { tituloSemana, type InformeSemana } from "@/lib/operaciones/informe-semana";

const fmt = (n: number) => n.toLocaleString("es-PA");

function TablaMant({ items }: { items: MantenimientoItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nadie por citar" hint="Ningún carro llegó a 5.000 km desde el último mantenimiento." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Carro</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Km desde el último</th>
            <th className="px-4 py-3 font-medium">Situación</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={`${i.empresa}-${i.vehiculoNumero}`} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-semibold tabular-nums">{etiquetaCarroUi(i.empresa, i.vehiculoNumero)}</td>
              <td className="px-4 py-3">{i.cliente ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums font-medium">{fmt(i.kmDesde)} km</td>
              <td className="px-4 py-3">
                {i.estado === "vencido" ? (
                  <StatusChip tone="crit">Pasó los 6.000</StatusChip>
                ) : (
                  <StatusChip tone="warn">Citar (faltan {fmt(i.faltan)} km)</StatusChip>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaKm({ items, citar, pronto }: { items: KitTiempoItem[]; citar: string; pronto: string }) {
  if (items.length === 0) {
    return <EmptyState title="Nadie por citar" hint="Ningún carro está a 5.000 km de esta marca." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Carro</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Km actual</th>
            <th className="px-4 py-3 font-medium">Marca</th>
            <th className="px-4 py-3 font-medium">Situación</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={`${i.empresa}-${i.vehiculoNumero}`} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-semibold tabular-nums">{etiquetaCarroUi(i.empresa, i.vehiculoNumero)}</td>
              <td className="px-4 py-3">{i.cliente ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums font-medium">{fmt(i.kmActual)}</td>
              <td className="px-4 py-3 tabular-nums text-muted">{fmt(i.marcaKm)}</td>
              <td className="px-4 py-3">
                {i.estado === "vencido" ? (
                  <StatusChip tone="crit">{citar}</StatusChip>
                ) : (
                  <StatusChip tone="warn">
                    {pronto} (faltan {fmt(i.faltan)} km)
                  </StatusChip>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InformeSemanaVista({ informe }: { informe: InformeSemana }) {
  const enCurso = informe.semanaDesde <= informe.hoy;
  return (
    <section className="mt-8 space-y-8">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Informe de la semana
        </h2>
        <p className="mt-1 text-sm text-ink">
          {enCurso ? "Semana en curso" : "Para la semana siguiente"}: {tituloSemana(informe)}.
        </p>
        <p className="mt-1 text-sm text-muted">
          El sistema lo deja listo el viernes a la 1:00 p.m. Néstor cita. Amalia confirma que sí asistan.
          El aviso WhatsApp al cliente del sábado espera las plantillas y el cron.
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Mantenimiento básico</h3>
        <p className="mb-3 text-sm text-muted">Desde 5.000 km del último, y los que ya pasaron de 6.000.</p>
        <TablaMant items={informe.mantenimiento} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Kit de tiempos</h3>
        <p className="mb-3 text-sm text-muted">La primera vez a los 100.000 km. Después, cada 60.000.</p>
        <TablaKm items={informe.kit} citar="Citar kit" pronto="Citar" />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Aceite ATF y filtro</h3>
        <p className="mb-3 text-sm text-muted">A los 50.000 km. No es el kit de tiempos.</p>
        <TablaKm items={informe.atf} citar="Citar ATF" pronto="Citar" />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Revisión mensual</h3>
        <p className="mb-3 text-sm text-muted">Una vez al mes. No es el FULL ni el kit.</p>
        {informe.revision === "sin_fecha" ? (
          <EmptyState
            title="Esta lista todavía no sale sola"
            hint="Falta la fecha de la última visita por carro. Corré la migración 0056 y cargá el informe."
          />
        ) : (
          <TablaRevision items={informe.revision} />
        )}
      </div>
    </section>
  );
}

function TablaRevision({ items }: { items: RevisionMensualItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nadie por citar" hint="Ningún carro está a 7 días o más de la revisión mensual." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Carro</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Última visita</th>
            <th className="px-4 py-3 font-medium">Situación</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={`${i.empresa}-${i.vehiculoNumero}`} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-semibold tabular-nums">{etiquetaCarroUi(i.empresa, i.vehiculoNumero)}</td>
              <td className="px-4 py-3">{i.cliente ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums text-muted">{i.ultima}</td>
              <td className="px-4 py-3">
                {i.estado === "vencido" ? (
                  <StatusChip tone="crit">Pasó el mes ({i.diasDesde} d)</StatusChip>
                ) : (
                  <StatusChip tone="warn">Citar (faltan {i.faltan} d)</StatusChip>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
