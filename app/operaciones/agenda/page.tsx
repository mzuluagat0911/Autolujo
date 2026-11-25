import Link from "next/link";
import { PageHeader, PageShell } from "@/components/kit";
import { hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import { carrosParaAgenda, listarCitasTaller } from "@/lib/operaciones/agenda";
import { AgendaVista } from "./vista";

export const dynamic = "force-dynamic";

export default async function AgendaTallerPage() {
  const hoy = hoyPanama();
  const [{ filas, error }, carros] = await Promise.all([
    listarCitasTaller({ desde: sumarDias(hoy, -7), hasta: sumarDias(hoy, 21), estado: "todas" }),
    carrosParaAgenda(),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Operaciones"
        title="Agenda de taller"
        subtitle="Néstor confirma si el carro llegó, deja comentarios y al cerrar la cita se ancla cuándo vuelve (revisión / FULL)."
        action={
          <Link
            href="/operaciones/conversaciones"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
          >
            Conversaciones
          </Link>
        }
      />
      <AgendaVista iniciales={filas} carros={carros} fechaHoy={hoy} errorInicial={error} />
    </PageShell>
  );
}
