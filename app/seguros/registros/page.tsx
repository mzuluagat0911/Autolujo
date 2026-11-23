import Link from "next/link";
import { PageHeader } from "@/components/kit";
import { carrosParaCaso, firmar, listarCasos, pathVehiculo } from "@/lib/seguros/datos";
import { ListaRegistros, type PagoChoque } from "./lista";

export const dynamic = "force-dynamic";

export default async function RegistrosPage() {
  const [carros, casos] = await Promise.all([carrosParaCaso(), listarCasos()]);
  const urls = await firmar(carros.map((c) => pathVehiculo(c.id, "registro")));
  const pagos: PagoChoque[] = casos
    .filter((c) => c.caso.seccion === "pagado" && c.caso.fechaPago)
    .map((c) => ({
      id: c.id,
      vehiculoId: c.vehiculoId,
      cliente: c.caso.clienteNombre,
      fechaPago: c.caso.fechaPago,
      fechaChoque: c.fecha,
      monto: c.caso.montoFiniquito,
    }));

  return (
    <div className="mx-auto max-w-5xl py-10">
      <p className="mb-4">
        <Link href="/seguros" className="text-sm text-muted hover:text-ink hover:underline">
          ← Choques
        </Link>
      </p>
      <PageHeader
        eyebrow="Seguros"
        title="Registros vehiculares"
        subtitle="Vea o imprima el registro de cada carro. Si hubo choque pagado, abra la lista de pagos."
      />
      <ListaRegistros carros={carros} urls={urls} pagos={pagos} />
    </div>
  );
}
