// Deudas de contratos CERRADOS (ex-clientes): entregaron el carro debiendo y se
// les sigue cobrando el saldo. No tienen cuota diaria; solo la deuda pendiente.

import { unstable_cache } from "next/cache";
import { leerCasoArchivado } from "@/lib/cartera/archivo-caso";
import { createServerSupabase } from "@/lib/supabase/server";

export type DeudaCerrada = {
  contratoId: string;
  clienteId: string | null;
  clienteNombre: string;
  vehiculoNumero: string;
  empresa: string | null;
  estado: string;
  saldo: number;
  motivo: string | null;
};

async function leerDeudasCerradas(): Promise<DeudaCerrada[]> {
  const sb = createServerSupabase();

  const { data: contratos } = await sb
    .from("contratos")
    .select("id, estado, cliente_id, cliente:clientes(nombre), vehiculo:vehiculos(numero, empresa:empresas(codigo))")
    .neq("estado", "activo");

  const filas = (contratos ?? []) as unknown as {
    id: string; estado: string; cliente_id: string | null;
    cliente: { nombre: string } | null;
    vehiculo: { numero: string; empresa: { codigo: string } | null } | null;
  }[];
  if (filas.length === 0) return [];

  const ids = filas.map((f) => f.id);
  const { data: saldos } = await sb
    .from("vw_saldo_contrato")
    .select("contrato_id, saldo_actual")
    .in("contrato_id", ids);
  const saldoMap = new Map(
    ((saldos ?? []) as { contrato_id: string; saldo_actual: number | null }[]).map((s) => [s.contrato_id, Number(s.saldo_actual ?? 0)]),
  );

  const motivos = new Map<string, string>();
  for (let desde = 0; ; desde += 1000) {
    const { data: eventos } = await sb
      .from("vehiculo_eventos")
      .select("detalle, created_at")
      .like("detalle", "caso-archivado:%")
      .order("created_at", { ascending: false })
      .range(desde, desde + 999);
    const lote = (eventos ?? []) as { detalle: string }[];
    for (const ev of lote) {
      const caso = leerCasoArchivado(ev.detalle);
      if (!caso?.motivo || motivos.has(caso.contratoId)) continue;
      motivos.set(caso.contratoId, caso.motivo);
    }
    if (lote.length < 1000) break;
  }

  return filas
    .map((f) => ({
      contratoId: f.id,
      clienteId: f.cliente_id,
      clienteNombre: f.cliente?.nombre ?? "Sin nombre",
      vehiculoNumero: f.vehiculo?.numero ?? "—",
      empresa: f.vehiculo?.empresa?.codigo ?? null,
      estado: f.estado,
      saldo: saldoMap.get(f.id) ?? 0,
      motivo: motivos.get(f.id) ?? null,
    }))
    .filter((d) => d.saldo > 0.009)
    .sort((a, b) => b.saldo - a.saldo);
}

const deudasEnCache = unstable_cache(leerDeudasCerradas, ["deudas-cerradas-v2"], {
  revalidate: 60 * 10,
  tags: ["extracto-dia"],
});

export function deudasCerradas(): Promise<DeudaCerrada[]> {
  return deudasEnCache();
}
