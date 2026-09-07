import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
import {
  money2,
  pctTxt,
  resumenCobranzaHoy,
  type ResumenCobranza,
} from "@/lib/cartera/resumen-cobranza";
import { PageHeader, Band, Kpi, Money, StatusChip, EmptyState } from "@/components/kit";

export const dynamic = "force-dynamic";

type Resumen = {
  ok: boolean;
  clientes: number;
  contratos: number;
  vehiculos: number;
  pagosPend: number;
  cobradoHoy: number;
  saldoTotal: number;
  cobranza: ResumenCobranza | null;
  error: string | null;
};

async function getResumen(): Promise<Resumen> {
  try {
    const sb = createServerSupabase();
    const hoy = hoyPanama();
    const [clientes, contratos, vehiculos, pagosPend, cobrado, saldos, cobranza] = await Promise.all([
      sb.from("clientes").select("*", { count: "exact", head: true }),
      sb.from("contratos").select("*", { count: "exact", head: true }),
      sb.from("vehiculos").select("*", { count: "exact", head: true }),
      sb
        .from("pagos")
        .select("*", { count: "exact", head: true })
        .in("estado_conciliacion", ["pendiente", "manual"]),
      sb.from("pagos").select("monto").in("estado_conciliacion", ["conciliado", "manual"]).eq("fecha", hoy),
      sb.from("vw_saldo_contrato").select("saldo_actual"),
      resumenCobranzaHoy(),
    ]);
    const firstErr =
      clientes.error ?? contratos.error ?? vehiculos.error ?? pagosPend.error ?? saldos.error;
    if (firstErr) throw firstErr;
    const saldoTotal = (saldos.data ?? []).reduce(
      (acc: number, r: { saldo_actual: number | null }) => acc + Number(r.saldo_actual ?? 0),
      0,
    );
    const cobradoHoy = (cobrado.data ?? []).reduce(
      (acc: number, r: { monto: number | null }) => acc + Number(r.monto ?? 0),
      0,
    );
    return {
      ok: true,
      clientes: clientes.count ?? 0,
      contratos: contratos.count ?? 0,
      vehiculos: vehiculos.count ?? 0,
      pagosPend: pagosPend.count ?? 0,
      cobradoHoy,
      saldoTotal,
      cobranza,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      clientes: 0,
      contratos: 0,
      vehiculos: 0,
      pagosPend: 0,
      cobradoHoy: 0,
      saldoTotal: 0,
      cobranza: null,
      error: e instanceof Error ? e.message : "Error",
    };
  }
}

