import Link from "next/link";
import { PageHeader } from "@/components/kit";
import { hoyPanama } from "@/lib/cartera/fecha";
import { carrosParaCaso } from "@/lib/seguros/datos";
import { AltaChoque } from "./alta";

export const dynamic = "force-dynamic";

export default async function NuevoChoquePage() {
  const carros = await carrosParaCaso();
  return (
    <div className="mx-auto max-w-3xl py-10">
      <p className="mb-4">
        <Link href="/seguros" className="text-sm text-muted hover:text-ink hover:underline">
          ← Choques
        </Link>
      </p>
      <PageHeader
        eyebrow="Seguros"
        title="Registrar choque"
        subtitle="Elegí el carro y si se resuelve con el seguro o con tránsito. Después se cargan las fotos y los papeles."
      />
      <AltaChoque carros={carros} hoy={hoyPanama()} />
    </div>
  );
}
