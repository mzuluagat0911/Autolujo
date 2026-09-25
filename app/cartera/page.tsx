import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, fechaConDia } from "@/lib/cartera/fecha";
import { conversacionesEnEspera } from "@/lib/cartera/pipeline";
import { PageHeader, Kpi, Money, StatusChip } from "@/components/kit";
import { lineaSalidaHoy, salidasDelDia } from "@/lib/cartera/salidas-aplicar";
import { etiquetaAlcance, leerAlcance } from "@/lib/cartera/alcance";
import { estadosCuentaPanel } from "@/lib/cartera/estado-cuenta-cache";
import { esAdelantado, type EstadoCuenta } from "@/lib/cartera/estado-cuenta";
import { cobroHoyDe } from "@/lib/cartera/cobro-hoy";
import {
  acuerdosSaldoPorContrato,
  cargosExtraPorContrato,
} from "@/lib/cartera/extracto-desglose";

export const dynamic = "force-dynamic";

type Datos = {
  ok: boolean;
  contratosActivos: number;
  /** Deuda viva del ledger (referencia). */
  saldoLibro: number;
  /** Suma de totalCobrarHoy del extracto (misma cifra del WhatsApp). */
  aCobrarHoy: number;
  /** Pagos conciliados / manuales de hoy. */
  cobradoHoy: number;
  /** Comprobantes pendientes: cantidad y monto. */
  porConciliarN: number;
  porConciliarMonto: number;
  /** Contratos con extracto en $0 (cubrieron hoy o adelantados sin cobro). */
  cubiertos: number;
  /** Contratos que aún deben el extracto de hoy. */
  sinCubrirN: number;
  sinCubrirMonto: number;
  /** Adelantados (letra por delante). */
  adelantados: number;
  necesitaRespuesta: number;
  esperandoHace: number;
  error: string | null;
};

/** A partir de aquí, un chat escalado ya se está quedando sin respuesta. */
const MINUTOS_ESPERA = 120;

