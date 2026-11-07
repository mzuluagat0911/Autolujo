import Link from "next/link";
import { PageHeader } from "@/components/kit";
import { firmar, listarEmpresas, pathEmpresa } from "@/lib/seguros/datos";
import { ListaPublicos } from "./lista";

export const dynamic = "force-dynamic";

export default async function RegistrosPublicosPage() {
  const empresas = await listarEmpresas();
  const urls = await firmar(empresas.map((e) => pathEmpresa(e.id, "registro")));
  return (
    <div className="mx-auto max-w-3xl py-10">
      <p className="mb-4">
        <Link href="/seguros" className="text-sm text-muted hover:text-ink hover:underline">
          ← Choques
        </Link>
      </p>
      <PageHeader
        eyebrow="Seguros"
        title="Registros públicos"
        subtitle="El registro público de cada empresa. Se actualiza aquí y entra en todos los paquetes."
      />
      <ListaPublicos empresas={empresas} urls={urls} />
    </div>
  );
}
