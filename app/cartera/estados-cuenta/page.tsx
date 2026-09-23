import Link from "next/link";
import { PageHeader, Kpi, Money, StatusChip } from "@/components/kit";
import { estadosCuentaPanel, type EstadoCuenta } from "@/lib/cartera/estado-cuenta";
import { previewEstadoCuenta, estaAlDia, enrichExtracto } from "@/lib/cartera/envios";
import { deudasCerradas, type DeudaCerrada } from "@/lib/cartera/deudas-cerradas";
import { etiquetaAlcance, leerAlcance } from "@/lib/cartera/alcance";
import { PruebaEnvio } from "./prueba";
import { DeudoresCerrados } from "./deudores-cerrados";
import { EstadosTabla } from "./tabla";

export const dynamic = "force-dynamic";

export default async function EstadosCuentaPage() {
  let estados: EstadoCuenta[];
  let error: string | null = null;
  try {
    estados = await estadosCuentaPanel();
  } catch (e) {
    estados = [];
    error = e instanceof Error ? e.message : "Error";
  }

  const alcance = await leerAlcance();
  const etiqueta = etiquetaAlcance(alcance.codigos);

  let cerradas: DeudaCerrada[] = [];
  try {
    cerradas = await deudasCerradas();
  } catch {
    cerradas = [];
  }
  const deudaCerradaTotal = cerradas.reduce((a, d) => a + d.saldo, 0);

  const totalACobrar = estados
    .filter((e) => !(e.pagoPuntual || e.totalHoy <= 0.009))
    .reduce((a, e) => a + e.totalHoy, 0);
  const conRecargo = estados.filter((e) => e.recargosAcumulados > 0.009).length;

  let preview: string | null = null;
  let previewLabel = "";
  if (estados[0]) {
    const e = estados[0];
    const ctx = await enrichExtracto(e);
    preview = previewEstadoCuenta(e, ctx);
    previewLabel = `Vista previa del mensaje (carro ${e.vehiculoNumero}${estaAlDia(e) ? " · al día" : " · con atraso"})`;
  }

  return (
    <div className="mx-auto max-w-6xl py-10">
      <PageHeader
        eyebrow="Cartera"
        title="Estado de cuenta del día"
        subtitle="Lo que debe pagar hoy cada carro. Clic en una fila para ver el detalle completo."
      />

      {etiqueta && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusChip tone="warn">Alcance · {etiqueta}</StatusChip>
          <Link
            href="/admin/alcance"
            className="text-xs font-medium text-muted underline-offset-2 hover:underline"
          >
            Cambiar
          </Link>
        </div>
      )}

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

          {preview && (
            <div className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                {previewLabel}
              </h2>
              <div className="mt-3 max-w-md whitespace-pre-wrap rounded-xl bg-ink p-5 text-sm text-paper">
                {preview}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
