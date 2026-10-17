import { createServerSupabase } from "@/lib/supabase/server";
import { metaCobranzaDeMes } from "./metas-cobranza";
import {
  empresaInforme,
  filasDelInforme,
  metaDelInforme,
  type CargoInforme,
  type CarroInforme,
  type FilaInforme,
  type MetaInforme,
  type PagoInforme,
} from "./informe-mes";
import { libroInforme } from "./informe-xlsx";

type Sb = ReturnType<typeof createServerSupabase>;

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function lineas(raw: unknown): { tipo: string; aplicado: number }[] | null {
  if (!raw) return null;
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (Array.isArray(o)) return o as { tipo: string; aplicado: number }[];
  if (o && typeof o === "object" && Array.isArray((o as { asignaciones?: unknown }).asignaciones)) {
    return (o as { asignaciones: { tipo: string; aplicado: number }[] }).asignaciones;
  }
  return null;
}

async function paginas<T>(
  leer: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  const tam = 1000;
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await leer(desde, desde + tam - 1);
    if (error) throw new Error(error.message);
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < tam) break;
  }
  return out;
}

async function contratosActivos(sb: Sb): Promise<CarroInforme[]> {
  const filas = await paginas<Record<string, unknown>>((a, b) =>
    sb
      .from("contratos")
      .select(
        "id, fecha_inicio, vehiculo:vehiculos(numero, empresa:empresas(codigo)), cliente:clientes(nombre)",
      )
      .eq("estado", "activo")
      .range(a, b),
  );
  return filas.map(carroDe).filter((c): c is CarroInforme => Boolean(c));
}

function carroDe(row: Record<string, unknown>): CarroInforme | null {
  const veh = uno(row.vehiculo as { numero?: string | null; empresa?: unknown } | null);
  const emp = uno(veh?.empresa as { codigo?: string | null } | null);
  const cli = uno(row.cliente as { nombre?: string | null } | null);
  const numero = String(veh?.numero ?? "").trim();
  const empresa = empresaInforme(emp?.codigo ?? null);
  if (!numero || !empresa) return null;
  return {
    id: String(row.id),
    numero,
    empresa,
    conductor: String(cli?.nombre ?? "").trim() || "Sin nombre",
    desdeContrato: String(row.fecha_inicio ?? ""),
  };
}

async function contratosPorId(sb: Sb, ids: string[]): Promise<CarroInforme[]> {
  const out: CarroInforme[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const lote = ids.slice(i, i + 80);
    const { data, error } = await sb
      .from("contratos")
      .select("id, fecha_inicio, vehiculo:vehiculos(numero, empresa:empresas(codigo)), cliente:clientes(nombre)")
      .in("id", lote);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const carro = carroDe(row as Record<string, unknown>);
      if (carro) out.push(carro);
    }
  }
  return out;
}

async function cargosEntre(sb: Sb, desde: string | null, hasta: string | null): Promise<CargoInforme[]> {
  const filas = await paginas<Record<string, unknown>>((a, b) => {
    let q = sb.from("cargos").select("contrato_id, fecha, tipo, concepto, concepto_codigo, monto");
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    return q.range(a, b);
  });
  return filas.map((c) => ({
    contratoId: String(c.contrato_id),
    fecha: String(c.fecha).slice(0, 10),
    tipo: String(c.tipo ?? ""),
    concepto: (c.concepto as string | null) ?? null,
    codigo: (c.concepto_codigo as string | null) ?? null,
    monto: Number(c.monto) || 0,
  }));
}

