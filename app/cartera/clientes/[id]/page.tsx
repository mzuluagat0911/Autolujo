import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Money, StatusChip, EmptyState } from "@/components/kit";
import { createServerSupabase } from "@/lib/supabase/server";
import { etiquetaGenero } from "@/lib/cartera/tratamiento";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

export const dynamic = "force-dynamic";

type Cliente = {
  id: string; nombre: string; genero: string | null; cedula: string | null;
  telefono: string | null; whatsapp: string | null; score_financiero: number;
};
type Contrato = {
  id: string; estado: string; letra_diaria: number;
  vehiculo: { numero: string; empresa: { codigo: string; nombre: string } | null } | null;
};
type Pago = {
  id: string; fecha: string | null; pagado_at: string | null; monto: number;
  metodo: string | null; estado_conciliacion: string; numero_carro: string | null;
  referencia: string | null; origen: string | null;
};

function estadoTone(e: string): "good" | "warn" | "crit" | "neutral" {
  if (e === "conciliado") return "good";
  if (e === "pendiente" || e === "manual") return "warn";
  if (e === "rechazado") return "crit";
  return "neutral";
}
function estadoContratoTone(e: string): "good" | "warn" | "neutral" {
  if (e === "activo") return "good";
  if (e === "finalizado") return "neutral";
  return "warn"; // devuelto / abandonado / suspendido
}

export default async function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createServerSupabase();

  const { data: cliente } = await sb
    .from("clientes")
    .select("id, nombre, genero, cedula, telefono, whatsapp, score_financiero")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();
  const cli = cliente as Cliente;

  const { data: contratosData } = await sb
    .from("contratos")
    .select("id, estado, letra_diaria, vehiculo:vehiculos(numero, empresa:empresas(codigo, nombre))")
    .eq("cliente_id", id);
  const contratos = (contratosData ?? []) as unknown as Contrato[];
  const contratoIds = contratos.map((c) => c.id);

  // Saldo por contrato
  const saldoMap = new Map<string, number>();
  if (contratoIds.length > 0) {
    const { data: saldos } = await sb
      .from("vw_saldo_contrato").select("contrato_id, saldo_actual").in("contrato_id", contratoIds);
    for (const s of (saldos ?? []) as { contrato_id: string; saldo_actual: number | null }[]) {
      saldoMap.set(s.contrato_id, Number(s.saldo_actual ?? 0));
    }
  }

  // Histórico de pagos: por contrato del cliente o atados directo al cliente
  const filtro = contratoIds.length > 0
    ? `cliente_id.eq.${id},contrato_id.in.(${contratoIds.join(",")})`
    : `cliente_id.eq.${id}`;
  const { data: pagosData } = await sb
    .from("pagos")
    .select("id, fecha, pagado_at, monto, metodo, estado_conciliacion, numero_carro, referencia, origen")
    .or(filtro)
    .order("pagado_at", { ascending: false, nullsFirst: false })
    .limit(200);
  const pagos = (pagosData ?? []) as Pago[];

  const totalValidado = pagos
    .filter((p) => p.estado_conciliacion === "conciliado" || p.estado_conciliacion === "manual")
    .reduce((s, p) => s + Number(p.monto || 0), 0);

  return (
    <div className="mx-auto max-w-5xl py-10">
      <Link href="/cartera/clientes" className="text-xs text-muted hover:text-ink">← Clientes</Link>
      <PageHeader
        eyebrow="Cliente"
        title={cli.nombre}
        subtitle={[
          cli.genero ? etiquetaGenero(cli.genero) : null,
          cli.cedula ? `Cédula ${cli.cedula}` : null,
          cli.whatsapp ?? cli.telefono ?? null,
        ].filter(Boolean).join(" · ")}
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Pagado (validado)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink"><Money amount={totalValidado} /></p>
            <p className="mt-0.5 text-xs text-muted">{pagos.length} pago{pagos.length === 1 ? "" : "s"}</p>
          </div>
        }
      />

      {/* Contratos del cliente */}
      <h2 className="mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Contratos</h2>
      {contratos.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Sin contratos" hint="Cuando se asigne un carro, el contrato aparecerá aquí." />
        </div>
      ) : (
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {contratos.map((c) => (
          <div key={c.id} className="rounded-xl bg-surface p-4 ring-1 ring-line">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{etiquetaCarroUi(c.vehiculo?.empresa?.codigo ?? null, c.vehiculo?.numero ?? "—")}</span>
              <StatusChip tone={estadoContratoTone(c.estado)}>{c.estado}</StatusChip>
            </div>
            <p className="mt-1 text-xs text-muted">{c.vehiculo?.empresa?.nombre ?? "—"} · letra <Money amount={Number(c.letra_diaria)} /></p>
            <p className="mt-2 text-sm">Saldo: <span className="font-semibold tabular-nums"><Money amount={saldoMap.get(c.id) ?? 0} /></span></p>
          </div>
        ))}
      </div>
      )}

      {/* Histórico de pagos */}
      <h2 className="mt-10 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Histórico de pagos</h2>
      {pagos.length === 0 ? (
        <div className="mt-3"><EmptyState title="Sin pagos registrados" hint="Cuando el cliente pague, cada movimiento aparecerá aquí." /></div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => {
                const cuando = p.pagado_at ?? (p.fecha ? `${p.fecha}T00:00:00` : null);
                const fechaTxt = cuando
                  ? new Date(cuando).toLocaleString("es-PA", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                  : (p.fecha ?? "—");
                return (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3 tabular-nums text-muted">{fechaTxt}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums"><Money amount={Number(p.monto)} /></td>
                    <td className="px-4 py-3 text-muted">{p.metodo ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{p.numero_carro ?? "—"}</td>
                    <td className="px-4 py-3"><StatusChip tone={estadoTone(p.estado_conciliacion)}>{p.estado_conciliacion}</StatusChip></td>
                    <td className="px-4 py-3 text-xs text-muted">{p.origen ?? "—"}{p.referencia ? ` · ${p.referencia}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
