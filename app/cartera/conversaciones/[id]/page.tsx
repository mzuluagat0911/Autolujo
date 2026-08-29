import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { StatusChip } from "@/components/kit";

export const dynamic = "force-dynamic";

type Mensaje = {
  id: string;
  direccion: "in" | "out";
  tipo: string;
  texto: string | null;
  media_url: string | null;
  created_at: string;
  signedUrl?: string | null;
};

function hora(iso: string): string {
  return new Date(iso).toLocaleString("es-PA", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

async function getData(id: string) {
  const sb = createServerSupabase();
  const { data: conv, error: e1 } = await sb
    .from("conversaciones")
    .select(
      "id, wa_numero, etiqueta, cliente:clientes(nombre, cedula), vehiculo:vehiculos(numero, empresa:empresas(codigo)), contrato_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (e1 || !conv) return { conv: null, mensajes: [] as Mensaje[], saldo: null as number | null };

  const { data: msgs } = await sb
    .from("mensajes")
    .select("id, direccion, tipo, texto, media_url, created_at")
    .eq("conversacion_id", id)
    .order("created_at", { ascending: true });

  const mensajes = (msgs as Mensaje[]) ?? [];
  // Firmar las imágenes de comprobantes (bucket privado).
  for (const m of mensajes) {
    if (m.media_url) {
      const { data } = await sb.storage.from("comprobantes").createSignedUrl(m.media_url, 3600);
      m.signedUrl = data?.signedUrl ?? null;
    }
  }

  // Saldo del contrato activo (si hay).
  let saldo: number | null = null;
  const contratoId = (conv as { contrato_id: string | null }).contrato_id;
  if (contratoId) {
    const { data: s } = await sb
      .from("vw_saldo_contrato")
      .select("saldo")
      .eq("contrato_id", contratoId)
      .maybeSingle();
    saldo = (s as { saldo: number } | null)?.saldo ?? null;
  }

  return { conv: conv as Record<string, unknown>, mensajes, saldo };
}

export default async function ConversacionDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { conv, mensajes, saldo } = await getData(id);

  if (!conv) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/cartera/conversaciones" className="text-sm text-muted hover:text-ink">← Conversaciones</Link>
        <p className="mt-6 text-muted">No se encontró la conversación.</p>
      </div>
    );
  }

  const vehiculo = conv.vehiculo as { numero: string; empresa: { codigo: string } | null } | null;
  const cliente = conv.cliente as { nombre: string; cedula: string | null } | null;
  const carro = vehiculo
    ? `${vehiculo.empresa?.codigo ? vehiculo.empresa.codigo + " · " : ""}Carro ${vehiculo.numero}`
    : (conv.etiqueta as string | null) ?? "Sin carro asignado";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
      <Link href="/cartera/conversaciones" className="text-sm text-muted hover:text-ink">← Conversaciones</Link>

      {/* Cabecera con carro / cliente / saldo */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-5 ring-1 ring-line/60">
        <div>
          <h1 className="text-lg font-semibold">{carro}</h1>
          <p className="text-sm text-muted">
            {cliente?.nombre ?? "Cliente sin vincular"}
            {cliente?.cedula ? ` · ${cliente.cedula}` : ""} · +{conv.wa_numero as string}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Saldo contrato</p>
          <p className="text-lg font-semibold tabular-nums">
            {saldo != null ? `$${saldo.toLocaleString("es-PA", { minimumFractionDigits: 2 })}` : "—"}
          </p>
        </div>
      </div>

      {/* Hilo de mensajes */}
      <div className="mt-6 space-y-3">
        {mensajes.map((m) => {
          const out = m.direccion === "out";
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ring-1 ${
                  out ? "bg-ink text-paper ring-ink" : "bg-surface text-ink ring-line/60"
                }`}
              >
                {m.signedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.signedUrl} alt="Comprobante" className="mb-2 max-h-64 rounded-lg" />
                )}
                {m.texto && <p className="whitespace-pre-wrap">{m.texto}</p>}
                <p className={`mt-1 text-right font-mono text-[10px] ${out ? "text-paper/60" : "text-muted"}`}>
                  {hora(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        {mensajes.length === 0 && (
          <p className="py-10 text-center text-muted">Sin mensajes todavía.</p>
        )}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <StatusChip tone="neutral">Responder desde aquí — próximamente</StatusChip>
      </div>
    </div>
  );
}
