import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, StatusChip } from "@/components/kit";

export const dynamic = "force-dynamic";

type Conversacion = {
  id: string;
  wa_numero: string;
  etiqueta: string | null;
  ultimo_texto: string | null;
  ultimo_mensaje_at: string | null;
  no_leidos: number;
  estado: string;
  modo: "agente" | "humano";
  necesita_humano: boolean;
  cliente: { nombre: string } | null;
  vehiculo: { numero: string; empresa: { codigo: string } | null } | null;
};

function tiempo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-PA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function getData() {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("conversaciones")
      .select(
        "id, wa_numero, etiqueta, ultimo_texto, ultimo_mensaje_at, no_leidos, estado, modo, necesita_humano, cliente:clientes(nombre), vehiculo:vehiculos(numero, empresa:empresas(codigo))",
      )
      .order("necesita_humano", { ascending: false })
      .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return { convs: (data as unknown as Conversacion[]) ?? [], error: null as string | null };
  } catch (e) {
    return { convs: [], error: e instanceof Error ? e.message : "Error" };
  }
}

export default async function ConversacionesPage() {
  const { convs, error } = await getData();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <PageHeader
        eyebrow="Cartera"
        title="Conversaciones"
        subtitle="Los chats del agente con cada arrendatario, etiquetados por carro. Aquí el equipo ve y controla todo."
      />

      <h2 className="mt-8 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {convs.length} conversación{convs.length === 1 ? "" : "es"}
      </h2>

      {error ? (
        <p className="mt-4 rounded-xl bg-surface p-4 font-mono text-xs text-muted ring-1 ring-line/60">{error}</p>
      ) : (
        <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line/60">
          {convs.map((c) => {
            const titulo = c.vehiculo
              ? `${c.vehiculo.empresa?.codigo ? c.vehiculo.empresa.codigo + " · " : ""}Carro ${c.vehiculo.numero}`
              : c.etiqueta ?? "Sin carro asignado";
            const tieneCarro = Boolean(c.vehiculo || c.etiqueta);
            return (
              <Link
                key={c.id}
                href={`/cartera/conversaciones/${c.id}`}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-paper/60"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs font-bold text-paper">
                  {tieneCarro ? "🚗" : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{titulo}</span>
                    {c.cliente?.nombre && (
                      <span className="truncate text-sm text-muted">· {c.cliente.nombre}</span>
                    )}
                    {c.necesita_humano && <StatusChip tone="warn">🔔 Necesita respuesta</StatusChip>}
                    {c.modo === "humano" && !c.necesita_humano && (
                      <StatusChip tone="neutral">🙋 Humano</StatusChip>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted">{c.ultimo_texto ?? "—"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-[11px] text-muted">{tiempo(c.ultimo_mensaje_at)}</span>
                </div>
              </Link>
            );
          })}
          {convs.length === 0 && (
            <p className="px-5 py-10 text-center text-muted">
              Aún no hay conversaciones. Cuando un cliente escriba al WhatsApp, aparecerá aquí.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
