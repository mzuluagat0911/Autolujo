import Link from "next/link";
import { PageHeader, PageShell } from "@/components/kit";
import { actividadComercial } from "@/lib/comercial/actividad";
import { ActividadPanel } from "./panel";

export const dynamic = "force-dynamic";

export default async function ActividadComercialPage() {
  const { personas, abiertos, movimientos, error } = await actividadComercial();
  return (
    <PageShell width="list">
      <PageHeader
        eyebrow="Comercial"
        title="Actividad"
        subtitle="Qué hizo cada persona. Filtra por día, tipo o nombre."
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
      <ActividadPanel personas={personas} abiertos={abiertos} movimientos={movimientos} />
    </PageShell>
  );
}
