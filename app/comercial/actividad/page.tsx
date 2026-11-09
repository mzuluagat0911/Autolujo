import Link from "next/link";
import { EmptyState, PageHeader, PageShell } from "@/components/kit";
import { actividadComercial } from "@/lib/comercial/actividad";

export const dynamic = "force-dynamic";

export default async function ActividadComercialPage() {
  const { asesores, error } = await actividadComercial();
  const conMovimiento = asesores.filter((a) => a.enCurso.length > 0 || a.hechos.length > 0);
  return (
    <PageShell width="list">
      <PageHeader
        eyebrow="Comercial"
        title="Actividad"
        subtitle="En qué está cada comercial y qué hizo en los últimos 7 días."
        action={
          <Link
            href="/comercial"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Chats
          </Link>
        }
      />
      {error && <p className="mt-4 text-sm text-rojo">{error}</p>}
      {conMovimiento.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Todavía no hay actividad"
            hint="Cuando tomen un chat, escriban, anoten una llamada o agenden, queda aquí."
          />
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {conMovimiento.map((a) => (
            <section key={a.id} className="rounded-xl bg-surface ring-1 ring-line">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold">{a.nombre}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {a.enCurso.length} {a.enCurso.length === 1 ? "chat abierto" : "chats abiertos"}
                </p>
              </div>
              <div className="grid gap-0 lg:grid-cols-2">
                <div className="border-b border-line p-4 lg:border-r lg:border-b-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">En qué está</p>
                  {a.enCurso.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">Sin chats asignados.</p>
                  ) : (
                    <ul className="mt-2">
                      {a.enCurso.map((c) => (
                        <li key={c.id} className="border-b border-line py-3 last:border-0">
                          <Link href={`/comercial?chat=${c.id}`} className="text-sm font-medium hover:underline">
                            {c.nombre}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted">
                            {c.etapa}
                            {c.cuando ? ` · ${cuando(c.cuando)}` : ""}
                          </p>
                          {c.nota && <p className="mt-1 text-xs leading-relaxed text-ink">{c.nota}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Qué hizo</p>
                  {a.hechos.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">Sin movimientos en 7 días.</p>
                  ) : (
                    <ul className="mt-2">
                      {a.hechos.map((h) => (
                        <li key={h.id} className="border-b border-line py-3 last:border-0">
                          <p className="text-xs text-muted">{cuando(h.cuando)}</p>
                          <p className="mt-0.5 text-sm">
                            <Link href={`/comercial?chat=${h.chatId}`} className="font-medium hover:underline">
                              {h.lead}
                            </Link>
                            <span className="text-muted"> · {h.texto}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function cuando(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(fecha);
}
