import Link from "next/link";
import { PageHeader, EmptyState, StatusChip } from "@/components/kit";
import { createServerSupabase } from "@/lib/supabase/server";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

export const dynamic = "force-dynamic";

type Fila = {
  id: string;
  numero: string;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  estado: string;
  empresa: { codigo: string } | null;
  eventos: number;
  ultimo: string | null;
};

async function listarFlota(q: string): Promise<{ filas: Fila[]; error: string | null; tablaOk: boolean }> {
  try {
    const sb = createServerSupabase();
    const { data: vehs, error } = await sb
      .from("vehiculos")
      .select("id, numero, placa, marca, modelo, anio, estado, empresa:empresas(codigo)")
      .neq("estado", "entregado")
      .order("numero");
    if (error) throw error;

    const ids = (vehs ?? []).map((v) => v.id);
    const conteo = new Map<string, { n: number; ultimo: string | null }>();

    if (ids.length > 0) {
      // PostgREST limita a 1000 filas: hay que paginar o la mayoría de carros
      // aparecen con 0 eventos aunque la bitácora sí esté cargada.
      const pageSize = 1000;
      let from = 0;
      for (;;) {
        const { data: evs, error: e2 } = await sb
          .from("vehiculo_eventos")
          .select("vehiculo_id, fecha")
          .in("vehiculo_id", ids)
          .range(from, from + pageSize - 1);
        if (e2) {
          if (/vehiculo_eventos|does not exist|schema cache/i.test(e2.message)) break;
          throw e2;
        }
        const batch = evs ?? [];
        for (const e of batch) {
          const cur = conteo.get(e.vehiculo_id) ?? { n: 0, ultimo: null };
          cur.n += 1;
          if (!cur.ultimo || e.fecha > cur.ultimo) cur.ultimo = e.fecha;
          conteo.set(e.vehiculo_id, cur);
        }
        if (batch.length < pageSize) break;
        from += pageSize;
      }
    }

    const needle = q.trim().toLowerCase();
    const filas: Fila[] = ((vehs ?? []) as unknown as {
      id: string;
      numero: string;
      placa: string | null;
      marca: string | null;
      modelo: string | null;
      anio: number | null;
      estado: string;
      empresa: { codigo: string } | null;
    }[])
      .map((v) => {
        const c = conteo.get(v.id);
        return {
          id: v.id,
          numero: v.numero,
          placa: v.placa,
          marca: v.marca,
          modelo: v.modelo,
          anio: v.anio,
          estado: v.estado,
          empresa: v.empresa,
          eventos: c?.n ?? 0,
          ultimo: c?.ultimo ?? null,
        };
      })
      .filter((v) => {
        if (!needle) return true;
        const blob = [
          v.numero,
          v.placa,
          v.marca,
          v.modelo,
          v.empresa?.codigo,
          etiquetaCarroUi(v.empresa?.codigo, v.numero),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(needle);
      })
      .sort((a, b) => {
        // Con eventos primero, luego por número
        if ((b.eventos > 0) !== (a.eventos > 0)) return b.eventos > 0 ? 1 : -1;
        return String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true });
      });

    return { filas, error: null, tablaOk: true };
  } catch (e) {
    return {
      filas: [],
      error: e instanceof Error ? e.message : "Error",
      tablaOk: false,
    };
  }
}

export default async function HojaVidaIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const { filas, error } = await listarFlota(q);
  const conEventos = filas.filter((f) => f.eventos > 0).length;

  return (
    <div className="mx-auto max-w-5xl py-10">
      <PageHeader
        eyebrow="Operaciones"
        title="Hoja de vida"
        subtitle="Historial del carro: mantenimientos, revisiones, chapistería y entregas. Editable."
        action={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Con historial
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{conEventos}</p>
          </div>
        }
      />

      <form className="mt-2 mb-6" method="get">
        <label className="flex flex-col gap-1.5 sm:max-w-sm">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Buscar carro
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Número, placa, marca…"
            className="rounded-lg bg-surface px-3 py-2.5 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink/20"
          />
        </label>
      </form>

      {error ? (
        <EmptyState
          title="No se pudo cargar la flota"
          hint={error}
        />
      ) : filas.length === 0 ? (
        <EmptyState
          title="Ningún carro coincide"
          hint="Probá otro número o placa."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Carro</th>
                <th className="px-4 py-3 font-medium">Placa</th>
                <th className="px-4 py-3 font-medium">Ficha</th>
                <th className="px-4 py-3 font-medium">Eventos</th>
                <th className="px-4 py-3 font-medium">Último</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {etiquetaCarroUi(f.empresa?.codigo, f.numero)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">{f.placa ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {[f.marca, f.modelo, f.anio].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {f.eventos > 0 ? (
                      <StatusChip tone="azul">{f.eventos}</StatusChip>
                    ) : (
                      <span className="text-faint">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">{f.ultimo ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/operaciones/hoja-vida/${f.id}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
