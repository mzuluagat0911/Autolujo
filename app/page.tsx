import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Band, Kpi, Money, StatusChip, EmptyState } from "@/components/kit";

export const dynamic = "force-dynamic";

type Resumen = {
  ok: boolean;
  clientes: number;
  contratos: number;
  vehiculos: number;
  pagosPend: number;
  saldoTotal: number;
  error: string | null;
};

async function getResumen(): Promise<Resumen> {
  try {
    const sb = createServerSupabase();
    const [clientes, contratos, vehiculos, pagosPend, saldos] = await Promise.all([
      sb.from("clientes").select("*", { count: "exact", head: true }),
      sb.from("contratos").select("*", { count: "exact", head: true }),
      sb.from("vehiculos").select("*", { count: "exact", head: true }),
      sb
        .from("pagos")
        .select("*", { count: "exact", head: true })
        .eq("estado_conciliacion", "pendiente"),
      sb.from("vw_saldo_contrato").select("saldo_actual"),
    ]);
    const firstErr =
      clientes.error ?? contratos.error ?? vehiculos.error ?? pagosPend.error ?? saldos.error;
    if (firstErr) throw firstErr;
    const saldoTotal = (saldos.data ?? []).reduce(
      (acc: number, r: { saldo_actual: number | null }) => acc + Number(r.saldo_actual ?? 0),
      0,
    );
    return {
      ok: true,
      clientes: clientes.count ?? 0,
      contratos: contratos.count ?? 0,
      vehiculos: vehiculos.count ?? 0,
      pagosPend: pagosPend.count ?? 0,
      saldoTotal,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      clientes: 0,
      contratos: 0,
      vehiculos: 0,
      pagosPend: 0,
      saldoTotal: 0,
      error: e instanceof Error ? e.message : "Error",
    };
  }
}

const HOY = new Intl.DateTimeFormat("es-PA", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(new Date());

export default async function ResumenPage() {
  const r = await getResumen();

  if (!r.ok) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <PageHeader eyebrow="Plataforma" title="Resumen" subtitle="El pulso de todo el negocio" />
        <div className="mt-8 rounded-2xl bg-surface p-8 ring-1 ring-line/60">
          <h2 className="font-serif text-lg font-semibold">No se pudo leer la base de datos</h2>
          <p className="mt-2 text-sm text-muted">
            Revisa que el schema esté aplicado en Supabase y las variables de entorno.
          </p>
          <p className="mt-4 rounded-lg bg-surface-2 p-3 font-mono text-xs text-muted">{r.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <PageHeader
        eyebrow="Plataforma"
        title="Resumen"
        subtitle={`El pulso de todo el negocio · ${HOY}`}
      />

      <div className="mt-10 space-y-12">
        {/* ---------------- CARTERA (héroe + secundarios) ---------------- */}
        <Band title="Cartera" status="active">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_2fr]">
            <Kpi
              size="hero"
              label="Saldo en cartera"
              value={<Money amount={r.saldoTotal} />}
              hint="Total por cobrar en toda la flota"
            />
            <div className="grid grid-cols-2 gap-4">
              <Kpi label="Cobrado hoy" value={<Money amount={0} />} hint="Conciliado del día" />
              <Kpi
                label="Pagos por conciliar"
                value={r.pagosPend}
                tone={r.pagosPend > 0 ? "warn" : "default"}
                hint="Comprobantes por revisar"
              />
              <Kpi label="Contratos activos" value={r.contratos} hint={`${r.vehiculos} vehículos`} />
              <Kpi label="Clientes" value={r.clientes} hint="En cartera" />
            </div>
          </div>
          <div className="mt-4">
            {r.pagosPend > 0 ? (
              <div className="rounded-xl bg-warn/5 px-5 py-4 text-sm ring-1 ring-warn/30">
                Tienes <b>{r.pagosPend}</b> pago(s) esperando conciliación.
              </div>
            ) : (
              <EmptyState
                title="Nada pendiente por conciliar"
                hint="Cuando un cliente envíe un comprobante por WhatsApp, aparecerá aquí para revisar."
              />
            )}
          </div>
        </Band>

        {/* ---------------- COMERCIAL ---------------- */}
        <Band title="Comercial y Atención" status="pronto">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Leads nuevos" value="" tone="pronto" />
            <Kpi label="Sin seguimiento" value="" tone="pronto" />
            <Kpi label="Citas agendadas" value="" tone="pronto" />
            <Kpi label="Conversión" value="" tone="pronto" />
          </div>
        </Band>

        {/* ---------------- OPERACIONES ---------------- */}
        <Band title="Operaciones" status="pronto">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Novedades abiertas" value="" tone="pronto" />
            <Kpi label="Flota activa" value="" tone="pronto" />
            <Kpi label="En taller" value="" tone="pronto" />
            <Kpi label="Mantenimientos por km" value="" tone="pronto" />
          </div>
        </Band>

        {/* ---------------- SEGUROS ---------------- */}
        <Band title="Seguros" status="pronto">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Reclamaciones activas" value="" tone="pronto" />
            <Kpi label="Audiencias próximas" value="" tone="pronto" />
            <Kpi label="Resoluciones por retirar" value="" tone="pronto" />
            <Kpi label="Aseguradoras" value="" tone="pronto" />
          </div>
        </Band>

        {/* ---------------- STACK DE AGENTES ---------------- */}
        <Band title="Stack de agentes" status="active">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AgentCard nombre="Cartera" estado="activo" nota="Recibe y responde por WhatsApp" />
            <AgentCard nombre="Comercial y Atención" estado="activando" />
            <AgentCard nombre="Operaciones" estado="activando" />
            <AgentCard nombre="Seguros" estado="activando" />
          </div>
        </Band>
      </div>
    </div>
  );
}

function AgentCard({
  nombre,
  estado,
  nota,
}: {
  nombre: string;
  estado: "activo" | "activando";
  nota?: string;
}) {
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line/60 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{nombre}</span>
        {estado === "activo" ? (
          <StatusChip tone="good">Activo</StatusChip>
        ) : (
          <StatusChip tone="gold">Activando</StatusChip>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">{nota ?? "Módulo en preparación"}</p>
    </div>
  );
}
