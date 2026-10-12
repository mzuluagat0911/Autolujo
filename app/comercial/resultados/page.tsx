import Link from "next/link";
import { Kpi, PageHeader, PageShell } from "@/components/kit";
import { resumenComercial } from "@/lib/comercial/resultados";

export const dynamic = "force-dynamic";

export default async function ResultadosComercialPage() {
  const r = await resumenComercial();
  return (
    <PageShell width="list">
      <PageHeader
        eyebrow="Comercial"
        title="Resultados"
        subtitle="Del primer mensaje a la cita, la visita y el contrato. La primera respuesta es la mediana, en minutos."
        action={
          <Link
            href="/comercial"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Chats
          </Link>
        }
      />
      {r.error && <p className="mt-4 text-sm text-rojo">{r.error}</p>}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Leads" value={r.leads} />
        <Kpi label="Con cita" value={r.conCita} hint={porcentaje(r.conCita, r.leads)} />
        <Kpi label="Visitaron" value={r.visitas} hint={porcentaje(r.visitas, r.conCita)} tone="good" />
        <Kpi label="Contratos" value={r.ganados} hint={porcentaje(r.ganados, r.visitas)} tone="good" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Primera respuesta" value={r.primeraRespuestaMin == null ? "—" : `${r.primeraRespuestaMin} min`} />
        <Kpi label="Seguimiento vencido" value={r.vencidos} tone={r.vencidos > 0 ? "crit" : "default"} />
        <Kpi label="Perdidos" value={r.perdidos} />
      </div>

      <h2 className="mt-10 text-lg font-semibold">Temperatura y cadencia</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Caliente" value={r.calientes} tone="warn" />
        <Kpi label="Tibio" value={r.tibios} />
        <Kpi label="Frío" value={r.frios} />
        <Kpi label="1.er seguimiento" value={r.cadencia.uno} />
        <Kpi label="2.º seguimiento" value={r.cadencia.dos} />
        <Kpi label="3.er seguimiento" value={r.cadencia.tres} />
      </div>

      <h2 className="mt-10 text-lg font-semibold">WhatsApp</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Seguimientos enviados" value={r.seguimientos.enviados} />
        <Kpi label="Pendientes" value={r.seguimientos.pendientes} />
        <Kpi label="Seguimientos fallidos" value={r.seguimientos.fallidos} tone={r.seguimientos.fallidos > 0 ? "crit" : "default"} />
        <Kpi label="Avisos de cita fallidos" value={r.avisosFallidos} tone={r.avisosFallidos > 0 ? "crit" : "default"} />
        <Kpi label="Entregados" value={r.entregas.entregados} />
        <Kpi label="Leídos" value={r.entregas.leidos} tone="good" />
        <Kpi label="Rechazados por Meta" value={r.entregas.fallidos} tone={r.entregas.fallidos > 0 ? "crit" : "default"} />
      </div>

      <Tabla titulo="Por campaña" filas={r.porCampana} />
      <Tabla titulo="Por asesor" filas={r.porAsesor} />
    </PageShell>
  );
}

function porcentaje(parte: number, total: number): string {
  if (!total) return "Sin base";
  return `${Math.round((parte / total) * 100)}% del paso anterior`;
}

function Tabla({ titulo, filas }: { titulo: string; filas: { nombre: string; leads: number; citas: number; ganados: number }[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 text-right font-medium">Leads</th>
              <th className="px-4 py-3 text-right font-medium">Citas</th>
              <th className="px-4 py-3 text-right font-medium">Contratos</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>Todavía no hay leads para esta vista.</td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.nombre} className="border-t border-line">
                <td className="px-4 py-3">{f.nombre}</td>
                <td className="px-4 py-3 text-right tabular-nums">{f.leads}</td>
                <td className="px-4 py-3 text-right tabular-nums">{f.citas}</td>
                <td className="px-4 py-3 text-right tabular-nums">{f.ganados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
