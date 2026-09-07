import { PageHeader, Kpi, EmptyState } from "@/components/kit";
import { cargarTableroRastreo } from "./actions";
import { TableroRastreo } from "./tablero";

export const dynamic = "force-dynamic";

export default async function RastreoPage() {
  const t = await cargarTableroRastreo();

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Cartera"
        title="Rastreo"
        subtitle="Dónde está cada carro ahora, y el km de cada día guardado para el equipo."
      />

      {!t.configurado ? (
        <EmptyState
          title="Falta conectar Diacor"
          hint="En Vercel (o .env.local) ponga DIACOR_USER y DIACOR_PASSWORD de rastreo.diacorserver.com. El host ya está puesto."
        />
      ) : t.error ? (
        <p className="rounded-xl bg-rojo-wash px-4 py-3 text-sm text-rojo ring-1 ring-rojo/20">{t.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Dispositivos" value={t.filas.length} hint="Lo que responde Diacor" />
            <Kpi label="En línea" value={t.enLinea} tone="good" hint="Señal viva" />
            <Kpi label="Sin carro" value={t.sinVincular} tone={t.sinVincular > 0 ? "warn" : "default"} hint="No calzan con la flota" />
            <Kpi label="Por amarrar" value={t.porVincular} tone={t.porVincular > 0 ? "warn" : "default"} hint="Calzan, falta guardar gps_id" />
          </div>
          <div className="mt-8">
            <TableroRastreo inicial={t} />
          </div>
        </>
      )}
    </div>
  );
}
