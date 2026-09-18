import { PageHeader, PageShell } from "@/components/kit";
import { createServerSupabase } from "@/lib/supabase/server";
import { HojaVidaLista, type FilaHojaVida } from "./lista";

export const dynamic = "force-dynamic";

async function listarFlota(): Promise<{ filas: FilaHojaVida[]; error: string | null }> {
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

    const filas: FilaHojaVida[] = ((vehs ?? []) as unknown as {
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
      .sort((a, b) => {
        if ((b.eventos > 0) !== (a.eventos > 0)) return b.eventos > 0 ? 1 : -1;
        return String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true });
      });

    return { filas, error: null };
  } catch (e) {
    return {
      filas: [],
      error: e instanceof Error ? e.message : "Error",
    };
  }
}

export default async function HojaVidaIndexPage() {
  const { filas, error } = await listarFlota();
  const conEventos = filas.filter((f) => f.eventos > 0).length;

  return (
    <PageShell>
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
      <HojaVidaLista filas={filas} error={error} />
    </PageShell>
  );
}
