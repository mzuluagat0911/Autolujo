import { PageHeader } from "@/components/kit";
import { EsqueletoEstados } from "./esqueleto";

export default function CargandoEstados() {
  return (
    <div className="mx-auto max-w-6xl py-10">
      <PageHeader
        eyebrow="Cartera"
        title="Estado de cuenta del día"
        subtitle="Lo que debe pagar hoy cada carro. Clic en una fila para ver el detalle completo."
      />
      <EsqueletoEstados />
    </div>
  );
}
