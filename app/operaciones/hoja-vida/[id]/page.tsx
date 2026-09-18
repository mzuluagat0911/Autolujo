import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusChip } from "@/components/kit";
import { createServerSupabase } from "@/lib/supabase/server";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { hoyPanama } from "@/lib/cartera/fecha";
import { listarEventos } from "../actions";
import { FormNuevoEvento, TimelineEventos } from "../editor";

export const dynamic = "force-dynamic";

export default async function HojaVidaCarroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createServerSupabase();
  const { data: veh, error } = await sb
    .from("vehiculos")
    .select(
      "id, numero, placa, marca, modelo, anio, km_actual, estado, fecha_ultimo_mantenimiento, empresa:empresas(codigo)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !veh) notFound();

  const eventos = await listarEventos(id);
  const empRaw = veh.empresa as unknown as { codigo: string } | { codigo: string }[] | null;
  const emp = Array.isArray(empRaw) ? empRaw[0]?.codigo ?? null : empRaw?.codigo ?? null;
  const ficha = [veh.marca, veh.modelo, veh.anio].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-4xl py-10">
      <p className="mb-4">
        <Link
          href="/operaciones/hoja-vida"
          className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          ← Todos los carros
        </Link>
      </p>

      <PageHeader
        eyebrow="Hoja de vida"
        title={etiquetaCarroUi(emp, veh.numero)}
        subtitle={[ficha || null, veh.placa ? `Placa ${veh.placa}` : null]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex flex-col items-end gap-1">
            <StatusChip
              tone={
                veh.estado === "activo"
                  ? "good"
                  : veh.estado === "mantenimiento" || veh.estado === "chapisteria"
                    ? "warn"
                    : "neutral"
              }
            >
              {veh.estado}
            </StatusChip>
            {veh.fecha_ultimo_mantenimiento && (
              <p className="text-xs tabular-nums text-muted">
                Último mant. {veh.fecha_ultimo_mantenimiento}
              </p>
            )}
          </div>
        }
      />

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Agregar evento</h2>
        <p className="mb-4 text-sm text-muted">
          Cada actualización de taller, entrega o novedad queda aquí. Si marcás
          mantenimiento, también se actualiza el ancla de Operaciones.
        </p>
        <FormNuevoEvento vehiculoId={id} fechaHoy={hoyPanama()} />
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Historial</h2>
          <p className="text-xs tabular-nums text-muted">{eventos.length} eventos</p>
        </div>
        <TimelineEventos vehiculoId={id} eventos={eventos} />
      </section>
    </div>
  );
}
