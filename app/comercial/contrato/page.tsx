import { PageHeader, PageShell } from "@/components/kit";
import { hoyPanama } from "@/lib/cartera/fecha";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { AltaContratoForm } from "@/app/cartera/clientes/alta-contrato";
import { listarCarrosLibres } from "@/app/cartera/clientes/actions";
import { crearSolicitudContrato } from "@/app/cartera/aprobaciones/actions";

export const dynamic = "force-dynamic";

export default async function ContratoComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const [{ aviso }, sesion, carros] = await Promise.all([
    searchParams,
    sesionEquipo(),
    listarCarrosLibres(),
  ]);
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
        title="Crear solicitud"
        subtitle={
          puedeCobrar
            ? "Armás la solicitud con cliente, carro y deal. Cartera la aprueba y recién ahí se crea el contrato. Si cobrás hoy, queda en la solicitud."
            : "Armás la solicitud con cliente, carro y deal. Cartera la aprueba y crea el contrato; el pago de hoy lo registran Claudia o Marcela."
        }
      />
      {aviso && (
        <p className="mt-4 rounded-lg bg-ambar-wash px-4 py-3 text-sm text-ink ring-1 ring-ambar/40">
          {aviso}
        </p>
      )}
      <div className="mt-6">
        <AltaContratoForm
          carros={carros}
          fechaHoy={hoyPanama()}
          action={crearSolicitudContrato}
          puedeCobrar={puedeCobrar}
          submitLabel="Enviar solicitud a cartera"
          submittingLabel="Enviando…"
          avisoSinCobro="La solicitud va a cartera. El cliente y el contrato se crean al aprobar; el pago de hoy lo registran Claudia o Marcela."
        />
      </div>
    </PageShell>
  );
}
