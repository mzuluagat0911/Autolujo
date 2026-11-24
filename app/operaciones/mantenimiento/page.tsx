import { PageHeader, EmptyState, PageShell } from "@/components/kit";
import {
  mantenimientoKm,
  kitTiempoKm,
  aceiteAtfKm,
  revisionMensual,
  KM_MANTENIMIENTO,
  KM_KIT_PRIMERA,
  KM_KIT_TIEMPO,
} from "@/lib/operaciones/alertas";
import { armarInforme, fechasInforme } from "@/lib/operaciones/informe-semana";
import { MantenimientoVista } from "./vista";
import { KitTiempoVista } from "./kit-vista";
import { InformeSemanaVista } from "./informe-vista";
import { TarifarioMecanicaVista } from "./tarifario-vista";

export const dynamic = "force-dynamic";

export default async function MantenimientoPage() {
  const [mant, kit, atf, rev] = await Promise.all([
    mantenimientoKm(),
    kitTiempoKm(),
    aceiteAtfKm(),
    revisionMensual(),
  ]);
  const informe = armarInforme(
    fechasInforme(),
    mant.disponible ? mant.items : [],
    kit.disponible ? kit.items : [],
    atf.disponible ? atf.items : [],
    rev.disponible ? rev.items.filter((i) => i.estado !== "ok") : "sin_fecha",
  );
  const vencidos = mant.items.filter((i) => i.estado === "vencido").length;
  const kitCrit = kit.items.filter((i) => i.estado === "vencido").length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Operaciones"
        title="Mantenimiento"
        subtitle={`Básico cada ${KM_MANTENIMIENTO.toLocaleString("es-PA")} km · kit a los ${KM_KIT_PRIMERA.toLocaleString("es-PA")} y luego cada ${KM_KIT_TIEMPO.toLocaleString("es-PA")}. El informe queda el viernes a la 1:00 p.m.`}
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Por citar
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rojo">{vencidos}</p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Kit de tiempo
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-ambar">{kitCrit}</p>
          </div>
        }
      />

      <InformeSemanaVista informe={informe} />

      <section className="mt-12">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Mantenimiento básico · {KM_MANTENIMIENTO.toLocaleString("es-PA")} km
        </h2>
        {!mant.disponible ? (
          <div className="mt-4">
            <EmptyState
              title="Aún no hay mantenimientos cargados"
              hint="Carga la fecha del último mantenimiento por carro. El km lo aporta Diacor."
            />
          </div>
        ) : mant.items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Sin datos de mantenimiento"
              hint="Cuando cargues la fecha del último mantenimiento, sumamos el km de Diacor."
            />
          </div>
        ) : (
          <MantenimientoVista items={mant.items} />
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Kit de tiempo · {KM_KIT_PRIMERA.toLocaleString("es-PA")} km y luego cada {KM_KIT_TIEMPO.toLocaleString("es-PA")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Se cita 5.000 km antes de la marca y hasta 5.000 km después.
        </p>
        {!kit.disponible ? (
          <EmptyState
            title="Sin km actual"
            hint="Cuando los carros tengan km_actual, aparece quién citar para kit de tiempo."
          />
        ) : (
          <KitTiempoVista items={kit.items} />
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Tarifario de mano de obra (mecánica)
        </h2>
        <p className="mt-1 text-sm text-muted">
          Precios de mano de obra para cobrar y para cuadrar cuentas el día del mantenimiento.
        </p>
        <TarifarioMecanicaVista />
      </section>
    </PageShell>
  );
}
