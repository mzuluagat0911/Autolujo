import { PageHeader, PageShell } from "@/components/kit";
import { createServerSupabase } from "@/lib/supabase/server";
import { salidasPendientesBanco } from "@/lib/cartera/salidas-aplicar";
import { ExtractosTabs } from "./tabs";
import { type MovimientoRevision, type CandidatoPago, type CruceAplicado } from "./cola";
import { carroAtribuible, fechaCubrePago, montoExacto, numeroCarroOperativo } from "@/lib/cartera/cruce";
import { siglaEmpresa } from "@/lib/cartera/empresa";

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
  aplicados: CruceAplicado[];
  salidasBanco: Awaited<ReturnType<typeof salidasPendientesBanco>>;
}> {
  const vacio = {
    empresas: [] as Empresa[],
    recientes: [] as ExtractoReciente[],
    revision: [] as MovimientoRevision[],
    aplicados: [] as CruceAplicado[],
    salidasBanco: [] as Awaited<ReturnType<typeof salidasPendientesBanco>>,
  };
  try {
    const sb = createServerSupabase();
    const [emp, ext, mov, aplicadosRaw, salidasBanco] = await Promise.all([
      sb.from("empresas").select("id, codigo, nombre").order("codigo"),
      sb
        .from("extractos_bancarios")
        .select("id, fecha, cargado_por, created_at, empresa:empresas(codigo)")
        .order("created_at", { ascending: false })
        .limit(12),
      sb
        .from("movimientos_extracto")
        .select(
          "id, fecha, monto, descripcion, referencia, numero_carro, nombre_detectado, motivo, via, contrato_id, extracto:extractos_bancarios(empresa:empresas(codigo)), contrato:contratos(cliente:clientes(nombre), vehiculo:vehiculos(numero))",
        )
        .eq("estado", "revisar")
        .order("fecha", { ascending: false })
        .limit(80),
      sb
        .from("movimientos_extracto")
        .select("id, fecha, monto, numero_carro, estado, extracto:extractos_bancarios(empresa:empresas(codigo))")
        .in("estado", ["aplicado", "parcial"])
        .order("created_at", { ascending: false })
        .limit(8),
      salidasPendientesBanco(),
    ]);
    const revision: MovimientoRevision[] = ((mov.data ?? []) as unknown as {
      id: string;
      fecha: string | null;
      monto: number;
      descripcion: string | null;
      referencia: string | null;
      numero_carro: string | null;
      nombre_detectado: string | null;
      motivo: string | null;
      via: string | null;
      contrato_id: string | null;
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
      referencia: m.referencia,
      numeroCarro: m.numero_carro,
      nombreDetectado: m.nombre_detectado,
      motivo: m.motivo,
      via: m.via,
      sugeridoCarro: m.contrato?.vehiculo?.numero ?? m.numero_carro,
      sugeridoCliente: m.contrato?.cliente?.nombre ?? null,
      empresa: m.extracto?.empresa?.codigo ?? null,
      contratoId: m.contrato_id,
      salidaHint: null as string | null,
      candidatos: [] as CandidatoPago[],
    }));

    const aplicados: CruceAplicado[] = ((aplicadosRaw.data ?? []) as unknown as {
      id: string;
      fecha: string | null;
      monto: number;
      numero_carro: string | null;
      estado: string;
      extracto: { empresa: { codigo: string } | null } | null;
    }[]).map((m) => ({
      id: m.id,
      fecha: m.fecha,
      monto: Number(m.monto),
      numeroCarro: m.numero_carro,
      estado: m.estado,
      empresa: m.extracto?.empresa?.codigo ?? null,
    }));

    const { data: pend } = await sb
      .from("pagos")
      .select("id, monto, pagado_at, numero_carro, referencia, contrato_id, contrato:contratos(vehiculo:vehiculos(empresa:empresas(codigo)))")
      .eq("estado_conciliacion", "pendiente")
      .eq("origen", "comprobante")
      .limit(300);
    const pendientes = (pend ?? []) as unknown as {
      id: string;
      monto: number;
      pagado_at: string;
      numero_carro: string | null;
      referencia: string | null;
      contrato_id: string | null;
      contrato: { vehiculo: { empresa: { codigo: string } | null } | null } | null;
    }[];
    for (const r of revision) {
      if (!r.fecha) continue;
      const idsMotivo =
        /\[ids:([^\]]+)\]/
          .exec(r.motivo ?? "")?.[1]
          ?.split(",")
          .map((s) => s.trim()) ?? [];
      const carro = numeroCarroOperativo(r.sugeridoCarro || r.numeroCarro);
      const empR = siglaEmpresa(r.empresa);
      r.candidatos = pendientes
        .filter((p) => {
          if (idsMotivo.length > 0) return idsMotivo.includes(p.id);
          if (!montoExacto(Number(p.monto), r.monto) || !fechaCubrePago(p.pagado_at, r.fecha!)) return false;
          if (r.contratoId && p.contrato_id === r.contratoId) return true;
          const empP = siglaEmpresa(p.contrato?.vehiculo?.empresa?.codigo);
          if (empP && empR && empP !== empR) return false;
          const leido = numeroCarroOperativo(p.numero_carro);
          return Boolean(carro && leido && carroAtribuible(leido, carro));
        })
        .map((p) => ({
          id: p.id,
          monto: Number(p.monto),
          numeroCarro: numeroCarroOperativo(p.numero_carro) ?? p.numero_carro,
          pagadoAt: p.pagado_at,
          referencia: p.referencia,
          empresa: p.contrato?.vehiculo?.empresa?.codigo ?? r.empresa,
        }));
    }

    for (const r of revision) {
      const hit = salidasBanco.find(
        (s) =>
          Math.round(s.monto * 100) === Math.round(r.monto * 100) &&
          (!r.sugeridoCarro || !s.numero || r.sugeridoCarro === s.numero),
      );
      if (hit)
        r.salidaHint = `Calza con salida a ${hit.destino}${hit.numero ? ` · carro ${hit.numero}` : ""} · pendiente por conciliar`;
    }
    return {
      empresas: (emp.data as Empresa[]) ?? [],
      recientes: (ext.data as unknown as ExtractoReciente[]) ?? [],
      revision,
      aplicados,
      salidasBanco,
    };
  } catch {
    return vacio;
  }
}

export default async function ExtractosPage() {
  const { empresas, recientes, revision, aplicados, salidasBanco } = await getData();

  return (
    <PageShell>
      <PageHeader
        eyebrow="Cartera"
        title="Conciliación"
        subtitle="Oficina, extracto de Banco General, y la cola de lo que el cruce no pudo aplicar solo."
      />
      <ExtractosTabs
        empresas={empresas}
        recientes={recientes}
        revision={revision}
        aplicados={aplicados}
        salidasBanco={salidasBanco}
      />
    </PageShell>
  );
}
