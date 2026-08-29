import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { StatusChip } from "@/components/kit";
import { ventanaAbierta } from "@/lib/cartera/pipeline";
import { accionTomarChat, accionDevolverAgente, enviarRespuestaHumana } from "../actions";

export const dynamic = "force-dynamic";

type Mensaje = {
  id: string;
  direccion: "in" | "out";
  tipo: string;
  texto: string | null;
  media_url: string | null;
  enviado_por: string | null;
  created_at: string;
  signedUrl?: string | null;
};

type Conv = {
  id: string;
  wa_numero: string;
  etiqueta: string | null;
  modo: "agente" | "humano";
  necesita_humano: boolean;
  motivo_escalada: string | null;
  ultimo_entrante_at: string | null;
  contrato_id: string | null;
  cliente: { nombre: string; cedula: string | null } | null;
  vehiculo: { numero: string; empresa: { codigo: string } | null } | null;
};

function hora(iso: string): string {
  return new Date(iso).toLocaleString("es-PA", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

async function getData(id: string) {
  const sb = createServerSupabase();
  const { data: conv } = await sb
    .from("conversaciones")
    .select(
      "id, wa_numero, etiqueta, modo, necesita_humano, motivo_escalada, ultimo_entrante_at, contrato_id, cliente:clientes(nombre, cedula), vehiculo:vehiculos(numero, empresa:empresas(codigo))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!conv) return { conv: null, mensajes: [] as Mensaje[], saldo: null as number | null };

  const { data: msgs } = await sb
    .from("mensajes")
    .select("id, direccion, tipo, texto, media_url, enviado_por, created_at")
    .eq("conversacion_id", id)
    .order("created_at", { ascending: true });

  const mensajes = (msgs as Mensaje[]) ?? [];
  for (const m of mensajes) {
    if (m.media_url) {
      const { data } = await sb.storage.from("comprobantes").createSignedUrl(m.media_url, 3600);
      m.signedUrl = data?.signedUrl ?? null;
    }
  }

  let saldo: number | null = null;
  const contratoId = (conv as unknown as Conv).contrato_id;
  if (contratoId) {
    const { data: s } = await sb
      .from("vw_saldo_contrato")
      .select("saldo_actual")
      .eq("contrato_id", contratoId)
      .maybeSingle();
    saldo = (s as { saldo_actual: number } | null)?.saldo_actual ?? null;
  }

  return { conv: conv as unknown as Conv, mensajes, saldo };
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

  const carro = conv.vehiculo
    ? `${conv.vehiculo.empresa?.codigo ? conv.vehiculo.empresa.codigo + " · " : ""}Carro ${conv.vehiculo.numero}`
    : conv.etiqueta ?? "Sin carro asignado";
  const abierta = ventanaAbierta(conv.ultimo_entrante_at);
  const esHumano = conv.modo === "humano";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
      <Link href="/cartera/conversaciones" className="text-sm text-muted hover:text-ink">← Conversaciones</Link>

      {/* Cabecera */}
      <div className="mt-4 rounded-2xl bg-surface p-5 ring-1 ring-line/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{carro}</h1>
              {esHumano ? (
                <StatusChip tone="warn">🙋 Lo llevas tú</StatusChip>
              ) : (
                <StatusChip tone="good">Agente activo</StatusChip>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              {conv.cliente?.nombre ?? "Cliente sin vincular"}
              {conv.cliente?.cedula ? ` · ${conv.cliente.cedula}` : ""} · +{conv.wa_numero}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Saldo contrato</p>
            <p className="text-lg font-semibold tabular-nums">
              {saldo != null ? `$${saldo.toLocaleString("es-PA", { minimumFractionDigits: 2 })}` : "—"}
            </p>
          </div>
        </div>

        {/* Escalada */}
        {conv.necesita_humano && (
          <div className="mt-3 rounded-xl bg-warn/5 px-4 py-3 text-sm ring-1 ring-warn/30">
            🔔 <b>Necesita respuesta.</b> {conv.motivo_escalada ? `Motivo: ${conv.motivo_escalada}` : "Un mensaje del cliente está esperando."}
          </div>
        )}

        {/* Control: tomar / devolver */}
        <div className="mt-4 flex items-center gap-2">
          {esHumano ? (
            <form action={accionDevolverAgente}>
              <input type="hidden" name="conversacion_id" value={conv.id} />
              <button className="rounded-lg bg-surface px-4 py-2 text-sm font-medium text-ink ring-1 ring-line transition hover:bg-paper">
                ↩︎ Devolver al agente
              </button>
            </form>
          ) : (
            <form action={accionTomarChat}>
              <input type="hidden" name="conversacion_id" value={conv.id} />
              <button className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90">
                🙋 Tomar chat
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Hilo */}
      <div className="mt-6 space-y-3">
        {mensajes.map((m) => {
          const out = m.direccion === "out";
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ring-1 ${
                  m.tipo === "system"
                    ? "bg-crit/5 text-crit ring-crit/20"
                    : out
                      ? "bg-ink text-paper ring-ink"
                      : "bg-surface text-ink ring-line/60"
                }`}
              >
                {m.signedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.signedUrl} alt="Comprobante" className="mb-2 max-h-64 rounded-lg" />
                )}
                {m.texto && <p className="whitespace-pre-wrap">{m.texto}</p>}
                <p className={`mt-1 text-right font-mono text-[10px] ${out ? "text-paper/60" : "text-muted"}`}>
                  {out && m.enviado_por ? `${m.enviado_por} · ` : ""}
                  {hora(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        {mensajes.length === 0 && <p className="py-10 text-center text-muted">Sin mensajes todavía.</p>}
      </div>

      {/* Caja de responder */}
      <div className="mt-6 rounded-2xl bg-surface p-4 ring-1 ring-line/60">
        {!esHumano && (
          <p className="mb-2 text-xs text-muted">
            💡 El agente está manejando este chat. Dale <b>“Tomar chat”</b> arriba para escribir tú.
          </p>
        )}
        {esHumano && !abierta && (
          <p className="mb-2 rounded-lg bg-warn/5 px-3 py-2 text-xs text-muted ring-1 ring-warn/30">
            ⏳ Ventana de 24h cerrada. El cliente debe escribirte primero para poder responder por texto.
          </p>
        )}
        <form action={enviarRespuestaHumana} className="flex items-end gap-2">
          <input type="hidden" name="conversacion_id" value={conv.id} />
          <textarea
            name="texto"
            rows={2}
            placeholder={esHumano ? "Escribe tu respuesta…" : "Toma el chat para escribir"}
            disabled={!esHumano || !abierta}
            className="flex-1 resize-none rounded-xl bg-paper px-4 py-2.5 text-sm ring-1 ring-line/60 focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-50"
          />
          <button
            disabled={!esHumano || !abierta}
            className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-40"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
