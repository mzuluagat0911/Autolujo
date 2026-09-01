import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, StatusChip, Money } from "@/components/kit";
import { resolverPago } from "./actions";
import { PagoManualForm } from "./pago-manual-form";

export const dynamic = "force-dynamic";

type Pago = {
  id: string;
  fecha: string | null;
  monto: number;
  banco: string | null;
  referencia: string | null;
  numero_carro: string | null;
  estado_conciliacion: string;
  comprobante_url: string | null;
  notas: string | null;
  created_at: string;
  signedUrl?: string | null;
};

const POR_CONCILIAR = ["pendiente", "manual"];

function estadoTone(e: string): "good" | "warn" | "crit" | "neutral" {
  if (e === "conciliado") return "good";
  if (e === "pendiente" || e === "manual") return "warn";
  if (e === "rechazado") return "crit";
  return "neutral";
}

async function getData() {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("pagos")
      .select("id, fecha, monto, banco, referencia, numero_carro, estado_conciliacion, comprobante_url, notas, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const pagos = (data as Pago[]) ?? [];
    for (const p of pagos) {
      if (p.comprobante_url) {
        const { data: s } = await sb.storage.from("comprobantes").createSignedUrl(p.comprobante_url, 3600);
        p.signedUrl = s?.signedUrl ?? null;
      }
    }
    return { pagos, error: null as string | null };
  } catch (e) {
    return { pagos: [] as Pago[], error: e instanceof Error ? e.message : "Error" };
  }
}

export default async function PagosPage() {
  const { pagos, error } = await getData();
  const porConciliar = pagos.filter((p) => POR_CONCILIAR.includes(p.estado_conciliacion));
  const resueltos = pagos.filter((p) => !POR_CONCILIAR.includes(p.estado_conciliacion));

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Cartera"
        title="Pagos por conciliar"
        subtitle="Comprobantes que llegan por WhatsApp. El pago de oficina y el extracto están en Conciliación."
      />

      {error && (
        <p className="mt-6 rounded-lg bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line">{error}</p>
      )}

      <div className="mt-6">
        <PagoManualForm />
      </div>

      <h2 className="mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        {porConciliar.length} por revisar
      </h2>

      <div className="mt-4 space-y-4">
        {porConciliar.map((p) => (
          <PagoCard key={p.id} p={p} accionable />
        ))}
        {porConciliar.length === 0 && !error && (
          <p className="rounded-lg bg-surface px-5 py-10 text-center text-sm font-light text-muted ring-1 ring-line">
            Nada por conciliar. Cuando entre un comprobante por WhatsApp, aparecerá aquí.
          </p>
        )}
      </div>

      {resueltos.length > 0 && (
        <>
          <h2 className="mt-12 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            Resueltos recientes
          </h2>
          <div className="mt-4 space-y-3 opacity-80">
            {resueltos.slice(0, 20).map((p) => (
              <PagoCard key={p.id} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PagoCard({ p, accionable }: { p: Pago; accionable?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface ring-1 ring-line">
      <div className="flex flex-col gap-4 p-5 sm:flex-row">
        {/* Comprobante */}
        {p.signedUrl ? (
          <a href={p.signedUrl} target="_blank" rel="noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.signedUrl} alt="Comprobante" className="h-28 w-28 rounded-lg object-cover ring-1 ring-line/60" />
          </a>
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-md bg-paper text-xs font-medium tracking-wide text-muted ring-1 ring-line">
            Sin imagen
          </div>
        )}

        {/* Datos leídos */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-lg font-semibold tabular-nums">
              <Money amount={p.monto} />
            </span>
            <StatusChip tone={estadoTone(p.estado_conciliacion)}>{p.estado_conciliacion}</StatusChip>
            {p.numero_carro ? (
              <StatusChip tone="neutral">Carro {p.numero_carro}</StatusChip>
            ) : (
              <StatusChip tone="warn">sin carro</StatusChip>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted sm:grid-cols-4">
            <span>Fecha: {p.fecha ?? "—"}</span>
            <span>Banco: {p.banco ?? "—"}</span>
            <span>Ref: {p.referencia ?? "—"}</span>
            <span>{new Date(p.created_at).toLocaleString("es-PA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {p.notas && <p className="mt-2 font-mono text-[11px] text-muted">{p.notas}</p>}

          {accionable && (
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={resolverPago}>
                <input type="hidden" name="pago_id" value={p.id} />
                <input type="hidden" name="accion" value="conciliar" />
                <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-surface transition hover:bg-black">
                  Conciliar
                </button>
              </form>
              <form action={resolverPago}>
                <input type="hidden" name="pago_id" value={p.id} />
                <input type="hidden" name="accion" value="rechazar" />
                <button className="rounded-md bg-surface px-4 py-2 text-sm font-medium text-crit ring-1 ring-crit/30 transition hover:bg-crit/5">
                  Rechazar
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
