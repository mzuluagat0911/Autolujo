import Link from "next/link";
import { EmptyState, PageHeader, PageShell, StatusChip } from "@/components/kit";
import { etiquetaSucursal } from "@/lib/cartera/sucursal";
import { listarSolicitudesContrato } from "@/lib/cartera/solicitudes-contrato";

export const dynamic = "force-dynamic";

function money(n: number | null) {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("es-PA")}`;
}

function chipEstado(estado: string) {
  if (estado === "pendiente") return <StatusChip tone="warn">Pendiente</StatusChip>;
  if (estado === "aprobada") return <StatusChip tone="good">Aprobada</StatusChip>;
  if (estado === "rechazada") return <StatusChip tone="crit">Rechazada</StatusChip>;
  return <StatusChip tone="neutral">Cancelada</StatusChip>;
}

const VISTAS = [
  { id: "pendiente", label: "Pendientes", href: "/cartera/aprobaciones" },
  { id: "cerradas", label: "Cerradas", href: "/cartera/aprobaciones?vista=cerradas" },
  { id: "todas", label: "Todas", href: "/cartera/aprobaciones?vista=todas" },
] as const;

export default async function AprobacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; aviso?: string }>;
}) {
  const sp = await searchParams;
  const vista = sp.vista === "todas" || sp.vista === "cerradas" ? sp.vista : "pendiente";
  const { filas, error } = await listarSolicitudesContrato(vista);

  return (
    <PageShell width="list">
      <PageHeader
        eyebrow="Cartera"
        title="Aprobaciones de contrato"
        subtitle="Solicitudes que manda comercial. Acá se revisan, se ajustan si hace falta y se aprueban: recién entonces se crea el cliente y el contrato."
      />

      {sp.aviso && (
        <p className="mt-4 rounded-lg bg-ambar-wash px-4 py-3 text-sm text-ink ring-1 ring-ambar/40">
          {sp.aviso}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl bg-surface p-5 text-sm text-rojo ring-1 ring-line">{error}</p>
      )}

      <div className="mt-6 flex flex-wrap gap-1.5 rounded-xl bg-surface p-3 ring-1 ring-line">
        {VISTAS.map((v) => (
          <Link
            key={v.id}
            href={v.href}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              vista === v.id
                ? "bg-ink font-medium text-white"
                : "bg-paper text-muted ring-1 ring-line hover:text-ink"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {filas.length === 0 && !error ? (
        <div className="mt-8">
          <EmptyState
            title={vista === "pendiente" ? "Nada pendiente" : "Sin solicitudes"}
            hint={
              vista === "pendiente"
                ? "Cuando comercial envíe una solicitud, aparece acá."
                : "Todavía no hay solicitudes en esta vista."
            }
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
                <th className="px-4 py-3 font-medium">Quién pide</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
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
                  <td className="px-4 py-3 text-muted">{f.solicitanteNombre || "—"}</td>
                  <td className="px-4 py-3">{chipEstado(f.estado)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/cartera/aprobaciones/${f.id}`}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
                    >
                      {f.estado === "pendiente" ? "Revisar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
