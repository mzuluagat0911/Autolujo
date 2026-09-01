import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/kit";
import { SubirExtracto } from "./uploader";
import { ColaRevision, type MovimientoRevision } from "./cola";
import { PagoManualForm } from "../pagos/pago-manual-form";

export const dynamic = "force-dynamic";

type Empresa = { id: string; codigo: string; nombre: string };
type ExtractoReciente = {
  id: string;
  fecha: string;
  created_at: string;
  empresa: { codigo: string } | null;
};

async function getData(): Promise<{
  empresas: Empresa[];
  recientes: ExtractoReciente[];
  revision: MovimientoRevision[];
}> {
  const vacio = { empresas: [] as Empresa[], recientes: [] as ExtractoReciente[], revision: [] as MovimientoRevision[] };
  try {
    const sb = createServerSupabase();
    const [emp, ext, mov] = await Promise.all([
      sb.from("empresas").select("id, codigo, nombre").order("codigo"),
      sb
        .from("extractos_bancarios")
        .select("id, fecha, cargado_por, created_at, empresa:empresas(codigo)")
        .order("created_at", { ascending: false })
        .limit(12),
      sb
        .from("movimientos_extracto")
        .select(
          "id, fecha, monto, descripcion, numero_carro, nombre_detectado, motivo, via, extracto:extractos_bancarios(empresa:empresas(codigo)), contrato:contratos(cliente:clientes(nombre), vehiculo:vehiculos(numero))",
        )
        .eq("estado", "revisar")
        .order("fecha", { ascending: false })
        .limit(80),
    ]);
    const revision: MovimientoRevision[] = ((mov.data ?? []) as unknown as {
      id: string;
      fecha: string | null;
      monto: number;
      descripcion: string | null;
      numero_carro: string | null;
      nombre_detectado: string | null;
      motivo: string | null;
      via: string | null;
      extracto: { empresa: { codigo: string } | null } | null;
      contrato: {
        cliente: { nombre: string } | null;
        vehiculo: { numero: string } | null;
      } | null;
    }[]).map((m) => ({
      id: m.id,
      fecha: m.fecha,
      monto: Number(m.monto),
      descripcion: m.descripcion,
      numeroCarro: m.numero_carro,
      nombreDetectado: m.nombre_detectado,
      motivo: m.motivo,
      via: m.via,
      sugeridoCarro: m.contrato?.vehiculo?.numero ?? m.numero_carro,
      sugeridoCliente: m.contrato?.cliente?.nombre ?? null,
      empresa: m.extracto?.empresa?.codigo ?? null,
    }));
    return {
      empresas: (emp.data as Empresa[]) ?? [],
      recientes: (ext.data as unknown as ExtractoReciente[]) ?? [],
      revision,
    };
  } catch {
    return vacio;
  }
}

export default async function ExtractosPage() {
  const { empresas, recientes, revision } = await getData();

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <PageHeader
        eyebrow="Cartera"
        title="Conciliación"
        subtitle="Oficina, extracto de Banco General, y la cola de lo que el cruce no pudo aplicar solo."
      />

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Por revisar · {revision.length}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Aplicar ancla el movimiento a un carro de esa empresa. Si hay un comprobante pendiente del mismo monto y día, se cruza; si no, se registra el pago del banco. Ignorar lo saca de la cola sin mover el saldo.
        </p>
        <ColaRevision movimientos={revision} />
      </section>

      <section className="mt-12">
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
          Un PDF por empresa. Solo se concilia lo que calza en carro, monto, fecha y cuenta; el resto queda para revisión.
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
