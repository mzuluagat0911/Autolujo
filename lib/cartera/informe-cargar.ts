import { createServerSupabase } from "@/lib/supabase/server";
import { sumarDias } from "./fecha";
import { metaCobranzaDeMes } from "./metas-cobranza";
import {
  empresaInforme,
  fechaInformeCartera,
  filasDelInforme,
  metaDelInforme,
  tramosDeEventos,
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
        "id, fecha_inicio, vehiculo:vehiculos(id, numero, estado, empresa:empresas(codigo)), cliente:clientes(nombre)",
      )
      .eq("estado", "activo")
      .range(a, b),
  );
  return filas.map(carroDe).filter((c): c is CarroInforme => Boolean(c));
}

// Improductivo, taller y por entregar. Si el contrato sigue activo ya entra
// arriba. Si no, se toma el más reciente para que el saldo igual salga.
const ESTADOS_IMPRODUCTIVOS = ["improductivo", "por_entregar", "chapisteria", "mantenimiento"] as const;

const SEL_CONTRATO =
  "id, estado, fecha_inicio, vehiculo_id, vehiculo:vehiculos(id, numero, estado, empresa:empresas(codigo)), cliente:clientes(nombre)";

async function contratosImproductivos(sb: Sb): Promise<CarroInforme[]> {
  const vehs = await paginas<{ id: string }>((a, b) =>
    sb.from("vehiculos").select("id").in("estado", [...ESTADOS_IMPRODUCTIVOS]).range(a, b),
  );
  const ids = vehs.map((v) => v.id);
  if (!ids.length) return [];

  type Fila = Record<string, unknown> & { estado?: string; fecha_inicio?: string | null; vehiculo_id?: string };
  const filas: Fila[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const lote = ids.slice(i, i + 80);
    const { data, error } = await sb.from("contratos").select(SEL_CONTRATO).in("vehiculo_id", lote);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as Fila[]));
  }

  const porVeh = new Map<string, Fila[]>();
  for (const row of filas) {
    const vehiculoId = String(row.vehiculo_id ?? "");
    if (!vehiculoId) continue;
    const lista = porVeh.get(vehiculoId) ?? [];
    lista.push(row);
    porVeh.set(vehiculoId, lista);
  }

  const out: CarroInforme[] = [];
  for (const lista of porVeh.values()) {
    const activo = lista.find((c) => c.estado === "activo");
    const elegido =
      activo ??
      [...lista].sort((a, b) => String(b.fecha_inicio ?? "").localeCompare(String(a.fecha_inicio ?? "")))[0];
    if (!elegido) continue;
    const carro = carroDe(elegido);
    if (carro) out.push(carro);
  }
  return out;
}

function carroDe(row: Record<string, unknown>): CarroInforme | null {
  const veh = uno(row.vehiculo as { id?: string | null; numero?: string | null; estado?: string | null; empresa?: unknown } | null);
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
    vehiculoId: String(veh?.id ?? ""),
    estadoVehiculo: String(veh?.estado ?? ""),
  };
}

