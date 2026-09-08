import { PageHeader, Money } from "@/components/kit";
import {
  estadosCuentaHoy,
  money,
  textoSituacionCuotas,
  textoValorCuotas,
  type EstadoCuenta,
} from "@/lib/cartera/estado-cuenta";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { PruebaEnvio } from "./prueba";

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
        <p className="mt-8 rounded-2xl bg-surface p-6 font-mono text-xs text-muted ring-1 ring-line/60">{error}</p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tarjeta label="Carros" valor={String(estados.length)} />
            <Tarjeta label="Total a cobrar hoy" valor={money(totalACobrar)} />
            <Tarjeta label="Con recargo" valor={String(conRecargo)} />
          </div>

          <div className="mt-6">
            <PruebaEnvio />
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl bg-surface ring-1 ring-line/60">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 whitespace-nowrap">Carro</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Valor</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Recargo</th>
                  <th className="px-4 py-3 whitespace-nowrap">Total hoy</th>
                  <th className="px-4 py-3">Situación</th>
                </tr>
              </thead>
              <tbody>
                {estados.slice(0, 250).map((e) => (
                  <tr key={e.contratoId} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap tabular-nums">
                      {etiquetaCarroUi(e.empresa, e.vehiculoNumero)}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{e.clienteNombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {e.letra > 0.009 ? <Money amount={e.letra} /> : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ambar">
                      {e.recargo > 0.009 ? (
                        <Money amount={e.recargo} />
                      ) : e.recargoSiTarda > 0.009 ? (
                        <span className="text-xs text-muted" title="Si no completa antes de las 7 p.m.">
                          +<Money amount={e.recargoSiTarda} />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium tabular-nums whitespace-nowrap">
                      {textoValorCuotas(e)}
                    </td>
                    <td className="px-4 py-2.5">
                      <p
                        className={
                          e.pagoPuntual || e.totalHoy <= 0.009
                            ? "font-medium text-verde"
                            : e.pendienteAnterior > 0.009
                              ? "font-medium text-rojo"
                              : "font-medium text-ambar"
                        }
                      >
                        {textoSituacionCuotas(e)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                        A pagar hoy <Money amount={e.totalHoy} />
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {estados[0] && (
            <div className="mt-8">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Vista previa del mensaje (carro {estados[0].vehiculoNumero})
              </h2>
              <div className="mt-3 max-w-md whitespace-pre-wrap rounded-2xl bg-ink p-5 text-sm text-paper ring-1 ring-ink">
                {`Buen día ${estados[0].templateVars[0]} 🌞\n\n📋 Extracto diario · Carro ${estados[0].templateVars[1]} — ${estados[0].templateVars[2]}\n\n${estados[0].templateVars[3]}\n\nTotal a pagar hoy: ${estados[0].templateVars[4]}\n\nRecuerda: el sistema cierra a las 7:00 p.m., luego se genera recargo. Envíanos tu comprobante por aquí. ¡Gracias!`}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tarjeta({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line/60">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
    </div>
  );
}
