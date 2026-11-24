import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, PageShell } from "@/components/kit";
import {
  rechazarComprobantesRepetidos,
  restaurarComprobantesMalRechazados,
} from "@/lib/cartera/comprobante-validacion";
import { asegurarPagosDesdeFotosHoy } from "@/lib/cartera/recuperar-comprobantes-hoy";
import { salidasDePagos } from "@/lib/cartera/salidas-aplicar";
import { etiquetaCarroUi, siglaEmpresa } from "@/lib/cartera/empresa";
import ListaComprobantes from "./lista";
import type { ContratoOpt, PagoFila } from "./tipos";

export const dynamic = "force-dynamic";

function esPorRevisar(p: {
  estado_conciliacion: string;
  origen?: string | null;
}): boolean {
  // Solo comprobantes de WhatsApp aún sin desenlace.
  // Los pagos de oficina / Excel (estado manual) ya cuentan en el saldo: no van acá.
  return p.estado_conciliacion === "pendiente";
}

/** Storage acepta de a 100 paths; con más la firma falla y la cola se ve vacía de thumbs. */
async function firmarComprobantes(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const sb = createServerSupabase();
  const TAM = 100;
  for (let i = 0; i < paths.length; i += TAM) {
    const chunk = paths.slice(i, i + TAM);
    const { data } = await sb.storage.from("comprobantes").createSignedUrls(chunk, 3600);
    for (const f of data ?? []) {
      if (f.path && f.signedUrl) out.set(f.path, f.signedUrl);
    }
  }
  return out;
}

async function getData() {
  try {
    const sb = createServerSupabase();
    // Fotos de hoy en el chat sin fila → pago pendiente (sin IA).
    // Los mal rechazados como "repetido" vuelven; luego solo se cortan dups reales.
    try {
      await asegurarPagosDesdeFotosHoy();
    } catch (e) {
      console.error("[pagos] fotos hoy", e);
    }
    await restaurarComprobantesMalRechazados();
    await rechazarComprobantesRepetidos();
    const [pagosRes, contratosRes, exRes] = await Promise.all([
      sb
        .from("pagos")
        .select(
          "id, fecha, monto, banco, referencia, numero_carro, estado_conciliacion, origen, contrato_id, comprobante_url, notas, created_at, rubro, destino_interior, contrato:contratos(id, cliente:clientes(nombre), vehiculo:vehiculos(numero, empresa:empresas(codigo)))",
        )
        .eq("estado_conciliacion", "pendiente")
        .order("created_at", { ascending: false })
        .limit(400),
      sb
        .from("contratos")
        .select("id, estado, cliente:clientes(nombre), vehiculo:vehiculos(numero, empresa:empresas(codigo))")
        .limit(1000),
      // Deuda Excel/manual en cobro: sin esto no salen al anclar (ej. Delgado KW105).
      sb
        .from("ex_clientes")
        .select("id, nombre, carro, saldo, estado, contrato_id, empresa:empresas(codigo)")
        .in("estado", ["cobro", "acuerdo", "pausado"])
        .order("nombre", { ascending: true })
        .limit(1000),
    ]);

    let rows = pagosRes.data;
    let error = pagosRes.error;
    if (error && /rubro|destino_interior|origen|contrato/i.test(error.message)) {
      const retry = await sb
        .from("pagos")
        .select(
          "id, fecha, monto, banco, referencia, numero_carro, estado_conciliacion, origen, contrato_id, comprobante_url, notas, created_at",
        )
        .eq("estado_conciliacion", "pendiente")
        .order("created_at", { ascending: false })
        .limit(400);
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
    const porFirmar = [...new Set(raw.filter((p) => esPorRevisar(p) && p.comprobante_url).map((p) => p.comprobante_url as string))];
    const [salidas, urlPorPath] = await Promise.all([
      salidasDePagos(raw.map((p) => p.id)),
      firmarComprobantes(porFirmar),
    ]);
    const pendientes: PagoFila[] = [];

    for (const p of raw) {
      if (!esPorRevisar(p)) continue;
      const signedUrl = p.comprobante_url ? (urlPorPath.get(p.comprobante_url) ?? null) : null;
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
        empresa: siglaEmpresa(p.contrato?.vehiculo?.empresa?.codigo) || null,
      });
    }

    const contratosIds = new Set(
      ((contratosRes.data ?? []) as { id: string }[]).map((c) => c.id),
    );

    const deContrato: ContratoOpt[] = ((contratosRes.data ?? []) as unknown as {
      id: string;
      estado: string;
      cliente: { nombre: string } | null;
      vehiculo: { numero: string; empresa: { codigo: string } | null } | null;
    }[])
      .map((c) => {
        const activo = c.estado === "activo";
        const carro = etiquetaCarroUi(c.vehiculo?.empresa?.codigo, c.vehiculo?.numero);
        const nombre = c.cliente?.nombre ?? "sin nombre";
        return {
          id: c.id,
          empresa: siglaEmpresa(c.vehiculo?.empresa?.codigo) || null,
          activo,
          grupo: "contrato" as const,
          label: activo ? `${carro} · ${nombre}` : `${carro} · ${nombre} · inactivo`,
        };
      });

    const deEx: ContratoOpt[] = (
      (exRes.error ? [] : (exRes.data ?? [])) as unknown as {
        id: string;
        nombre: string;
        carro: string | null;
        saldo: number;
        contrato_id: string | null;
        empresa: { codigo: string } | null;
      }[]
    )
      .map((x) => {
        // Si ya tiene contrato en el select, no duplicar: se ancla por contrato.
        if (x.contrato_id && contratosIds.has(x.contrato_id)) return null;
        const emp = siglaEmpresa(x.empresa?.codigo) || null;
        const carro = (x.carro ?? "").trim() || "sin carro";
        const saldo = Math.round(Number(x.saldo) || 0);
        // Sin contrato → `ex:` para bajar saldo Excel al confirmar Pago comprobado.
        const id = x.contrato_id && !contratosIds.has(x.contrato_id)
          ? x.contrato_id
          : `ex:${x.id}`;
        return {
          id,
          empresa: emp,
          activo: false,
          grupo: "ex" as const,
          label: `${carro} · ${x.nombre} · ex · $${saldo}`,
        };
      })
      .filter((x): x is ContratoOpt => Boolean(x));

    const contratos: ContratoOpt[] = [...deContrato, ...deEx].sort((a, b) => {
      const ga = a.grupo === "ex" ? 2 : a.activo ? 0 : 1;
      const gb = b.grupo === "ex" ? 2 : b.activo ? 0 : 1;
      if (ga !== gb) return ga - gb;
      return a.label.localeCompare(b.label, "es", { numeric: true, sensitivity: "base" });
    });

    return { pendientes, contratos, error: null as string | null };
  } catch (e) {
    return {
      pendientes: [] as PagoFila[],
      contratos: [] as ContratoOpt[],
      error: e instanceof Error ? e.message : "Error",
    };
  }
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const { pendientes, contratos, error } = await getData();
  const esperando = pendientes.filter((p) => !p.alertaCuenta && p.contrato_id).length;
  const alertas = pendientes.filter((p) => p.alertaCuenta).length;

  return (
    <PageShell>
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

      {aviso && (
        <p className="mt-6 rounded-lg bg-ambar-wash px-4 py-3 text-sm text-ink ring-1 ring-ambar/40">
          {aviso}
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-lg bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line">{error}</p>
      )}

      <div className="mt-6">
        <ListaComprobantes
          pendientes={pendientes}
          contratos={contratos}
          vacio={pendientes.length === 0 && !error}
        />
      </div>
    </PageShell>
  );
}
