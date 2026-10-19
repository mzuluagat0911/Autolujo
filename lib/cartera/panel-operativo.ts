// Recaudo, huecos y movimiento del panel de cartera.
// El dinero sin pagar es el total del extracto. La letra que no corre
// es la cuota del día de un carro improductivo o en taller: no es "a pagar hoy".

import { cuotaDeFecha } from "./cuota";
import { etiquetaSucursal } from "./sucursal";
import { createServerSupabase } from "@/lib/supabase/server";
import { finMes, inicioMes } from "./fecha";

export type RecaudoDia = { fecha: string; empresa: string; monto: number; pagos: number };

export type MovimientoDia = {
  fecha: string;
  tipo: "entrega" | "devolucion";
  carro: string;
  empresa: string;
  sucursal: string;
};

export type HuecoEmpresa = { empresa: string; carros: number; monto: number };

export type ImproductivoEmpresa = {
  estado: string;
  empresa: string;
  carros: number;
  letra: number;
};

export type PanelOperativo = {
  desde: string;
  hasta: string;
  empresas: string[];
  recaudo: RecaudoDia[];
  movimientos: MovimientoDia[];
  noPagos: HuecoEmpresa[];
  improductivos: ImproductivoEmpresa[];
  porEntregar: HuecoEmpresa[];
};

const SIN_PRODUCIR = ["improductivo", "chapisteria", "mantenimiento"] as const;

