import Link from "next/link";
import { Kpi, PageHeader, PageShell, StatusChip } from "@/components/kit";
import { resolverRangoResultados, resumenComercial } from "@/lib/comercial/resultados";
import { FiltroResultados } from "./filtro";

export const dynamic = "force-dynamic";

export default async function ResultadosComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const rango = resolverRangoResultados(sp);
  const r = await resumenComercial(rango);
  const abiertos = r.calientes + r.tibios + r.frios;
  const embudo = [
    { label: "Leads", value: r.leads, base: null as number | null },
    { label: "Con cita", value: r.conCita, base: r.leads },
    { label: "Visitaron", value: r.visitas, base: r.conCita },
    { label: "Contratos", value: r.ganados, base: r.visitas },
  ];

  return (
    <PageShell width="list">
      <PageHeader
        eyebrow="Comercial"
        title="Resultados"
        subtitle="Del primer mensaje al contrato. Un contrato cuenta aquí cuando el WhatsApp del alta es el mismo del chat."
        action={
          <Link
            href="/comercial"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Chats
          </Link>
        }
      />

      <FiltroResultados
        periodo={rango.periodo}
        desde={rango.desde}
        hasta={rango.hasta}
        etiqueta={rango.etiqueta}
      />

      {r.error && <p className="mt-4 text-sm text-rojo">{r.error}</p>}

      <section className="mt-8 rounded-xl bg-surface p-5 ring-1 ring-line sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Embudo</h2>
            <p className="mt-1 text-sm text-muted">
              Leads creados en {rango.etiqueta.toLowerCase()}. Cuántos pasan de un paso al siguiente.
            </p>
          </div>
          {r.primeraRespuestaMin != null && (
            <p className="text-sm text-muted">
              Primera respuesta mediana:{" "}
              <span className="font-medium tabular-nums text-ink">{r.primeraRespuestaMin} min</span>
            </p>
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-0">
          {embudo.map((paso, i) => {
            const pct = paso.base == null ? null : tasa(paso.value, paso.base);
            return (
              <div
                key={paso.label}
                className={`relative ${i > 0 ? "lg:border-l lg:border-line lg:pl-6" : ""} ${i < embudo.length - 1 ? "lg:pr-6" : ""}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{paso.label}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-ink lg:text-4xl">
                  {fmt(paso.value)}
                </p>
                {pct != null ? (
                  <p className="mt-2 text-sm tabular-nums text-muted">{pct}% del paso anterior</p>
                ) : (
                  <p className="mt-2 text-sm text-muted">Base del embudo</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Seguimiento vencido</p>
            {r.vencidos > 0 ? <StatusChip tone="crit">Por atender</StatusChip> : <StatusChip tone="good">Al día</StatusChip>}
          </div>
          <p className={`mt-3 text-3xl font-bold tabular-nums tracking-tight ${r.vencidos > 0 ? "text-rojo" : "text-ink"}`}>
            {fmt(r.vencidos)}
          </p>
          <p className="mt-2 text-sm text-muted">
            Chats abiertos de este periodo cuya fecha de volver a escribir ya pasó.
          </p>
        </div>
        <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Perdidos</p>
          <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-ink">{fmt(r.perdidos)}</p>
          <p className="mt-2 text-sm text-muted">Leads de este periodo cerrados sin contrato.</p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Temperatura</h2>
        <p className="mt-1 text-sm text-muted">Chats abiertos de este periodo según qué tan cerca están de cerrar.</p>
        <div className="mt-4 rounded-xl bg-surface p-5 ring-1 ring-line">
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
            <BarParte valor={r.calientes} total={abiertos} clase="bg-ambar" />
            <BarParte valor={r.tibios} total={abiertos} clase="bg-ink/40" />
            <BarParte valor={r.frios} total={abiertos} clase="bg-line-strong" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4">
            <TempItem label="Caliente" value={r.calientes} total={abiertos} tone="warn" />
            <TempItem label="Tibio" value={r.tibios} total={abiertos} />
            <TempItem label="Frío" value={r.frios} total={abiertos} />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Cadencia de seguimiento</h2>
        <p className="mt-1 text-sm text-muted">En qué intento va cada chat abierto de este periodo.</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Kpi label="1.er seguimiento" value={fmt(r.cadencia.uno)} />
          <Kpi label="2.º seguimiento" value={fmt(r.cadencia.dos)} />
          <Kpi label="3.er seguimiento" value={fmt(r.cadencia.tres)} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">WhatsApp</h2>
        <p className="mt-1 text-sm text-muted">Envíos de Lucía y lectura en este periodo.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Seguimientos enviados" value={fmt(r.seguimientos.enviados)} />
          <Kpi
            label="Pendientes"
            value={fmt(r.seguimientos.pendientes)}
            tone={r.seguimientos.pendientes > 0 ? "warn" : "default"}
          />
          <Kpi
            label="Entregados"
            value={fmt(r.entregas.entregados)}
            hint={`${fmt(r.entregas.enviados)} salientes`}
          />
          <Kpi
            label="Leídos"
            value={fmt(r.entregas.leidos)}
            tone="good"
            hint="Incluidos en entregados"
          />
        </div>
      </section>

      <Tabla titulo="Por campaña" filas={r.porCampana} />
      <Tabla titulo="Por asesor" filas={r.porAsesor} />
    </PageShell>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("es-PA");
}

function tasa(parte: number, total: number): number | null {
  if (!total) return null;
  return Math.round((parte / total) * 100);
}

function BarParte({ valor, total, clase }: { valor: number; total: number; clase: string }) {
  if (!total || valor <= 0) return null;
  const pct = Math.max((valor / total) * 100, 2);
  return <div className={clase} style={{ width: `${pct}%` }} title={`${valor}`} />;
}

function TempItem({
  label,
  value,
  total,
  tone = "default",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "default" | "warn";
}) {
  const pct = tasa(value, total);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${tone === "warn" ? "text-ambar" : "text-ink"}`}>
        {fmt(value)}
      </p>
      <p className="mt-1 text-sm tabular-nums text-muted">{pct == null ? "—" : `${pct}% abiertos`}</p>
    </div>
  );
}

function Tabla({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { nombre: string; leads: number; citas: number; ganados: number }[];
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 text-right font-medium">Leads</th>
              <th className="px-4 py-3 text-right font-medium">Citas</th>
              <th className="px-4 py-3 text-right font-medium">Cita %</th>
              <th className="px-4 py-3 text-right font-medium">Contratos</th>
              <th className="px-4 py-3 text-right font-medium">Cierre %</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={6}>
                  Todavía no hay leads para este periodo.
                </td>
              </tr>
            )}
            {filas.map((f) => {
              const citaPct = tasa(f.citas, f.leads);
              const cierrePct = tasa(f.ganados, f.leads);
              return (
                <tr key={f.nombre} className="border-t border-line">
                  <td className="px-4 py-3">{f.nombre}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(f.leads)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(f.citas)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {citaPct == null ? "—" : `${citaPct}%`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(f.ganados)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {cierrePct == null ? "—" : `${cierrePct}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