async function idsContratosAlcance(
  empresaIds: string[] | null,
): Promise<string[] | null> {
  if (!empresaIds) return null;
  if (empresaIds.length === 0) return [];
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("contratos")
    .select("id, vehiculo:vehiculos!inner(empresa_id)")
    .eq("estado", "activo")
    .in("vehiculo.empresa_id", empresaIds);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

function enAlcance(e: EstadoCuenta, ids: string[] | null): boolean {
  if (!ids) return true;
  return ids.includes(e.contratoId);
}

async function getDatos(contratoIds: string[] | null): Promise<Datos> {
  const base: Datos = {
    ok: false,
    contratosActivos: 0,
    saldoLibro: 0,
    aCobrarHoy: 0,
    cobradoHoy: 0,
    porConciliarN: 0,
    porConciliarMonto: 0,
    cubiertos: 0,
    sinCubrirN: 0,
    sinCubrirMonto: 0,
    adelantados: 0,
    necesitaRespuesta: 0,
    esperandoHace: 0,
    error: null,
  };
  try {
    const sb = createServerSupabase();
    const hoy = hoyPanama();

    if (contratoIds && contratoIds.length === 0) {
      return { ...base, ok: true };
    }

    let pagosHoyQ = sb
      .from("pagos")
      .select("contrato_id, monto")
      .eq("fecha", hoy)
      .in("estado_conciliacion", ["conciliado", "manual"]);
    let porRevQ = sb
      .from("pagos")
      .select("monto")
      .eq("estado_conciliacion", "pendiente");

    if (contratoIds) {
      pagosHoyQ = pagosHoyQ.in("contrato_id", contratoIds);
      porRevQ = porRevQ.in("contrato_id", contratoIds);
    }

    const [pagosHoy, porRev, necesita, esperando, estados] = await Promise.all([
      pagosHoyQ,
      porRevQ,
      sb.from("conversaciones").select("*", { count: "exact", head: true }).eq("necesita_humano", true),
      conversacionesEnEspera(MINUTOS_ESPERA),
      estadosCuentaPanel(),
    ]);
    const err = pagosHoy.error ?? porRev.error ?? necesita.error;
    if (err) throw err;

    const vivos = estados.filter((e) => enAlcance(e, contratoIds));
    const ids = vivos.map((e) => e.contratoId);
    const [acuerdoMap, extrasMap] = await Promise.all([
      acuerdosSaldoPorContrato(ids),
      cargosExtraPorContrato(ids),
    ]);

    let aCobrarHoy = 0;
    let cubiertos = 0;
    let sinCubrirN = 0;
    let sinCubrirMonto = 0;
    let adelantados = 0;
    let saldoLibro = 0;

    for (const e of vivos) {
      saldoLibro += Math.max(Number(e.saldoVista) || 0, 0);
      if (esAdelantado(e)) adelantados += 1;
      const cobro = cobroHoyDe(e, {
        acuerdoSaldo: acuerdoMap.get(e.contratoId) ?? 0,
        extras: extrasMap.get(e.contratoId) ?? [],
      });
      const t = cobro.totalCobrarHoy;
      if (t > 0.009) {
        aCobrarHoy += t;
        sinCubrirN += 1;
        sinCubrirMonto += t;
      } else {
        cubiertos += 1;
      }
    }

    const cobradoHoy = (pagosHoy.data ?? []).reduce(
      (a, r: { monto: number | null }) => a + Number(r.monto ?? 0),
      0,
    );
    const porConciliarMonto = (porRev.data ?? []).reduce(
      (a, r: { monto: number | null }) => a + Number(r.monto ?? 0),
      0,
    );

    return {
      ok: true,
      contratosActivos: vivos.length,
      saldoLibro: Math.round(saldoLibro * 100) / 100,
      aCobrarHoy: Math.round(aCobrarHoy * 100) / 100,
      cobradoHoy: Math.round(cobradoHoy * 100) / 100,
      porConciliarN: porRev.data?.length ?? 0,
      porConciliarMonto: Math.round(porConciliarMonto * 100) / 100,
      cubiertos,
      sinCubrirN,
      sinCubrirMonto: Math.round(sinCubrirMonto * 100) / 100,
      adelantados,
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
  const alcance = await leerAlcance();
  const contratoIds = await idsContratosAlcance(alcance.empresaIds);
  const [d, salidasHoy] = await Promise.all([getDatos(contratoIds), salidasDelDia(hoyPanama())]);
  const etiqueta = etiquetaAlcance(alcance.codigos);
  const cobertura =
    d.contratosActivos > 0
      ? Math.round((d.cubiertos / d.contratosActivos) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-6xl py-10">
      <PageHeader
        eyebrow="Módulo · Cartera"
        title="Panel de cartera"
        subtitle={`Tu día de cobranza · ${HOY}`}
      />

      {etiqueta && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusChip tone="warn">Alcance · {etiqueta}</StatusChip>
          <Link
            href="/admin/alcance"
            className="text-xs font-medium text-muted underline-offset-2 hover:underline"
          >
            Cambiar
          </Link>
        </div>
      )}

      {d.error ? (
        <p className="mt-8 rounded-2xl bg-surface p-6 font-mono text-xs text-muted ring-1 ring-line/60">
          {d.error}
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Hoy</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="A cobrar hoy"
                value={<Money amount={d.aCobrarHoy} />}
                hint="Suma del extracto (WhatsApp)"
                tone={d.aCobrarHoy > 0.009 ? "crit" : "good"}
              />
              <Kpi
                label="Cobrado hoy"
                value={<Money amount={d.cobradoHoy} />}
                hint="Conciliado / oficina"
                tone="good"
              />
              <Kpi
                label="Por conciliar"
                value={<Money amount={d.porConciliarMonto} />}
                hint={
                  d.porConciliarN > 0
                    ? `${d.porConciliarN} comprobante${d.porConciliarN === 1 ? "" : "s"} pendiente${d.porConciliarN === 1 ? "" : "s"}`
                    : "Bandeja limpia"
                }
                tone={d.porConciliarMonto > 0.009 ? "warn" : "default"}
              />
              <Kpi
                label="Sin cubrir"
                value={<Money amount={d.sinCubrirMonto} />}
                hint={
                  d.sinCubrirN > 0
                    ? `${d.sinCubrirN} carro${d.sinCubrirN === 1 ? "" : "s"} con extracto abierto`
                    : "Todos cubiertos"
                }
                tone={d.sinCubrirMonto > 0.009 ? "crit" : "good"}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi
              label="Contratos activos"
              value={d.contratosActivos}
              hint={etiqueta ? `En alcance · ${etiqueta}` : "Carros con arrendatario"}
            />
              <Kpi
                label="Saldo libro"
                value={<Money amount={d.saldoLibro} />}
                hint="Deuda viva en cuenta (cargos − pagos)"
              />
            <Kpi
              label="Cobertura del día"
              value={`${cobertura}%`}
              hint={`${d.cubiertos} de ${d.contratosActivos} con extracto en $0`}
              tone={cobertura >= 70 ? "good" : cobertura >= 40 ? "warn" : "crit"}
            />
          </div>

          {salidasHoy.length > 0 && (
            <div className="rounded-xl bg-ambar-wash px-5 py-4 ring-1 ring-ambar/25">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ambar">
                Salidas de hoy · {salidasHoy.length}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {salidasHoy.map((s) => (
                  <li key={s.id}>
                    <Link href="/cartera/vehiculos" className="hover:underline">
                      {lineaSalidaHoy(s)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">El día de hoy</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cubeta
                label="Cubiertos"
                valor={d.cubiertos}
                tono="good"
                hint="Extracto en $0 (pagaron o adelanto)"
              />
              <Cubeta
                label="Sin cubrir"
                valor={d.sinCubrirN}
                tono="warn"
                hint="Aún deben el extracto de hoy"
                href="/cartera/por-llamar"
              />
              <Cubeta
                label="Comprobantes"
                valor={d.porConciliarN}
                tono="crit"
                hint={
                  d.porConciliarMonto > 0.009
                    ? `USD ${Math.round(d.porConciliarMonto).toLocaleString("es-PA")} por conciliar`
                    : "Bandeja WA / alertas"
                }
                href="/cartera/pagos"
              />
              <Cubeta
                label="Necesitan respuesta"
                valor={d.necesitaRespuesta}
                tono={d.esperandoHace > 0 ? "crit" : "azul"}
                hint={
                  d.esperandoHace > 0
                    ? `${d.esperandoHace} llevan +2 h esperando`
                    : "Chats escalados"
                }
                href="/cartera/conversaciones"
              />
            </div>
            {d.adelantados > 0 && (
              <p className="mt-3 text-xs text-muted">
                {d.adelantados} carro{d.adelantados === 1 ? "" : "s"} con pago adelantado (letra por delante).
              </p>
            )}
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Herramientas</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Acceso href="/cartera/por-llamar" titulo="Por llamar" desc="Quién debe hoy y no ha pagado" />
              <Acceso href="/cartera/conversaciones" titulo="Conversaciones" desc="Los chats del agente con cada arrendatario" />
              <Acceso href="/cartera/pagos" titulo="Comprobantes" desc="Bandeja WhatsApp y alertas (antes del extracto)" />
              <Acceso href="/cartera/extractos" titulo="Conciliación" desc="Oficina, extracto bancario y cruce exacto" />
              <Acceso href="/cartera/vehiculos" titulo="Carros" desc="La flota por empresa" />
              <Acceso href="/cartera/rastreo" titulo="Rastreo" desc="Dónde está cada carro ahora (Diacor)" />
              <Acceso href="/cartera/clientes" titulo="Clientes" desc="Directorio de arrendatarios" />
              <Acceso href="/cartera/tarifario" titulo="Tarifario" desc="Letra diaria por modelo" />
              <Acceso
                href="/cartera/cobros-taller"
                titulo="Cobros de taller"
                desc="Chapistería / novedades: ítems y montos a cargar al contrato"
              />
              <Acceso href="/operaciones/licencias" titulo="Licencias" desc="Semáforo por vencimiento de licencia" />
              <Acceso href="/operaciones/mantenimiento" titulo="Mantenimiento" desc="Carros por km (FULL cada 6.000)" />
              <Acceso href="/operaciones/placas" titulo="Placas y revisado" desc="Vencimientos del revisado" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cubeta({
  label,
  valor,
  tono,
  hint,
  href,
}: {
  label: string;
  valor: number;
  hint: string;
  href?: string;
  tono: "good" | "warn" | "crit" | "azul";
}) {
  const color =
    tono === "good"
      ? "text-verde"
      : tono === "crit"
        ? "text-rojo"
        : tono === "warn"
          ? "text-ambar"
          : "text-azul";
  const dot =
    tono === "good"
      ? "bg-verde"
      : tono === "crit"
        ? "bg-rojo"
        : tono === "warn"
          ? "bg-ambar"
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