export default async function ResumenPage() {
  const r = await getResumen();

  if (!r.ok) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="Plataforma" title="Resumen" subtitle="El pulso de todo el negocio" />
        <div className="border border-line bg-surface p-8">
          <h2 className="text-xl font-bold">No se pudo leer la base de datos</h2>
          <p className="mt-2 text-sm text-muted">
            Revisa que el schema esté aplicado en Supabase y las variables de entorno.
          </p>
          <p className="mt-4 bg-surface-2 p-3 font-mono text-xs text-muted">{r.error}</p>
        </div>
      </div>
    );
  }

  const c = r.cobranza;

  return (
    <div className="pb-20">
      <PageHeader
        eyebrow="Inversiones Auto Lujo Panamá"
        title="Resumen"
        subtitle={c ? `Cifras al día ${c.fechaLarga}` : undefined}
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Hoy</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              <Money amount={r.cobradoHoy} />
            </p>
            <p className="mt-0.5 text-xs text-muted">Cobrado y conciliado</p>
          </div>
        }
      />

      <div className="space-y-16">
        {c && (
          <Band title="Cobranza del mes" status="active">
            {!c.metaAsignada && (
              <Link
                href="/admin/metas"
                className="mb-4 flex items-center justify-between rounded-xl bg-ambar-wash px-5 py-3 text-sm ring-1 ring-ambar/25 transition hover:ring-ambar/40"
              >
                <span className="text-ink">
                  Este mes aún no tiene meta asignada. El tablero usa una estimación por letras.
                </span>
                <span className="shrink-0 font-medium text-ambar">Cargar meta →</span>
              </Link>
            )}
            <CifrasCobranza c={c} />
          </Band>
        )}

        <Band title="Cartera" status="active">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Kpi
                size="hero"
                label="Saldo en cartera"
                value={<Money amount={r.saldoTotal} />}
                hint="Total por cobrar en toda la flota"
              />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-8 bg-surface px-6 py-8 lg:col-span-7">
              <Kpi label="Cobrado hoy" value={<Money amount={r.cobradoHoy} />} hint="Conciliado / oficina" />
              <Kpi
                label="Por conciliar"
                value={r.pagosPend}
                tone={r.pagosPend > 0 ? "warn" : "default"}
                hint="Comprobantes"
              />
              <Kpi label="Contratos" value={r.contratos} hint={`${r.vehiculos} vehículos`} />
              <Kpi label="Clientes" value={r.clientes} hint="En cartera" />
            </div>
          </div>

          <div className="mt-6">
            {r.pagosPend > 0 ? (
              <Link
                href="/cartera/pagos"
                className="flex items-center justify-between rounded-xl bg-ambar-wash px-5 py-4 text-sm ring-1 ring-ambar/25 transition hover:ring-ambar/40"
              >
                <span>
                  <span className="text-lg font-bold tabular-nums text-ambar">{r.pagosPend}</span>
                  <span className="ml-3 text-ink">pagos esperando conciliación</span>
                </span>
                <span className="font-medium text-ambar">Revisar →</span>
              </Link>
            ) : (
              <EmptyState
                title="Nada pendiente por conciliar"
                hint="Cuando un cliente envíe un comprobante por WhatsApp, aparece aquí."
              />
            )}
          </div>
        </Band>

        <Band title="Comercial y Atención" status="pronto">
          <div className="grid grid-cols-2 gap-x-10 gap-y-8 lg:grid-cols-4">
            <Kpi label="Leads nuevos" value="" tone="pronto" />
            <Kpi label="Sin seguimiento" value="" tone="pronto" />
            <Kpi label="Citas" value="" tone="pronto" />
            <Kpi label="Conversión" value="" tone="pronto" />
          </div>
        </Band>

        <Band title="Operaciones" status="pronto">
          <div className="grid grid-cols-2 gap-x-10 gap-y-8 lg:grid-cols-4">
            <Kpi label="Novedades" value="" tone="pronto" />
            <Kpi label="Flota activa" value="" tone="pronto" />
            <Kpi label="En taller" value="" tone="pronto" />
            <Kpi label="Mantenimientos" value="" tone="pronto" />
          </div>
        </Band>

        <Band title="Seguros" status="pronto">
          <div className="grid grid-cols-2 gap-x-10 gap-y-8 lg:grid-cols-4">
            <Kpi label="Reclamaciones" value="" tone="pronto" />
            <Kpi label="Audiencias" value="" tone="pronto" />
            <Kpi label="Resoluciones" value="" tone="pronto" />
            <Kpi label="Aseguradoras" value="" tone="pronto" />
          </div>
        </Band>

        <Band title="Agentes" status="active">
          <div className="divide-y divide-line border-y border-line">
            <AgentRow nombre="Cartera" estado="activo" nota="WhatsApp · cobra y concilia" />
            <AgentRow nombre="Comercial y Atención" estado="activando" />
            <AgentRow nombre="Operaciones" estado="activando" />
            <AgentRow nombre="Seguros" estado="activando" />
          </div>
        </Band>
      </div>
    </div>
  );
}

