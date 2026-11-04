import { PageHeader } from "@/components/kit";
import { carrosParaCaso, firmar, pathVehiculo } from "@/lib/seguros/datos";
import { ListaRegistros } from "./lista";

export const dynamic = "force-dynamic";

export default async function RegistrosPage() {
  const carros = await carrosParaCaso();
  const urls = await firmar(carros.map((c) => pathVehiculo(c.id, "registro")));
  return (
    <div className="mx-auto max-w-5xl py-10">
      <PageHeader
        eyebrow="Seguros"
        title="Registros vehiculares"
        subtitle="El registro de cada carro, aparte del paquete del choque. Desde aquí se abre o se cambia."
      />
      <ListaRegistros carros={carros} urls={urls} />
    </div>
  );
}
