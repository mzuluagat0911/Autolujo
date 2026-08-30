import { PageHeader, SubCard } from "@/components/kit";

export default function CarteraHome() {
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Módulo"
        title="Cartera"
        subtitle="Cobranza diaria — el corazón operativo de AutoLujo."
      />
      <div className="max-w-2xl">
        <SubCard href="/cartera/clientes" title="Clientes" desc="Alta y consulta de clientes" />
        <SubCard href="/cartera/empresas" title="Empresas" desc="Autolujo, Kowua, Gold" />
        <SubCard href="/cartera/vehiculos" title="Vehículos" desc="Flota y estado por empresa" />
        <SubCard href="/cartera/tarifario" title="Tarifario" desc="Letra diaria por año, modelo y km" />
        <SubCard href="/cartera/contratos" title="Contratos" desc="Cuotas, abonos y acuerdos" status="pronto" />
        <SubCard href="/cartera/conciliacion" title="Conciliación" desc="Pagos contra el extracto" status="pronto" />
        <SubCard href="/cartera/reglas" title="Reglas" desc="Multas, cierre a mediodía, exceso km" status="pronto" />
      </div>
    </div>
  );
}
