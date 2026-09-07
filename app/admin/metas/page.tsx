import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/kit";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { hoyPanama, mesLargo } from "@/lib/cartera/fecha";
import { listarMetasCobranza, mesClave } from "@/lib/cartera/metas-cobranza";
import { money2 } from "@/lib/cartera/resumen-cobranza";
import { FormMetaMes } from "./form";

export const dynamic = "force-dynamic";

export default async function MetasPage() {
  const yo = await sesionEquipo();
  if (!yo) redirect("/ingreso");
  if (yo.rol !== "admin") redirect("/admin");

  const hoy = hoyPanama();
  const mesActual = hoy.slice(0, 7);
  const metas = await listarMetasCobranza(24);
  const actual = metas.find((m) => m.mes === mesClave(mesActual)) ?? null;

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <PageHeader
        eyebrow="Configuración"
        title="Meta de cobranza"
        subtitle="Carga la Meta al 100% de cada mes. El Resumen y el avance ideal usan este número."
        action={
          <Link href="/admin" className="text-sm font-medium text-ink underline-offset-2 hover:underline">
            ← Resumen
          </Link>
        }
      />

      <FormMetaMes
        mesDefault={mesActual}
        metaDefault={actual?.meta100 ?? null}
        notaDefault={actual?.nota ?? null}
      />

      <h2 className="mt-10 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Historial · {metas.length}
      </h2>
      <div className="mt-4 overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        {metas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Todavía no hay metas. Guarda la del mes en curso.
            <br />
            <span className="text-xs">Si falla al guardar, corre la migración 0022 en Supabase.</span>
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Mes</th>
                <th className="px-4 py-3 text-right">Meta 100%</th>
                <th className="px-4 py-3">Nota</th>
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => (
                <tr key={m.mes} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-medium capitalize">{mesLargo(m.mes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                    {money2(m.meta100)}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{m.nota ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
