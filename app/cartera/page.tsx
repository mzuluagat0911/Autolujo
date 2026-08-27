import { PageHeader, SubCard } from "@/components/kit";

export default function CarteraHome() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <PageHeader
        title="Cartera"
        subtitle="Cobranza diaria — el módulo prioritario de la plataforma."
      />
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SubCard href="/cartera/clientes" title="Clientes" desc="Alta y consulta de clientes" status="active" />
        <SubCard href="/cartera/empresas" title="Empresas" desc="Autolujo, Kowua, Gold" status="active" />
        <SubCard href="/cartera/vehiculos" title="Vehículos" desc="Flota y estado por empresa" status="active" />
        <SubCard href="/cartera/tarifario" title="Tarifario" desc="Letra diaria por año/modelo/km" status="active" />
        <SubCard href="/cartera/contratos" title="Contratos" desc="Cuotas, abonos y acuerdos" status="pronto" />
        <SubCard href="/cartera/conciliacion" title="Conciliación" desc="Pagos contra el extracto" status="pronto" />
        <SubCard href="/cartera/reglas" title="Reglas" desc="Multas, cierre a mediodía, exceso km" status="pronto" />
      </div>
    </div>
  );
}
