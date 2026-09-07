import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/kit";
import { salidasDePagos } from "@/lib/cartera/salidas-aplicar";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { ListaComprobantes, type ContratoOpt, type PagoFila } from "./lista";

export const dynamic = "force-dynamic";

function esPorRevisar(p: {
  estado_conciliacion: string;
  origen?: string | null;
}): boolean {
  if (p.estado_conciliacion === "pendiente") return true;
  if (p.estado_conciliacion === "manual" && p.origen !== "manual") return true;
  return false;
}

async function getData() {
  try {
    const sb = createServerSupabase();
    const [pagosRes, contratosRes] = await Promise.all([
      sb
        .from("pagos")
        .select(
          "id, fecha, monto, banco, referencia, numero_carro, estado_conciliacion, origen, contrato_id, comprobante_url, notas, created_at, rubro, destino_interior, contrato:contratos(id, cliente:clientes(nombre), vehiculo:vehiculos(numero, empresa:empresas(codigo)))",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      sb
        .from("contratos")
        .select("id, cliente:clientes(nombre), vehiculo:vehiculos(numero, empresa:empresas(codigo))")
        .eq("estado", "activo")
        .limit(400),
    ]);

    let rows = pagosRes.data;
    let error = pagosRes.error;
    if (error && /rubro|destino_interior|origen|contrato/i.test(error.message)) {
      const retry = await sb
        .from("pagos")
        .select(
          "id, fecha, monto, banco, referencia, numero_carro, estado_conciliacion, origen, contrato_id, comprobante_url, notas, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (retry.error) throw retry.error;
      rows = retry.data as typeof pagosRes.data;
      error = null;
    }
    if (error) throw error;

    type Raw = {
      id: string;
      fecha: string | null;
      monto: number;
      banco: string | null;
      referencia: string | null;
      numero_carro: string | null;
      estado_conciliacion: string;
      origen?: string | null;
      contrato_id?: string | null;
      comprobante_url: string | null;
      notas: string | null;
      created_at: string;
      rubro?: string | null;
      destino_interior?: string | null;
      contrato?: {
        id: string;
        cliente: { nombre: string } | null;
        vehiculo: { numero: string; empresa: { codigo: string } | null } | null;
      } | null;
    };

    const raw = (rows ?? []) as unknown as Raw[];
    const salidas = await salidasDePagos(raw.map((p) => p.id));
    const pendientes: PagoFila[] = [];

    for (const p of raw) {
      if (!esPorRevisar(p)) continue;
      let signedUrl: string | null = null;
      if (p.comprobante_url) {
        const { data: s } = await sb.storage.from("comprobantes").createSignedUrl(p.comprobante_url, 3600);
        signedUrl = s?.signedUrl ?? null;
      }
      const carroResuelto = p.contrato?.vehiculo?.numero ?? p.numero_carro ?? null;
      const contratoLabel = p.contrato
        ? `${etiquetaCarroUi(p.contrato.vehiculo?.empresa?.codigo, p.contrato.vehiculo?.numero)} · ${p.contrato.cliente?.nombre ?? ""}`
        : null;
      pendientes.push({
        id: p.id,
        fecha: p.fecha,
        monto: Number(p.monto),
        banco: p.banco,
        referencia: p.referencia,
        numero_carro: p.numero_carro,
        carroResuelto,
        estado_conciliacion: p.estado_conciliacion,
        origen: p.origen,
        contrato_id: p.contrato_id ?? p.contrato?.id ?? null,
        contratoLabel,
        comprobante_url: p.comprobante_url,
        notas: p.notas,
        created_at: p.created_at,
        rubro: p.rubro,
        destino_interior: p.destino_interior,
        signedUrl,
        salida: salidas.get(p.id) ?? null,
        alertaCuenta: /ALERTAS:.*cuenta/i.test(p.notas ?? ""),
      });
    }

    const contratos: ContratoOpt[] = ((contratosRes.data ?? []) as unknown as {
      id: string;
      cliente: { nombre: string } | null;
      vehiculo: { numero: string; empresa: { codigo: string } | null } | null;
    }[]).map((c) => ({
      id: c.id,
      label: `${etiquetaCarroUi(c.vehiculo?.empresa?.codigo, c.vehiculo?.numero)} · ${c.cliente?.nombre ?? "sin nombre"}`,
    }));

    return { pendientes, contratos, error: null as string | null };
  } catch (e) {
    return {
      pendientes: [] as PagoFila[],
      contratos: [] as ContratoOpt[],
      error: e instanceof Error ? e.message : "Error",
    };
  }
}

export default async function PagosPage() {
  const { pendientes, contratos, error } = await getData();
  const esperando = pendientes.filter((p) => !p.alertaCuenta && p.contrato_id).length;
  const alertas = pendientes.filter((p) => p.alertaCuenta).length;

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <PageHeader
        eyebrow="Cartera"
        title="Comprobantes"
        subtitle={`${esperando} esperando banco · ${alertas} con alerta · el cruce bancario vive en Conciliación.`}
        action={
          <Link
            href="/cartera/extractos"
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
          >
            Ir a Conciliación
          </Link>
        }
      />

      {error && (
        <p className="mt-6 rounded-lg bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line">{error}</p>
      )}

      <div className="mt-6">
        {pendientes.length === 0 && !error ? (
          <p className="rounded-xl bg-surface px-5 py-10 text-center text-sm text-muted ring-1 ring-line">
            Nada pendiente. Los comprobantes de WhatsApp aparecen aquí hasta que el extracto los cruce.
          </p>
        ) : (
          <ListaComprobantes pendientes={pendientes} contratos={contratos} />
        )}
      </div>
    </div>
  );
}
