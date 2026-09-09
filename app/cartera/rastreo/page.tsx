import { PageHeader, Kpi, EmptyState, StatusChip } from "@/components/kit";
import { destinoTarifaCercano } from "@/lib/cartera/salidas-geo";
import { formatHoraCarga } from "@/lib/gps/ui";
import { cargarTableroRastreo } from "./actions";
import { TableroRastreo } from "./tablero";

export const dynamic = "force-dynamic";

export default async function RastreoPage({
  searchParams,
}: {
  searchParams?: Promise<{ carro?: string }>;
}) {
  const t = await cargarTableroRastreo();
  const sp = searchParams ? await searchParams : {};
  const carro = typeof sp.carro === "string" ? sp.carro.trim() : "";

  let enDestino = 0;
  for (const f of t.filas) {
    if (f.latitud == null || f.longitud == null) continue;
    if (destinoTarifaCercano(f.latitud, f.longitud)) enDestino += 1;
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Cartera"
        title="Rastreo"
        subtitle="Posición en vivo desde Diacor. Mapa para el parte matutino; lista e histórico de km."
        action={
          t.configurado && !t.error ? (
            <div className="flex flex-col items-end gap-1.5">
              <StatusChip tone="good">Diacor conectado</StatusChip>
              <p className="text-[11px] tabular-nums text-muted">
                Actualizado {formatHoraCarga(t.cargadoAt)}
              </p>
            </div>
          ) : t.configurado && t.error ? (
            <StatusChip tone="crit">Diacor con error</StatusChip>
          ) : (
            <StatusChip tone="warn">Sin credenciales</StatusChip>
          )
        }
      />

      {!t.configurado ? (
        <EmptyState
          title="Falta conectar Diacor"
          hint="En Vercel (o .env.local) configure DIACOR_USER y DIACOR_PASSWORD de rastreo.diacorserver.com. El host ya está puesto."
        />
      ) : t.error ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-rojo-wash px-4 py-4 ring-1 ring-rojo/20">
            <p className="text-sm font-medium text-rojo">No pude hablar con Diacor</p>
            <p className="mt-1 text-sm text-rojo/90">{t.error}</p>
            <p className="mt-3 text-xs text-muted">
              Revisá usuario/contraseña, que la cuenta tenga dispositivos, y reintentá recargando la página.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <Kpi label="En movimiento" value={t.enMovimiento} tone="good" hint="Velocidad ≥ 1 km/h" />
            <Kpi
              label="Detenidos"
              value={t.detenidos}
              tone={t.detenidos > 0 ? "crit" : "default"}
              hint="Con señal, quietos"
            />
            <Kpi
              label="Sin señal"
              value={t.sinSenal}
              tone={t.sinSenal > 0 ? "warn" : "default"}
              hint="GPS offline"
            />
            <Kpi
              label="Destino tarifa"
              value={enDestino}
              tone={enDestino > 0 ? "warn" : "default"}
              hint="Interior / salida"
            />
          </div>
          {(t.sinVincular > 0 || t.porVincular > 0) && (
            <p className="mt-3 text-xs text-muted">
              {t.filas.length} dispositivos · {t.enLinea} en línea
              {t.sinVincular > 0 ? ` · ${t.sinVincular} sin carro` : ""}
              {t.porVincular > 0 ? ` · ${t.porVincular} por amarrar (Lista → Amarrar GPS)` : ""}
            </p>
          )}
          <div className="mt-8">
            <TableroRastreo inicial={t} resaltarCarro={carro || null} />
          </div>
        </>
      )}
    </div>
  );
}