function uno<T>(valor: T | T[] | null | undefined): T | null {
  if (!valor) return null;
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

function codigoEmpresa(valor: unknown): string {
  const empresa = uno(valor as { codigo?: string | null } | { codigo?: string | null }[] | null);
  return (empresa?.codigo ?? "").trim().toUpperCase() || "—";
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Carros activos con el extracto abierto. El monto es el total a cobrar hoy. */
export function noPagosDe(estados: {
  empresa: string | null;
  totalCobrarHoy?: number;
  inactivo?: boolean;
  enTaller?: boolean;
  devuelto?: boolean;
}[]): HuecoEmpresa[] {
  const mapa = new Map<string, HuecoEmpresa>();
  for (const e of estados) {
    if (e.inactivo || e.enTaller || e.devuelto) continue;
    const monto = Number(e.totalCobrarHoy) || 0;
    if (monto <= 0.009) continue;
    const empresa = (e.empresa ?? "—").toUpperCase();
    const cur = mapa.get(empresa) ?? { empresa, carros: 0, monto: 0 };
    cur.carros += 1;
    cur.monto += monto;
    mapa.set(empresa, cur);
  }
  return [...mapa.values()]
    .map((f) => ({ ...f, monto: redondear(f.monto) }))
    .sort((a, b) => b.monto - a.monto);
}

async function leerRecaudo(desde: string, hasta: string, empresaIds: string[] | null): Promise<RecaudoDia[]> {
  const sb = createServerSupabase();
  const mapa = new Map<string, RecaudoDia>();
  for (let from = 0; from < 20000; from += 1000) {
    let q = sb
      .from("pagos")
      .select("fecha, monto, contrato:contratos!inner(empresa_id, empresa:empresas(codigo))")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .in("estado_conciliacion", ["conciliado", "manual"])
      .range(from, from + 999);
    if (empresaIds) q = q.in("contrato.empresa_id", empresaIds);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as unknown as {
      fecha: string;
      monto: number | null;
      contrato: { empresa_id: string; empresa: { codigo: string } | { codigo: string }[] | null } | { empresa_id: string; empresa: { codigo: string } | { codigo: string }[] | null }[] | null;
    }[];
    for (const row of chunk) {
      const contrato = uno(row.contrato);
      const empresa = codigoEmpresa(contrato?.empresa);
      const clave = `${row.fecha}|${empresa}`;
      const cur = mapa.get(clave) ?? { fecha: row.fecha, empresa, monto: 0, pagos: 0 };
      cur.monto += Number(row.monto) || 0;
      cur.pagos += 1;
      mapa.set(clave, cur);
    }
    if (chunk.length < 1000) break;
  }
  return [...mapa.values()].map((f) => ({ ...f, monto: redondear(f.monto) }));
}

async function leerMovimientos(desde: string, hasta: string, empresaIds: string[] | null): Promise<MovimientoDia[]> {
  const sb = createServerSupabase();
  let contratosQ = sb
    .from("contratos")
    .select("fecha_inicio, vehiculo_id, vehiculo:vehiculos!inner(numero, empresa_id, empresa:empresas(codigo))")
    .gte("fecha_inicio", desde)
    .lte("fecha_inicio", hasta);
  if (empresaIds) contratosQ = contratosQ.in("vehiculo.empresa_id", empresaIds);

  let eventosQ = sb
    .from("vehiculo_eventos")
    .select("fecha, tipo, lugar, vehiculo_id, vehiculo:vehiculos!inner(numero, empresa_id, empresa:empresas(codigo))")
    .in("tipo", ["contrato", "devolucion"])
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (empresaIds) eventosQ = eventosQ.in("vehiculo.empresa_id", empresaIds);

  const [contratos, eventos] = await Promise.all([contratosQ, eventosQ]);
  if (contratos.error) throw new Error(contratos.error.message);
  if (eventos.error) throw new Error(eventos.error.message);

  const lugarEntrega = new Map<string, string | null>();
  const out: MovimientoDia[] = [];
  for (const row of (eventos.data ?? []) as unknown as {
    fecha: string;
    tipo: string;
    lugar: string | null;
    vehiculo_id: string;
    vehiculo: { numero: string; empresa: { codigo: string } | { codigo: string }[] | null } | { numero: string; empresa: { codigo: string } | { codigo: string }[] | null }[] | null;
  }[]) {
    const veh = uno(row.vehiculo);
    const carro = (veh?.numero ?? "").trim() || "—";
    const empresa = codigoEmpresa(veh?.empresa);
    if (row.tipo === "contrato") {
      lugarEntrega.set(`${row.vehiculo_id}|${row.fecha}`, row.lugar);
      continue;
    }
    out.push({
      fecha: row.fecha,
      tipo: "devolucion",
      carro,
      empresa,
      sucursal: etiquetaSucursal(row.lugar),
    });
  }

  for (const row of (contratos.data ?? []) as unknown as {
    fecha_inicio: string;
    vehiculo_id: string;
    vehiculo: { numero: string; empresa: { codigo: string } | { codigo: string }[] | null } | null;
  }[]) {
    const veh = uno(row.vehiculo);
    out.push({
      fecha: row.fecha_inicio,
      tipo: "entrega",
      carro: (veh?.numero ?? "").trim() || "—",
      empresa: codigoEmpresa(veh?.empresa),
      sucursal: etiquetaSucursal(lugarEntrega.get(`${row.vehiculo_id}|${row.fecha_inicio}`)),
    });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.carro.localeCompare(b.carro));
}

async function leerImproductivos(hoy: string, empresaIds: string[] | null): Promise<{
  improductivos: ImproductivoEmpresa[];
  porEntregar: HuecoEmpresa[];
}> {
  const sb = createServerSupabase();
  let q = sb
    .from("vehiculos")
    .select("estado, empresa_id, empresa:empresas(codigo), contratos(estado, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo)")
    .in("estado", [...SIN_PRODUCIR, "por_entregar"]);
  if (empresaIds) q = q.in("empresa_id", empresaIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const impro = new Map<string, ImproductivoEmpresa>();
  const espera = new Map<string, HuecoEmpresa>();
  for (const row of (data ?? []) as unknown as {
    estado: string;
    empresa: { codigo: string } | { codigo: string }[] | null;
    contratos: {
      estado: string;
      letra_diaria: number | null;
      descuento_puntual: number | null;
      cobra_domingo: boolean | null;
      cuota_domingo: number | null;
    }[] | null;
  }[]) {
    const empresa = codigoEmpresa(row.empresa);
    if (row.estado === "por_entregar") {
      const cur = espera.get(empresa) ?? { empresa, carros: 0, monto: 0 };
      cur.carros += 1;
      espera.set(empresa, cur);
      continue;
    }
    const contrato = (row.contratos ?? []).find((c) => c.estado === "activo");
    const letra = contrato
      ? cuotaDeFecha(
          {
            letra_diaria: Number(contrato.letra_diaria) || 0,
            descuento_puntual: Number(contrato.descuento_puntual) || 0,
            cobra_domingo: Boolean(contrato.cobra_domingo),
            cuota_domingo: Number(contrato.cuota_domingo) || 0,
          },
          hoy,
        )
      : 0;
    const clave = `${row.estado}|${empresa}`;
    const cur = impro.get(clave) ?? { estado: row.estado, empresa, carros: 0, letra: 0 };
    cur.carros += 1;
    cur.letra += letra;
    impro.set(clave, cur);
  }
  return {
    improductivos: [...impro.values()].map((f) => ({ ...f, letra: redondear(f.letra) })),
    porEntregar: [...espera.values()],
  };
}

export async function leerPanelOperativo(opts: {
  hoy: string;
  empresaIds: string[] | null;
  estados: Parameters<typeof noPagosDe>[0];
}): Promise<PanelOperativo> {
  const desde = inicioMes(opts.hoy);
  const hasta = opts.hoy < finMes(opts.hoy) ? opts.hoy : finMes(opts.hoy);
  const sb = createServerSupabase();
  let empresasQ = sb.from("empresas").select("codigo").order("codigo");
  if (opts.empresaIds) empresasQ = empresasQ.in("id", opts.empresaIds);
  const [recaudo, movimientos, flota, empresas] = await Promise.all([
    leerRecaudo(desde, hasta, opts.empresaIds),
    leerMovimientos(desde, hasta, opts.empresaIds),
    leerImproductivos(opts.hoy, opts.empresaIds),
    empresasQ,
  ]);
  if (empresas.error) throw new Error(empresas.error.message);
  return {
    desde,
    hasta,
    empresas: ((empresas.data ?? []) as { codigo: string }[]).map((e) => e.codigo.toUpperCase()),
    recaudo,
    movimientos,
    noPagos: noPagosDe(opts.estados),
    improductivos: flota.improductivos,
    porEntregar: flota.porEntregar,
  };
}