async function pagosEntre(sb: Sb, desde: string | null, hasta: string | null): Promise<PagoInforme[]> {
  const filas = await paginas<Record<string, unknown>>((a, b) => {
    let q = sb
      .from("pagos")
      .select("contrato_id, fecha, monto, metodo, notas, rubro, asignaciones, estado_conciliacion")
      .in("estado_conciliacion", ["conciliado", "manual"]);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    return q.range(a, b);
  });
  return filas
    .filter((p) => p.contrato_id)
    .map((p) => ({
      contratoId: String(p.contrato_id),
      fecha: String(p.fecha).slice(0, 10),
      monto: Number(p.monto) || 0,
      metodo: (p.metodo as string | null) ?? null,
      notas: (p.notas as string | null) ?? null,
      rubro: (p.rubro as string | null) ?? null,
      asignaciones: lineas(p.asignaciones),
    }));
}

async function antesDelMes(sb: Sb, ids: string[], desde: string): Promise<{ cargos: CargoInforme[]; pagos: PagoInforme[] }> {
  const cargos: CargoInforme[] = [];
  const pagos: PagoInforme[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const lote = ids.slice(i, i + 80);
    const [c, p] = await Promise.all([
      paginas<Record<string, unknown>>((a, b) =>
        sb
          .from("cargos")
          .select("contrato_id, fecha, tipo, concepto, concepto_codigo, monto")
          .in("contrato_id", lote)
          .lt("fecha", desde)
          .range(a, b),
      ),
      paginas<Record<string, unknown>>((a, b) =>
        sb
          .from("pagos")
          .select("contrato_id, fecha, monto, metodo, notas, rubro, asignaciones")
          .in("contrato_id", lote)
          .in("estado_conciliacion", ["conciliado", "manual"])
          .lt("fecha", desde)
          .range(a, b),
      ),
    ]);
    for (const row of c) {
      cargos.push({
        contratoId: String(row.contrato_id),
        fecha: String(row.fecha).slice(0, 10),
        tipo: String(row.tipo ?? ""),
        concepto: (row.concepto as string | null) ?? null,
        codigo: (row.concepto_codigo as string | null) ?? null,
        monto: Number(row.monto) || 0,
      });
    }
    for (const row of p) {
      pagos.push({
        contratoId: String(row.contrato_id),
        fecha: String(row.fecha).slice(0, 10),
        monto: Number(row.monto) || 0,
        metodo: (row.metodo as string | null) ?? null,
        notas: (row.notas as string | null) ?? null,
        rubro: (row.rubro as string | null) ?? null,
        asignaciones: lineas(row.asignaciones),
      });
    }
  }
  return { cargos, pagos };
}

export async function datosInforme(desde: string, hasta: string): Promise<{ filas: FilaInforme[]; meta: MetaInforme }> {
  const sb = createServerSupabase();
  const [activos, delMesCargos, delMesPagos, metaRow] = await Promise.all([
    contratosActivos(sb),
    cargosEntre(sb, desde, hasta),
    pagosEntre(sb, desde, hasta),
    metaCobranzaDeMes(hasta),
  ]);
  const porId = new Map(activos.map((c) => [c.id, c]));
  const faltan = new Set<string>();
  for (const c of delMesCargos) if (!porId.has(c.contratoId)) faltan.add(c.contratoId);
  for (const p of delMesPagos) if (!porId.has(p.contratoId)) faltan.add(p.contratoId);
  if (faltan.size) {
    for (const carro of await contratosPorId(sb, [...faltan])) porId.set(carro.id, carro);
  }
  const carros = [...porId.values()];
  const previo = await antesDelMes(sb, carros.map((c) => c.id), desde);
  const filas = filasDelInforme(
    carros,
    [...previo.cargos, ...delMesCargos],
    [...previo.pagos, ...delMesPagos],
    desde,
    hasta,
  );
  const flota = new Set(filas.map((f) => `${f.empresa}|${f.carro}`)).size;
  return {
    filas,
    meta: metaDelInforme(desde, hasta, metaRow?.meta100 ?? null, metaRow?.nota ?? null, flota),
  };
}

export async function archivoInforme(desde: string, hasta: string): Promise<Buffer> {
  const { filas, meta } = await datosInforme(desde, hasta);
  return libroInforme(filas, meta, desde, hasta);
}
