import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/kit";
import { SubirExtracto } from "./uploader";

export const dynamic = "force-dynamic";

async function getRecientes() {
  try {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("extractos_bancarios")
      .select("id, fecha, cargado_por, created_at, empresa:empresas(codigo)")
      .order("created_at", { ascending: false })
      .limit(8);
    return (data as unknown as { id: string; fecha: string; created_at: string; empresa: { codigo: string } | null }[]) ?? [];
  } catch {
    return [];
  }
}

export default async function ExtractosPage() {
  const recientes = await getRecientes();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <PageHeader
        eyebrow="Cartera"
        title="Conciliación por extracto"
        subtitle="Sube el extracto del banco y el sistema cuadra los pagos contra los contratos por # de carro."
      />

      <div className="mt-8">
        <SubirExtracto />
      </div>

      {recientes.length > 0 && (
        <>
          <h2 className="mt-12 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Extractos cargados
          </h2>
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line/60">
            {recientes.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium">{e.empresa?.codigo ?? "—"} · {e.fecha}</span>
                <span className="font-mono text-[11px] text-muted">
                  {new Date(e.created_at).toLocaleString("es-PA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
