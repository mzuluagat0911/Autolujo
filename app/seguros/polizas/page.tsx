import Link from "next/link";
import { PageHeader } from "@/components/kit";
import { hoyPanama } from "@/lib/cartera/fecha";
import { carrosParaCaso, firmar, listarEmpresas, listarPolizas, pathEmpresa } from "@/lib/seguros/datos";
import { ListaPolizas } from "./lista";

export const dynamic = "force-dynamic";

export default async function PolizasPage() {
  const hoy = hoyPanama();
  const [carros, polizas, empresas] = await Promise.all([carrosParaCaso(), listarPolizas(), listarEmpresas()]);
  const paths = [
    ...polizas.map((p) => p.path).filter((p): p is string => Boolean(p)),
    ...empresas.flatMap((e) => [pathEmpresa(e.id, "registro"), pathEmpresa(e.id, "representante")]),
  ];
  const urls = await firmar(paths);
  return (
    <div className="mx-auto max-w-5xl py-10">
      <p className="mb-4">
        <Link href="/seguros" className="text-sm text-muted hover:text-ink hover:underline">
          ← Choques
        </Link>
      </p>
      <PageHeader
        eyebrow="Seguros"
        title="Pólizas"
        subtitle="Cada carro renueva una vez al año. Si falta un mes para vencer, el aviso aparece en Choques."
      />
      <ListaPolizas carros={carros} polizas={polizas} empresas={empresas} urls={urls} hoy={hoy} />
    </div>
  );
}
