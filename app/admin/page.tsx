import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
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
  error: string | null;
};

async function getResumen(): Promise<Resumen> {
  try {
    const sb = createServerSupabase();
    const hoy = hoyPanama();
    const [clientes, contratos, vehiculos, pagosPend, cobrado, saldos] = await Promise.all([
      sb.from("clientes").select("*", { count: "exact", head: true }),
      sb.from("contratos").select("*", { count: "exact", head: true }),
      sb.from("vehiculos").select("*", { count: "exact", head: true }),
      sb
        .from("pagos")
        .select("*", { count: "exact", head: true })
        .in("estado_conciliacion", ["pendiente", "manual"]),
      sb.from("pagos").select("monto").eq("estado_conciliacion", "conciliado").eq("fecha", hoy),
      sb.from("vw_saldo_contrato").select("saldo_actual"),
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

  return (
    <div className="pb-20">
      <PageHeader
        eyebrow="Inversiones Auto Lujo Panamá"
        title="Resumen"
        subtitle={HOY}
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
              <Kpi label="Cobrado hoy" value={<Money amount={r.cobradoHoy} />} hint="Conciliado del día" />
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
