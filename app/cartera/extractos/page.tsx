import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/kit";
import { SubirExtracto } from "./uploader";
import { PagoManualForm } from "../pagos/pago-manual-form";

export const dynamic = "force-dynamic";

type Empresa = { id: string; codigo: string; nombre: string };
type ExtractoReciente = {
  id: string;
  fecha: string;
  created_at: string;
  empresa: { codigo: string } | null;
};

async function getData(): Promise<{ empresas: Empresa[]; recientes: ExtractoReciente[] }> {
  try {
    const sb = createServerSupabase();
    const [emp, ext] = await Promise.all([
      sb.from("empresas").select("id, codigo, nombre").order("codigo"),
      sb
        .from("extractos_bancarios")
        .select("id, fecha, cargado_por, created_at, empresa:empresas(codigo)")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
    return {
      empresas: (emp.data as Empresa[]) ?? [],
      recientes: (ext.data as unknown as ExtractoReciente[]) ?? [],
    };
  } catch {
    return { empresas: [], recientes: [] };
  }
}

export default async function ExtractosPage() {
  const { empresas, recientes } = await getData();

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <PageHeader
        eyebrow="Cartera"
        title="Conciliación"
        subtitle="Dos caminos: anotar un pago de oficina, o subir el extracto de Banco General por empresa."
      />

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          1 · Pago en oficina
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Efectivo o datáfono. Se ancla al número de carro y, si puede, se avisa al cliente por WhatsApp.
        </p>
        <PagoManualForm abiertoPorDefecto />
      </section>

      <section className="mt-12">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          2 · Extracto bancario
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Un PDF por empresa. El cruce usa solo esa flota, no mezcla Autolujo con Kowua ni Gold.
        </p>
        {empresas.length === 0 ? (
          <p className="rounded-xl bg-surface p-4 text-sm text-muted ring-1 ring-line">
            No hay empresas cargadas. Revisa el schema en Supabase.
          </p>
        ) : (
          <SubirExtracto empresas={empresas} />
        )}
      </section>

      {recientes.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Extractos cargados
          </h2>
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
            {recientes.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium">{e.empresa?.codigo ?? "—"} · {e.fecha}</span>
                <span className="text-[11px] tabular-nums text-muted">
                  {new Date(e.created_at).toLocaleString("es-PA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
