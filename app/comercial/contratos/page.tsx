import Link from "next/link";
import { EmptyState, PageHeader, PageShell, StatusChip } from "@/components/kit";
import { etiquetaSucursal } from "@/lib/cartera/sucursal";
import { listarSolicitudesContrato } from "@/lib/cartera/solicitudes-contrato";

export const dynamic = "force-dynamic";

function money(n: number | null) {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("es-PA")}`;
}

function fechaCorta(iso: string | null) {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

export default async function ContratosAprobadosComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const sp = await searchParams;
  const { filas, error } = await listarSolicitudesContrato("aprobada");

  return (
    <PageShell width="list">
      <PageHeader
        eyebrow="Comercial"
        title="Contratos aprobados"
        subtitle="Cuando cartera aprueba la solicitud, aparece acá para imprimir o descargar el contrato."
      />

      {sp.aviso && (
        <p className="mt-4 rounded-lg bg-ambar-wash px-4 py-3 text-sm text-ink ring-1 ring-ambar/40">
          {sp.aviso}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl bg-surface p-5 text-sm text-rojo ring-1 ring-line">{error}</p>
      )}

      {filas.length === 0 && !error ? (
        <div className="mt-8">
          <EmptyState
            title="Nada para imprimir"
            hint="Cuando cartera apruebe una solicitud, el contrato queda listo acá."
          />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Letra</th>
                <th className="px-4 py-3 font-medium">Sucursal</th>
                <th className="px-4 py-3 font-medium">Aprobado</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const puedeImprimir = !!(f.clienteId && f.contratoId);
                return (
                  <tr key={f.id} className="border-t border-line hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{f.nombre}</p>
                      <p className="text-xs text-muted">{f.whatsapp || f.telefono || "Sin celular"}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {[f.empresaCodigo, f.carroNumero].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{money(f.letraDiaria)}</td>
                    <td className="px-4 py-3">{etiquetaSucursal(f.sucursal) || "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      <p>{fechaCorta(f.aprobadoAt)}</p>
                      {f.aprobadorNombre ? (
                        <p className="text-xs">{f.aprobadorNombre}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip tone="good">Aprobada</StatusChip>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {puedeImprimir ? (
                        <Link
                          href={`/comercial/contratos/${f.clienteId}/${f.contratoId}/ver`}
                          className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-black"
                        >
                          Imprimir
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">Sin contrato enlazado</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
