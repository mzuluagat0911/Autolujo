import { PageHeader, PageShell } from "@/components/kit";
import { hoyPanama } from "@/lib/cartera/fecha";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { AltaContratoForm } from "@/app/cartera/clientes/alta-contrato";
import { createClienteConContrato, listarCarrosLibres } from "@/app/cartera/clientes/actions";

export const dynamic = "force-dynamic";

export default async function ContratoComercialPage() {
  const [sesion, carros] = await Promise.all([sesionEquipo(), listarCarrosLibres()]);
  const nombre = (sesion?.nombre ?? "").toLowerCase();
  const puedeCobrar = !!sesion && (
    sesion.modulos.includes("cartera")
    || nombre.includes("claudia")
    || nombre.includes("marcela")
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Comercial"
        title="Nuevo contrato"
        subtitle={puedeCobrar
          ? "Creás el cliente, el contrato y el pago de hoy."
          : "Creás el cliente y el contrato. El pago de hoy lo registran Claudia o Marcela."}
      />
      <div className="mt-6">
        <AltaContratoForm
          carros={carros}
          fechaHoy={hoyPanama()}
          action={createClienteConContrato}
          puedeCobrar={puedeCobrar}
        />
      </div>
    </PageShell>
  );
}
