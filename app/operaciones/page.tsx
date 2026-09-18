import Link from "next/link";
import { PageHeader, Kpi, SubCard } from "@/components/kit";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  KM_MANTENIMIENTO,
  licenciasSemaforo,
  mantenimientoKm,
  revisadoSemaforo,
} from "@/lib/operaciones/alertas";

export const dynamic = "force-dynamic";

export default async function OperacionesPage() {
  const sb = createServerSupabase();
  const [lic, mant, rev, flota, taller] = await Promise.all([
    licenciasSemaforo(),
    mantenimientoKm(),
    revisadoSemaforo(),
    sb.from("vehiculos").select("*", { count: "exact", head: true }).eq("estado", "activo"),
    sb.from("vehiculos").select("*", { count: "exact", head: true }).in("estado", ["mantenimiento", "chapisteria"]),
  ]);

  const licCrit = lic.items.filter((i) => i.nivel === "vencido" || i.nivel === "rojo").length;
  const mantVenc = mant.items.filter((i) => i.estado === "vencido").length;
  const revCrit = rev.items.filter((i) => i.nivel === "vencido" || i.nivel === "rojo").length;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Operaciones"
        title="Operaciones"
        subtitle="Hoja de vida, licencias, mantenimiento FULL cada 6.000 km y placas/revisado."
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Flota activa" value={flota.count ?? 0} />
        <Kpi
          label="Licencias urgentes"
          value={licCrit}
          tone={licCrit > 0 ? "crit" : "good"}
          hint={lic.disponible ? `${lic.items.length} con fecha` : "Sin datos aún"}
        />
        <Kpi
          label={`Mant. ≥ ${KM_MANTENIMIENTO.toLocaleString("es-PA")} km`}
          value={mantVenc}
          tone={mantVenc > 0 ? "crit" : "good"}
          hint={mant.disponible ? `${mant.items.length} con ancla` : "Sin datos aún"}
        />
        <Kpi
          label="Revisado urgente"
          value={revCrit}
          tone={revCrit > 0 ? "warn" : "default"}
          hint={rev.disponible ? `${rev.items.length} con fecha` : "Sin datos aún"}
        />
      </div>

      <p className="mt-3 text-xs text-muted">
        En taller ahora: <span className="font-medium tabular-nums text-ink">{taller.count ?? 0}</span>
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SubCard
          href="/operaciones/hoja-vida"
          title="Hoja de vida"
          desc="Historial editable del carro: mantos, chapistería, entregas y novedades."
        />
        <SubCard
          href="/cartera/licencias"
          title="Licencias"
          desc="Semáforo por vencimiento. Rojo 0–30 días; si vence, apagar o retirar."
        />
        <SubCard
          href="/cartera/mantenimiento"
          title="Mantenimiento"
          desc={`FULL cada ${KM_MANTENIMIENTO.toLocaleString("es-PA")} km. Citar los que ya llegaron.`}
        />
        <SubCard
          href="/cartera/placas"
          title="Placas y revisado"
          desc="Vencimiento del revisado y retiro de sticker hasta el 30."
        />
      </div>

      <p className="mt-8 text-sm text-muted">
        ¿Faltan fechas? Cargá vencimiento de licencia en clientes, y en carros el último
        mantenimiento / revisado.{" "}
        <Link href="/cartera/vehiculos" className="font-medium text-ink underline-offset-2 hover:underline">
          Ir a Carros
        </Link>
      </p>
    </div>
  );
}
