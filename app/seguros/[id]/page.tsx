import Link from "next/link";
import { notFound } from "next/navigation";
import { hoyPanama } from "@/lib/cartera/fecha";
import { clienteDelCaso, firmar, leerCaso, pathCliente, registroDeVehiculo } from "@/lib/seguros/datos";
import { FichaCaso } from "./ficha";

export const dynamic = "force-dynamic";

export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fila = await leerCaso(id);
  if (!fila) notFound();
  const [registro, cliente] = await Promise.all([registroDeVehiculo(fila.vehiculoId), clienteDelCaso(fila)]);
  const copiasCliente = cliente ? [pathCliente(cliente.id, "cedula"), pathCliente(cliente.id, "licencia")] : [];
  const urls = await firmar([...fila.caso.documentos.map((d) => d.path), ...copiasCliente]);
  return (
    <div className="mx-auto max-w-4xl py-10">
      <p className="mb-6">
        <Link href="/seguros" className="text-sm text-muted hover:text-ink hover:underline">
          ← Choques
        </Link>
      </p>
      <FichaCaso fila={fila} urls={urls} hoy={hoyPanama()} registro={registro} cliente={cliente} />
    </div>
  );
}