function CifrasCobranza({ c }: { c: ResumenCobranza }) {
  const bajo100 = c.gap100 < -0.009;
  const bajo95 = c.gap95 < -0.009;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-surface p-5 ring-1 ring-line lg:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Metas del mes
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">Meta al 100%</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{money2(c.meta100)}</p>
              <p className="mt-1 text-xs text-muted">
                {c.metaAsignada
                  ? c.metaNota || "Asignada por admin"
                  : "Estimada (letra × días) · falta cargar meta"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Meta al 95%</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{money2(c.meta95)}</p>
              <p className="mt-1 text-xs text-muted">Umbral operativo</p>
            </div>
          </div>
          <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
            Recaudo diario ({c.diasHabilesMes} días hábiles){" "}
            <span className="font-semibold tabular-nums text-ink">{money2(c.metaDiaria)}</span>
          </p>
        </div>

        <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Flota actual
          </p>
          <p className="mt-3 text-3xl font-bold tabular-nums text-ink">{c.flotaTotal}</p>
          <p className="text-sm text-muted">carros con contrato activo</p>
          <ul className="mt-4 space-y-2 border-t border-line pt-4">
            {c.flota.map((f) => (
              <li key={f.sigla} className="flex items-center justify-between text-sm">
                <span className="font-medium">{f.sigla}</span>
                <span className="tabular-nums text-muted">{f.carros}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <p className="text-xs text-muted">Recaudado a hoy</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{money2(c.recaudadoMtd)}</p>
          <p className="mt-1 text-sm text-muted">{pctTxt(c.pctRecaudado)} de la meta 100%</p>
        </div>
        <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <p className="text-xs text-muted">
            Recaudo ideal · {c.diasHabilesTranscurridos}/{c.diasHabilesMes} días hábiles
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{money2(c.idealMtd)}</p>
          <p className="mt-1 text-sm text-muted">{pctTxt(c.pctIdeal)} de la meta 100%</p>
        </div>
      </div>

      <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Diferencia vs ideal
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <GapRow
            label="Vs meta 100%"
            monto={c.gap100}
            pct={c.gap100Pct}
            malo={bajo100}
          />
          <GapRow
            label="Vs meta 95%"
            monto={c.gap95}
            pct={c.gap95Pct}
            malo={bajo95}
          />
        </div>
      </div>

      {c.cierres.length > 0 && (
        <div className="rounded-xl bg-surface p-5 ring-1 ring-line">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Cierres de referencia
          </p>
          <ul className="mt-4 divide-y divide-line">
            {c.cierres.map((x) => (
              <li key={x.etiqueta} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium capitalize">Cierre {x.etiqueta}</p>
                  <p className="text-xs text-muted">
                    {x.carros} carros
                    {x.metaAsignada ? "" : " · % vs estimación"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{money2(x.recaudado)}</p>
                  <p className="text-xs text-muted">
                    {x.pctMeta != null ? `${pctTxt(x.pctMeta)} de meta` : "—"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">
            El % de cierres pasados usa la letra diaria actual × días hábiles de ese mes (aprox.).
          </p>
        </div>
      )}
    </div>
  );
}

function GapRow({
  label,
  monto,
  pct,
  malo,
}: {
  label: string;
  monto: number;
  pct: number;
  malo: boolean;
}) {
  const signo = monto > 0.009 ? "+" : "";
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${malo ? "text-rojo" : "text-verde"}`}>
        {signo}
        {money2(monto)}{" "}
        <span className="text-sm font-medium">
          ({signo}
          {pctTxt(pct)})
        </span>
      </p>
      <p className="mt-0.5 text-xs text-muted">{malo ? "Por debajo" : "Por encima o al día"}</p>
    </div>
  );
}

function AgentRow({
  nombre,
  estado,
  nota,
}: {
  nombre: string;
  estado: "activo" | "activando";
  nota?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-5">
      <div>
        <p className="font-semibold">{nombre}</p>
        <p className="text-xs text-muted">{nota ?? "Módulo en preparación"}</p>
      </div>
      {estado === "activo" ? (
        <StatusChip tone="good">Activo</StatusChip>
      ) : (
        <StatusChip tone="neutral">Preparando</StatusChip>
      )}
    </div>
  );
}