async function contratosPorId(sb: Sb, ids: string[]): Promise<CarroInforme[]> {
  const out: CarroInforme[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const lote = ids.slice(i, i + 80);
    const { data, error } = await sb
      .from("contratos")
      .select("id, fecha_inicio, vehiculo:vehiculos(id, numero, estado, empresa:empresas(codigo)), cliente:clientes(nombre)")
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

function pagoInformeDe(p: Record<string, unknown>): PagoInforme {
  const guardada = String(p.fecha).slice(0, 10);
  return {
    contratoId: String(p.contrato_id),
    fecha: fechaInformeCartera((p.pagado_at as string | null) ?? null, guardada),
    monto: Number(p.monto) || 0,
    metodo: (p.metodo as string | null) ?? null,
    notas: (p.notas as string | null) ?? null,
    rubro: (p.rubro as string | null) ?? null,
    asignaciones: lineas(p.asignaciones),
  };
}

async function pagosEntre(sb: Sb, desde: string | null, hasta: string | null): Promise<PagoInforme[]> {
  const tope = hasta ? sumarDias(hasta, 1) : null;
  const filas = await paginas<Record<string, unknown>>((a, b) => {
    let q = sb
      .from("pagos")
      .select("contrato_id, fecha, pagado_at, monto, metodo, notas, rubro, asignaciones, estado_conciliacion")
      .in("estado_conciliacion", ["conciliado", "manual"]);
    if (desde) q = q.gte("fecha", desde);
    if (tope) q = q.lte("fecha", tope);
    return q.range(a, b);
  });
  return filas
    .filter((p) => p.contrato_id)
    .map(pagoInformeDe)
    .filter((p) => (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta));
}

async function ponerTramos(sb: Sb, carros: CarroInforme[]): Promise<void> {
  const ids = [...new Set(carros.map((c) => c.vehiculoId).filter((id): id is string => Boolean(id)))];
  const eventos = new Map<string, { fecha: string; detalle: string; created_at?: string }[]>();
  for (let i = 0; i < ids.length; i += 80) {
    const lote = ids.slice(i, i + 80);
    const filas = await paginas<Record<string, unknown>>((a, b) =>
      sb
        .from("vehiculo_eventos")
        .select("vehiculo_id, fecha, detalle, created_at")
        .in("vehiculo_id", lote)
        .or(
          "detalle.like.pausa-productiva:%,detalle.like.inactivo:%,detalle.like.caso-archivado:%,detalle.eq.retorno-productivo,detalle.eq.inactivo-anulado",
        )
        .range(a, b),
    );
    for (const row of filas) {
      const id = String(row.vehiculo_id ?? "");
      if (!id) continue;
      const lista = eventos.get(id) ?? [];
      lista.push({
        fecha: String(row.fecha ?? ""),
        detalle: String(row.detalle ?? ""),
        created_at: (row.created_at as string | null) ?? undefined,
      });
      eventos.set(id, lista);
    }
  }
  for (const carro of carros) {
    carro.tramos = tramosDeEventos(eventos.get(carro.vehiculoId ?? "") ?? [], carro.estadoVehiculo, carro.id);
  }
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
          .select("contrato_id, fecha, pagado_at, monto, metodo, notas, rubro, asignaciones")
          .in("contrato_id", lote)
          .in("estado_conciliacion", ["conciliado", "manual"])
          .lte("fecha", desde)
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
      const pago = pagoInformeDe(row);
      if (pago.fecha < desde) pagos.push(pago);
    }
  }
  return { cargos, pagos };
}

export async function datosInforme(desde: string, hasta: string): Promise<{ filas: FilaInforme[]; meta: MetaInforme }> {
  const sb = createServerSupabase();
  const [activos, improductivos, delMesCargos, delMesPagos, metaRow] = await Promise.all([
    contratosActivos(sb),
    contratosImproductivos(sb),
    cargosEntre(sb, desde, hasta),
    pagosEntre(sb, desde, hasta),
    metaCobranzaDeMes(hasta),
  ]);
  const porId = new Map(activos.map((c) => [c.id, c]));
  for (const carro of improductivos) if (!porId.has(carro.id)) porId.set(carro.id, carro);
  const faltan = new Set<string>();
  for (const c of delMesCargos) if (!porId.has(c.contratoId)) faltan.add(c.contratoId);
  for (const p of delMesPagos) if (!porId.has(p.contratoId)) faltan.add(p.contratoId);
  if (faltan.size) {
    for (const carro of await contratosPorId(sb, [...faltan])) porId.set(carro.id, carro);
  }
  const carros = [...porId.values()];
  const [previo] = await Promise.all([
    antesDelMes(sb, carros.map((c) => c.id), desde),
    ponerTramos(sb, carros),
  ]);
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
