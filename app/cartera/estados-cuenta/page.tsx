import { PageHeader, Kpi, Money } from "@/components/kit";
import { estadosCuentaHoy, money, type EstadoCuenta } from "@/lib/cartera/estado-cuenta";
import { deudasCerradas, type DeudaCerrada } from "@/lib/cartera/deudas-cerradas";
import { PruebaEnvio } from "./prueba";
import { DeudoresCerrados } from "./deudores-cerrados";
import { EstadosTabla } from "./tabla";

export const dynamic = "force-dynamic";

export default async function EstadosCuentaPage() {
  let estados: EstadoCuenta[];
  let error: string | null = null;
  try {
    estados = await estadosCuentaHoy();
  } catch (e) {
    estados = [];
    error = e instanceof Error ? e.message : "Error";
  }

  let cerradas: DeudaCerrada[] = [];
  try {
    cerradas = await deudasCerradas();
  } catch {
    cerradas = [];
  }
  const deudaCerradaTotal = cerradas.reduce((a, d) => a + d.saldo, 0);

  const totalACobrar = estados.reduce((a, e) => a + e.totalHoy, 0);
  const conRecargo = estados.filter((e) => e.recargo > 0 || e.recargoSiTarda > 0).length;

  return (
    <div className="mx-auto max-w-6xl py-10">
      <PageHeader
        eyebrow="Cartera"
        title="Estado de cuenta del día"
        subtitle="Lo que debe pagar hoy cada carro. Este es el mensaje que se enviará a primera hora."
      />

      {error ? (
        <p className="mt-8 rounded-xl bg-surface p-6 text-sm text-rojo ring-1 ring-line">{error}</p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Carros" value={estados.length} />
            <Kpi label="Total a cobrar hoy" value={<Money amount={totalACobrar} />} />
            <Kpi label="Con recargo" value={conRecargo} tone={conRecargo > 0 ? "warn" : "good"} />
            <Kpi label="Deuda ex-clientes" value={<Money amount={deudaCerradaTotal} />} />
          </div>

          <div className="mt-6">
            <PruebaEnvio />
          </div>

          <EstadosTabla estados={estados} />

          <div className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">Ex-clientes con deuda</h2>
            <p className="mt-1 text-sm text-muted">
              Entregaron el carro debiendo. No corre cuota diaria; se cobra el saldo pendiente.
            </p>
            <div className="mt-4">
              <DeudoresCerrados deudas={cerradas} />
            </div>
          </div>

          {estados[0] && (
            <div className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                Vista previa del mensaje (carro {estados[0].vehiculoNumero})
              </h2>
              <div className="mt-3 max-w-md whitespace-pre-wrap rounded-xl bg-ink p-5 text-sm text-paper">
                {`Buen día ${estados[0].templateVars[0]} 🌞\n\n📋 Extracto diario · Carro ${estados[0].templateVars[1]} — ${estados[0].templateVars[2]}\n\n${estados[0].templateVars[3]}\n\nTotal a pagar hoy: ${estados[0].templateVars[4]}\n\nRecuerda: el sistema cierra a las 7:00 p.m., luego se genera recargo. Envíanos tu comprobante por aquí. ¡Gracias!`}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
