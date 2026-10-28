import Link from "next/link";
import { notFound } from "next/navigation";
import { hoyPanama } from "@/lib/cartera/fecha";
import {
  clienteDelCaso,
  empresaDeVehiculo,
  firmar,
  leerCaso,
  pathCliente,
  pathEmpresa,
  registroDeVehiculo,
  registroTieneDatos,
} from "@/lib/seguros/datos";
import type { DocTipo } from "@/lib/seguros/modelo";
import { armarPapeles, faltantesPaquete } from "@/lib/seguros/portada";
import { FichaCaso } from "./ficha";

export const dynamic = "force-dynamic";

export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fila = await leerCaso(id);
  if (!fila) notFound();
  const [registro, cliente, empresa] = await Promise.all([
    registroDeVehiculo(fila.vehiculoId),
    clienteDelCaso(fila),
    empresaDeVehiculo(fila.vehiculoId),
  ]);
  const copiasCliente = cliente ? [pathCliente(cliente.id, "cedula"), pathCliente(cliente.id, "licencia")] : [];
  const deEmpresa = empresa ? [pathEmpresa(empresa.id, "representante"), pathEmpresa(empresa.id, "registro")] : [];
  const urls = await firmar([...fila.caso.documentos.map((d) => d.path), ...copiasCliente, ...deEmpresa]);
  const hay = (tipo: DocTipo) => fila.caso.documentos.some((d) => d.tipo === tipo && urls[d.path]);
  const papeles = armarPapeles({
    caso: fila.caso,
    tiene: hay,
    copiaCliente: copiasCliente.some((p) => urls[p]),
    representante: Boolean(empresa && urls[pathEmpresa(empresa.id, "representante")]),
    registroPublico: Boolean(empresa && urls[pathEmpresa(empresa.id, "registro")]),
    registroVehiculo: registroTieneDatos(registro),
  });
  return (
    <div className="mx-auto max-w-4xl py-10">
      <p className="mb-6">
        <Link href="/seguros" className="text-sm text-muted hover:text-ink hover:underline">
          ← Choques
        </Link>
      </p>
      <FichaCaso
        fila={fila}
        urls={urls}
        hoy={hoyPanama()}
        registro={registro}
        cliente={cliente}
        faltan={faltantesPaquete(papeles, fila.caso.via)}
      />
    </div>
  );
}
