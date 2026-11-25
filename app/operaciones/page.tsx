import Link from "next/link";
import { Band, PageHeader, Kpi, SubCard, PageShell } from "@/components/kit";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
import {
  KM_MANTENIMIENTO,
  KM_KIT_TIEMPO,
  licenciasSemaforo,
  mantenimientoKm,
  kitTiempoKm,
  revisadoSemaforo,
} from "@/lib/operaciones/alertas";
import { listarCitasTaller } from "@/lib/operaciones/agenda";
import { listarRegistrosDelDia } from "@/lib/operaciones/registro-taller";

export const dynamic = "force-dynamic";

export default async function OperacionesPage() {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const [lic, mant, kit, rev, flota, taller, agenda, atendidos] = await Promise.all([
    licenciasSemaforo(),
    mantenimientoKm(),
    kitTiempoKm(),
    revisadoSemaforo(),
    sb.from("vehiculos").select("*", { count: "exact", head: true }).eq("estado", "activo"),
    sb
      .from("vehiculos")
      .select("*", { count: "exact", head: true })
      .in("estado", ["mantenimiento", "chapisteria"]),
    listarCitasTaller({ estado: "abiertas" }),
    listarRegistrosDelDia(hoy),
  ]);

  const licCrit = lic.items.filter((i) => i.nivel === "vencido" || i.nivel === "rojo").length;
  const mantVenc = mant.items.filter((i) => i.estado === "vencido").length;
  const kitCrit = kit.items.filter((i) => i.estado === "vencido" || i.estado === "pronto").length;
  const revCrit = rev.items.filter((i) => i.nivel === "vencido" || i.nivel === "rojo").length;
  const citasAbiertas = agenda.filas.length;
  const hoyN = atendidos.filas.length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Operaciones"
        title="Operaciones"
        subtitle="Agenda de taller, mantenimiento, chapistería, licencias y placas."
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Flota activa" value={flota.count ?? 0} />
        <Kpi
          label="Citas abiertas"
          value={citasAbiertas}
          tone={citasAbiertas > 0 ? "warn" : "default"}
          hint="Agenda de taller"
        />
        <Kpi
          label="Atendidos hoy"
          value={hoyN}
          tone={hoyN > 0 ? "good" : "default"}
        />
        <Kpi
          label="Licencias urgentes"
          value={licCrit}
          tone={licCrit > 0 ? "crit" : "good"}
          hint={lic.disponible ? `${lic.items.length} con fecha` : "Sin datos aún"}
        />
        <Kpi
          label={`FULL ≥ ${KM_MANTENIMIENTO.toLocaleString("es-PA")} km`}
          value={mantVenc}
          tone={mantVenc > 0 ? "crit" : "good"}
          hint={mant.disponible ? `${mant.items.length} con ancla` : "Sin datos aún"}
        />
        <Kpi
          label={`Kit ~${(KM_KIT_TIEMPO / 1000).toFixed(0)}k km`}
          value={kitCrit}
          tone={kitCrit > 0 ? "warn" : "good"}
          hint={kit.disponible ? "En ventana de citación" : "Sin km"}
        />
      </div>

      <p className="mt-3 text-xs text-muted">
        En taller ahora:{" "}
        <span className="font-medium tabular-nums text-ink">{taller.count ?? 0}</span>
        {revCrit > 0 ? (
          <>
            {" "}
            · Revisado urgente:{" "}
            <span className="font-medium tabular-nums text-ambar">{revCrit}</span>
          </>
        ) : null}
      </p>

      <div className="mt-10 space-y-10">
        <Band title="Taller">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SubCard
              href="/operaciones/agenda"
              title="Agenda de taller"
              desc="Llegó / no llegó, registro FULL·kit·revisión, fotos y próxima visita."
            />
            <SubCard
              href="/operaciones/conversaciones"
              title="Conversaciones"
              desc="WhatsApp +507 6623-6501. Confirmaciones y mensajes del taller."
            />
            <SubCard
              href="/operaciones/mantenimiento"
              title="Mantenimiento"
              desc={`Informe semanal · FULL cada ${KM_MANTENIMIENTO.toLocaleString("es-PA")} km · kit ${(KM_KIT_TIEMPO / 1000).toFixed(0)}k.`}
            />
          </div>
        </Band>

        <Band title="Flota y papeles">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SubCard
              href="/operaciones/hoja-vida"
              title="Hoja de vida"
              desc="Historial editable: mantos, chapistería, entregas y novedades."
            />
            <SubCard
              href="/operaciones/chapisteria"
              title="Chapistería"
              desc="Tarifario Grand i10 / Soluto, cajas del mes y talleres externos."
            />
            <SubCard
              href="/operaciones/licencias"
              title="Licencias"
              desc="Semáforo por vencimiento. Rojo 0–30 días; si vence, apagar o retirar."
            />
            <SubCard
              href="/operaciones/placas"
              title="Placas y revisado"
              desc="Vencimiento del revisado y retiro de sticker hasta el 30."
            />
          </div>
        </Band>
      </div>

      <p className="mt-8 text-sm text-muted">
        El día del mantenimiento se cuadra con{" "}
        <Link href="/cartera" className="font-medium text-ink underline-offset-2 hover:underline">
          Cartera
        </Link>{" "}
        (cobro, licencia y cuentas).
      </p>
    </PageShell>
  );
}
