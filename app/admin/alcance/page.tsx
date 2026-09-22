import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, StatusChip } from "@/components/kit";
import { sesionEquipo } from "@/lib/equipo/sesion";
import { createServerSupabase } from "@/lib/supabase/server";
import { leerAlcance, etiquetaAlcance } from "@/lib/cartera/alcance";
import { FormAlcance } from "./form";

export const dynamic = "force-dynamic";

export default async function AlcancePage() {
  const yo = await sesionEquipo();
  if (!yo) redirect("/ingreso");
  if (yo.rol !== "admin") redirect("/admin");

  const sb = createServerSupabase();
  const [{ data: empresas }, alcance] = await Promise.all([
    sb.from("empresas").select("id, codigo, nombre").order("codigo"),
    leerAlcance(),
  ]);

  const lista = (empresas ?? []) as { id: string; codigo: string; nombre: string }[];
  const seleccionadas = alcance.empresaIds ?? [];
  const etiqueta = etiquetaAlcance(alcance.codigos);

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <PageHeader
        eyebrow="Configuración"
        title="Alcance de cartera"
        subtitle="Qué empresas operan esta semana en el panel y en los envíos automáticos."
        action={
          <Link href="/admin" className="text-sm font-medium text-ink underline-offset-2 hover:underline">
            ← Resumen
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Ahora
        </span>
        {etiqueta ? (
          <StatusChip tone="warn">Piloto · {etiqueta}</StatusChip>
        ) : (
          <StatusChip tone="good">Todas las empresas</StatusChip>
        )}
      </div>

      <div className="mt-6">
        <FormAlcance empresas={lista} seleccionadas={seleccionadas} />
      </div>

      <p className="mt-6 text-xs text-muted">
        El interruptor de seguridad de envíos ({`ENVIOS_MASIVOS`}) sigue en Vercel: si algo falla,
        apagas WhatsApp sin tocar este alcance. GPS / Rastreo ignora esta lista.
      </p>
    </div>
  );
}
