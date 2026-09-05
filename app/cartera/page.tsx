import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, fechaConDia } from "@/lib/cartera/fecha";
import { conversacionesEnEspera } from "@/lib/cartera/pipeline";
import { PageHeader, Kpi, Money } from "@/components/kit";

export const dynamic = "force-dynamic";

type Datos = {
  ok: boolean;
  contratosActivos: number;
  saldoTotal: number;
  cobradoHoy: number;
  alDia: number;
  sinPagoHoy: number;
  porRevisar: number;
  necesitaRespuesta: number;
  esperandoHace: number;
  error: string | null;
};

/** A partir de aquí, un chat escalado ya se está quedando sin respuesta. */
const MINUTOS_ESPERA = 120;

async function getDatos(): Promise<Datos> {
  const base: Datos = {
    ok: false, contratosActivos: 0, saldoTotal: 0, cobradoHoy: 0, alDia: 0,
    sinPagoHoy: 0, porRevisar: 0, necesitaRespuesta: 0, esperandoHace: 0, error: null,
  };
  try {
    const sb = createServerSupabase();
    const hoy = hoyPanama();
    const [cAct, saldos, pagosHoy, porRev, necesita, esperando] = await Promise.all([
      sb.from("contratos").select("*", { count: "exact", head: true }).eq("estado", "activo"),
      sb.from("vw_saldo_contrato").select("saldo_actual"),
      sb.from("pagos").select("contrato_id, monto").eq("fecha", hoy).in("estado_conciliacion", ["conciliado", "manual"]),
      sb.from("pagos").select("*", { count: "exact", head: true }).in("estado_conciliacion", ["pendiente", "manual"]),
      sb.from("conversaciones").select("*", { count: "exact", head: true }).eq("necesita_humano", true),
      conversacionesEnEspera(MINUTOS_ESPERA),
    ]);
    const err = cAct.error ?? saldos.error ?? pagosHoy.error ?? porRev.error ?? necesita.error;
    if (err) throw err;

    const contratosActivos = cAct.count ?? 0;
    const saldoTotal = (saldos.data ?? []).reduce((a, r: { saldo_actual: number | null }) => a + Number(r.saldo_actual ?? 0), 0);
    const cobradoHoy = (pagosHoy.data ?? []).reduce((a, r: { monto: number | null }) => a + Number(r.monto ?? 0), 0);
    const alDia = new Set((pagosHoy.data ?? []).map((r: { contrato_id: string | null }) => r.contrato_id)).size;

    return {
      ok: true, contratosActivos, saldoTotal, cobradoHoy, alDia,
      sinPagoHoy: Math.max(contratosActivos - alDia, 0),
      porRevisar: porRev.count ?? 0,
      necesitaRespuesta: necesita.count ?? 0,
      esperandoHace: esperando,
      error: null,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Error" };
  }
}

const HOY = fechaConDia(hoyPanama());

export default async function PanelCartera() {
  const d = await getDatos();

  return (
    <div className="mx-auto max-w-6xl py-10">
      <PageHeader eyebrow="Módulo · Cartera" title="Panel de cartera" subtitle={`Tu día de cobranza · ${HOY}`} />

      {d.error ? (
        <p className="mt-8 rounded-2xl bg-surface p-6 font-mono text-xs text-muted ring-1 ring-line/60">{d.error}</p>
      ) : (
        <div className="mt-8 space-y-10">
          {/* Resumen del módulo */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_2fr]">
            <Kpi size="hero" label="Saldo en cartera" value={<Money amount={d.saldoTotal} />} hint="Total por cobrar en la flota activa" />
            <div className="grid grid-cols-2 gap-4">
              <Kpi label="Cobrado hoy" value={<Money amount={d.cobradoHoy} />} hint="Conciliado del día" />
              <Kpi label="Contratos activos" value={d.contratosActivos} hint="Carros con arrendatario" />
            </div>
          </div>

          {/* Cubetas del día — el trabajo */}
          <div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">El día de hoy</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cubeta label="Al día" valor={d.alDia} tono="good" hint="Pagaron hoy" />
              <Cubeta label="Sin pago hoy" valor={d.sinPagoHoy} tono="warn" hint="Por cobrar / llamar" href="/cartera/por-llamar" />
              <Cubeta label="Por conciliar" valor={d.porRevisar} tono="crit" hint="Comprobantes a revisar" href="/cartera/pagos" />
              <Cubeta
                label="Necesitan respuesta"
                valor={d.necesitaRespuesta}
                tono={d.esperandoHace > 0 ? "crit" : "azul"}
                hint={d.esperandoHace > 0 ? `${d.esperandoHace} llevan +2 h esperando` : "Chats escalados"}
                href="/cartera/conversaciones"
              />
            </div>
          </div>

          {/* Accesos del módulo */}
          <div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">Herramientas</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Acceso href="/cartera/por-llamar" titulo="Por llamar" desc="Quién debe hoy y no ha pagado" />
              <Acceso href="/cartera/conversaciones" titulo="Conversaciones" desc="Los chats del agente con cada arrendatario" />
              <Acceso href="/cartera/pagos" titulo="Pagos por conciliar" desc="Comprobantes recibidos, por confirmar" />
              <Acceso href="/cartera/extractos" titulo="Conciliación" desc="Pago en oficina o extracto bancario por empresa" />
              <Acceso href="/cartera/vehiculos" titulo="Carros" desc="La flota por empresa" />
              <Acceso href="/cartera/clientes" titulo="Clientes" desc="Directorio de arrendatarios" />
              <Acceso href="/cartera/tarifario" titulo="Tarifario" desc="Letra diaria por modelo" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cubeta({ label, valor, tono, hint, href }: {
  label: string; valor: number; hint: string; href?: string;
  tono: "good" | "warn" | "crit" | "azul";
}) {
  const color =
    tono === "good" ? "text-verde"
    : tono === "crit" ? "text-rojo"
    : tono === "warn" ? "text-ambar"
    : "text-azul";
  const dot =
    tono === "good" ? "bg-verde"
    : tono === "crit" ? "bg-rojo"
    : tono === "warn" ? "bg-ambar"
    : "bg-azul";
  const inner = (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-line transition hover:ring-line-strong">
      <div className="flex items-center justify-between">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {href && <span className="text-xs text-muted">ver →</span>}
      </div>
      <p className={`mt-3 text-4xl font-bold tabular-nums ${color}`}>{valor}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Acceso({ href, titulo, desc }: { href: string; titulo: string; desc: string }) {
  return (
    <Link href={href} className="rounded-xl bg-surface p-4 ring-1 ring-line/60 transition hover:ring-line">
      <p className="font-medium">{titulo}</p>
      <p className="mt-1 text-xs text-muted">{desc}</p>
    </Link>
  );
}
