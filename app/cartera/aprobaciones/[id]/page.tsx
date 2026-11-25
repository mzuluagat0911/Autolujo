import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageShell, StatusChip } from "@/components/kit";
import { AltaContratoForm } from "@/app/cartera/clientes/alta-contrato";
import { listarCarrosLibres, type CarroLibre } from "@/app/cartera/clientes/actions";
import { hoyPanama } from "@/lib/cartera/fecha";
import { obtenerSolicitudContrato } from "@/lib/cartera/solicitudes-contrato";
import { createServerSupabase } from "@/lib/supabase/server";
import { aprobarSolicitudDesdeForm } from "../actions";
import { RechazarSolicitud } from "./rechazar";

export const dynamic = "force-dynamic";

async function carroDeSolicitud(vehiculoId: string | null): Promise<CarroLibre | null> {
  if (!vehiculoId) return null;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("vehiculos")
    .select(
      "id, numero, placa, marca, modelo, anio, estado, chasis, numero_motor, tipo, color, empresa:empresas(codigo)",
    )
    .eq("id", vehiculoId)
    .maybeSingle();
  if (!data) return null;
  const v = data as {
    id: string;
    numero: string;
    placa: string | null;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
    estado: string;
    chasis: string | null;
    numero_motor: string | null;
    tipo: string | null;
    color: string | null;
    empresa: { codigo: string } | { codigo: string }[] | null;
  };
  const emp = Array.isArray(v.empresa) ? v.empresa[0] : v.empresa;
  const sigla = emp?.codigo ?? "";
  const base = sigla ? `${sigla} · ${v.numero}` : v.numero;
  return {
    id: v.id,
    label: `${base}${v.placa ? ` · ${v.placa}` : ""} (${v.estado})`,
    placa: v.placa,
    marca: v.marca,
    modelo: v.modelo,
    anio: v.anio,
    chasis: v.chasis,
    numeroMotor: v.numero_motor,
    tipo: v.tipo,
    color: v.color,
  };
}

function chipEstado(estado: string) {
  if (estado === "pendiente") return <StatusChip tone="warn">Pendiente</StatusChip>;
  if (estado === "aprobada") return <StatusChip tone="good">Aprobada</StatusChip>;
  if (estado === "rechazada") return <StatusChip tone="crit">Rechazada</StatusChip>;
  return <StatusChip tone="neutral">Cancelada</StatusChip>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

export default async function DetalleAprobacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { fila, error } = await obtenerSolicitudContrato(id);
  if (error && !fila) {
    return (
      <PageShell>
        <PageHeader eyebrow="Cartera" title="Solicitud" subtitle={error} />
        <Link href="/cartera/aprobaciones" className="mt-6 inline-block text-sm text-muted hover:text-ink">
          ← Volver
        </Link>
      </PageShell>
    );
  }
  if (!fila) notFound();

  const libres = await listarCarrosLibres();
  const propio = await carroDeSolicitud(fila.vehiculoId);
  const carros =
    propio && !libres.some((c) => c.id === propio.id) ? [propio, ...libres] : libres;

  const pendiente = fila.estado === "pendiente";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Cartera · Aprobaciones"
        title={fila.nombre}
        subtitle={
          pendiente
            ? "Revisá o ajustá los datos. Al aprobar se crea el cliente y el contrato."
            : "Esta solicitud ya está cerrada."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {chipEstado(fila.estado)}
            <Link
              href="/cartera/aprobaciones"
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface-2"
            >
              Lista
            </Link>
          </div>
        }
      />

      {sp.aviso && (
        <p className="mt-4 rounded-lg bg-ambar-wash px-4 py-3 text-sm text-ink ring-1 ring-ambar/40">
          {sp.aviso}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Meta label="Quién pide" value={fila.solicitanteNombre || "—"} />
        <Meta
          label="Carro"
          value={[fila.empresaCodigo, fila.carroNumero].filter(Boolean).join(" ") || "—"}
        />
        <Meta
          label="Creada"
          value={fila.createdAt ? new Date(fila.createdAt).toLocaleString("es-PA") : "—"}
        />
      </div>

      {fila.estado === "rechazada" && fila.motivoRechazo && (
        <p className="mt-4 rounded-xl bg-rojo-wash px-4 py-3 text-sm text-rojo ring-1 ring-rojo/30">
          Rechazo: {fila.motivoRechazo}
        </p>
      )}

      {fila.estado === "aprobada" && fila.clienteId && (
        <p className="mt-4 text-sm text-muted">
          Contrato creado.{" "}
          <Link href={`/cartera/clientes/${fila.clienteId}`} className="font-medium text-ink underline">
            Ver cliente
          </Link>
        </p>
      )}

      {pendiente ? (
        <div className="mt-8 space-y-8">
          <AltaContratoForm
            carros={carros}
            fechaHoy={hoyPanama()}
            iniciales={fila.payload}
            puedeCobrar
            submitLabel="Aprobar y crear contrato"
            submittingLabel="Aprobando…"
            action={aprobarSolicitudDesdeForm}
            extras={<input type="hidden" name="solicitud_id" value={fila.id} />}
          />
          <div className="border-t border-line pt-6">
            <RechazarSolicitud solicitudId={fila.id} />
          </div>
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted">No se puede editar una solicitud cerrada.</p>
      )}
    </PageShell>
  );
}
