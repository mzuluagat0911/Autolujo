import Link from "next/link";
import { notFound } from "next/navigation";
import { hoyPanama } from "@/lib/cartera/fecha";
import { firmar, leerCaso, registroDeVehiculo } from "@/lib/seguros/datos";
import { FichaCaso } from "./ficha";

export const dynamic = "force-dynamic";

export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fila = await leerCaso(id);
  if (!fila) notFound();
  const [urls, registro] = await Promise.all([
    firmar(fila.caso.documentos.map((d) => d.path)),
    registroDeVehiculo(fila.vehiculoId),
  ]);
  return (
    <div className="mx-auto max-w-4xl py-10">
      <p className="mb-6">
        <Link href="/seguros" className="text-sm text-muted hover:text-ink hover:underline">
          ← Choques
        </Link>
      </p>
      <FichaCaso fila={fila} urls={urls} hoy={hoyPanama()} registro={registro} />
    </div>
  );
}
