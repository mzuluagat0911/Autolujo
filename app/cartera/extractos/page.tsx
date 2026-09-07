import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Money, StatusChip } from "@/components/kit";
import { lineaSalidaCruce, salidasPendientesBanco } from "@/lib/cartera/salidas-aplicar";
import { SubirExtracto } from "./uploader";
import { ColaRevision, type MovimientoRevision, type CandidatoPago } from "./cola";
import { PagoManualForm } from "../pagos/pago-manual-form";
import { fechaCubrePago, montoExacto } from "@/lib/cartera/cruce";

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
  salidasBanco: Awaited<ReturnType<typeof salidasPendientesBanco>>;
}> {
  const vacio = {
    empresas: [] as Empresa[],
    recientes: [] as ExtractoReciente[],
    revision: [] as MovimientoRevision[],
    salidasBanco: [] as Awaited<ReturnType<typeof salidasPendientesBanco>>,
  };
  try {
    const sb = createServerSupabase();
    const [emp, ext, mov, salidasBanco] = await Promise.all([
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
      salidasPendientesBanco(),
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
      salidaHint: null as string | null,
      candidatos: [] as CandidatoPago[],
    }));

    const ambiguos = revision.filter((r) => r.motivo?.includes("Varios comprobantes") || r.motivo?.includes("[ids:"));
    if (ambiguos.length > 0) {
      const { data: pend } = await sb
        .from("pagos")
        .select("id, monto, pagado_at, numero_carro, referencia")
        .eq("estado_conciliacion", "pendiente")
        .eq("origen", "comprobante")
        .limit(300);
      const pendientes = (pend ?? []) as {
        id: string;
        monto: number;
        pagado_at: string;
        numero_carro: string | null;
        referencia: string | null;
      }[];
      for (const r of ambiguos) {
        if (!r.fecha) continue;
        const idsMotivo = /\[ids:([^\]]+)\]/.exec(r.motivo ?? "")?.[1]?.split(",").map((s) => s.trim()) ?? [];
        r.candidatos = pendientes
          .filter((p) => {
            if (idsMotivo.length > 0) return idsMotivo.includes(p.id);
            return montoExacto(Number(p.monto), r.monto) && fechaCubrePago(p.pagado_at, r.fecha!);
          })
          .map((p) => ({
            id: p.id,
            monto: Number(p.monto),
            numeroCarro: p.numero_carro,
            pagadoAt: p.pagado_at,
            referencia: p.referencia,
          }));
      }
    }

    for (const r of revision) {
      const hit = salidasBanco.find(
        (s) =>
          Math.round(s.monto * 100) === Math.round(r.monto * 100) &&
          (!r.sugeridoCarro || !s.numero || r.sugeridoCarro === s.numero),
      );
      if (hit) r.salidaHint = `Calza con salida a ${hit.destino}${hit.numero ? ` · carro ${hit.numero}` : ""} · pendiente por conciliar`;
    }
    return {
      empresas: (emp.data as Empresa[]) ?? [],
      recientes: (ext.data as unknown as ExtractoReciente[]) ?? [],
      revision,
      salidasBanco,
    };
  } catch {
    return vacio;
  }
}

export default async function ExtractosPage() {
  const { empresas, recientes, revision, salidasBanco } = await getData();

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <PageHeader
        eyebrow="Cartera"
        title="Conciliación"
        subtitle="Oficina, extracto de Banco General, y la cola de lo que el cruce no pudo aplicar solo."
      />

      {salidasBanco.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Salidas al interior · por cruzar con el banco · {salidasBanco.length}
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Ya hay comprobante y aval (o pago registrado). Al subir el extracto, si el movimiento calza en carro, monto y fecha, se cruza solo. Si no, queda abajo para aplicar a mano.
          </p>
          <div className="divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line">
            {salidasBanco.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{lineaSalidaCruce(s)}</span>
                  <StatusChip tone="warn">pendiente</StatusChip>
                </div>
                <span className="tabular-nums font-semibold">
                  <Money amount={s.monto} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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
          Elige la empresa y sube el PDF de “Últimos movimientos” de Banco General. Lo que calce solo se aplica; lo demás queda en la cola de arriba.
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
