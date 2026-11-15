// Auditoría y limpieza de duplicados de HOY en la cola de Comprobantes.
// La recuperación pudo reabrir un rechazado y a la vez crear otro pago con la
// misma foto → dos filas pendientes del mismo voucher.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
import { esMismoComprobante, canonReferencia } from "@/lib/cartera/cruce";

const NOTA_DUP =
  "AVISO: duplicado de recuperación (misma foto u mismos datos). Se conserva el otro; este queda rechazado.";

type PagoHoy = {
  id: string;
  created_at: string;
  monto: number;
  fecha: string | null;
  pagado_at: string | null;
  referencia: string | null;
  cuenta_destino: string | null;
  contrato_id: string | null;
  numero_carro: string | null;
  comprobante_url: string | null;
  estado_conciliacion: string;
  origen: string | null;
  notas: string | null;
};

function inicioHoyPanamaIso(hoy: string): string {
  return `${hoy}T05:00:00.000Z`;
}

function score(p: PagoHoy): number {
  let s = 0;
  if (Number(p.monto) > 0) s += 10;
  if (canonReferencia(p.referencia)) s += 8;
  if (p.cuenta_destino) s += 2;
  if (p.contrato_id) s += 2;
  if (p.numero_carro) s += 1;
  if ((p.notas ?? "").includes("RECUPERADO_SIN_LECTURA")) s -= 5;
  if ((p.notas ?? "").includes("Lectura IA")) s += 3;
  return s;
}

function mejor(a: PagoHoy, b: PagoHoy): PagoHoy {
  const sa = score(a);
  const sb = score(b);
  if (sa !== sb) return sa > sb ? a : b;
  return a.created_at <= b.created_at ? a : b;
}

async function cargarPendientesHoy(): Promise<PagoHoy[]> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const desde = inicioHoyPanamaIso(hoy);
  const { data, error } = await sb
    .from("pagos")
    .select(
      "id, created_at, monto, fecha, pagado_at, referencia, cuenta_destino, contrato_id, numero_carro, comprobante_url, estado_conciliacion, origen, notas",
    )
    .eq("estado_conciliacion", "pendiente")
    .eq("origen", "comprobante")
    .or(`fecha.eq.${hoy},created_at.gte.${desde}`)
    .order("created_at", { ascending: true })
    .limit(800);
  if (error || !data) return [];
  return data as PagoHoy[];
}

export async function auditarComprobantesHoy(): Promise<{
  hoy: string;
  pendientes: number;
  conMonto: number;
  sinMonto: number;
  pathsRepetidos: number;
  paresMismosDatos: number;
  ejemplosPath: { path: string; ids: string[]; montos: number[] }[];
}> {
  const hoy = hoyPanama();
  const pendientes = await cargarPendientesHoy();
  const conMonto = pendientes.filter((p) => Number(p.monto) > 0).length;
  const sinMonto = pendientes.length - conMonto;

  const porPath = new Map<string, PagoHoy[]>();
  for (const p of pendientes) {
    if (!p.comprobante_url) continue;
    const arr = porPath.get(p.comprobante_url) ?? [];
    arr.push(p);
    porPath.set(p.comprobante_url, arr);
  }
  const pathsRepetidos = [...porPath.values()].filter((g) => g.length > 1);
  const ejemplosPath = pathsRepetidos.slice(0, 15).map((g) => ({
    path: (g[0]!.comprobante_url ?? "").slice(-40),
    ids: g.map((p) => p.id.slice(0, 8)),
    montos: g.map((p) => Number(p.monto)),
  }));

  let paresMismosDatos = 0;
  for (let i = 0; i < pendientes.length; i++) {
    for (let j = i + 1; j < pendientes.length; j++) {
      const a = pendientes[i]!;
      const b = pendientes[j]!;
      if (
        esMismoComprobante(
          {
            monto: Number(a.monto),
            fecha: a.fecha,
            pagadoAt: a.pagado_at,
            referencia: a.referencia,
            cuentaDestino: a.cuenta_destino,
            numeroCarro: a.numero_carro,
            contratoId: a.contrato_id,
          },
          {
            monto: Number(b.monto),
            fecha: b.fecha,
            pagadoAt: b.pagado_at,
            referencia: b.referencia,
            cuentaDestino: b.cuenta_destino,
            numeroCarro: b.numero_carro,
            contratoId: b.contrato_id,
          },
        )
      ) {
        paresMismosDatos++;
      }
    }
  }

  return {
    hoy,
    pendientes: pendientes.length,
    conMonto,
    sinMonto,
    pathsRepetidos: pathsRepetidos.length,
    paresMismosDatos,
    ejemplosPath,
  };
}

/**
 * Rechaza duplicados claros: misma foto (path) o mismos datos de voucher.
 * Conserva el de mejor lectura / más antiguo.
 */
export async function limpiarDuplicadosHoy(): Promise<{
  hoy: string;
  antes: number;
  rechazados: number;
  quedan: number;
  detalle: string[];
}> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const pendientes = await cargarPendientesHoy();
  const rechazarIds = new Set<string>();
  const detalle: string[] = [];

  // 1) Misma foto (comprobante_url)
  const porPath = new Map<string, PagoHoy[]>();
  for (const p of pendientes) {
    if (!p.comprobante_url) continue;
    const arr = porPath.get(p.comprobante_url) ?? [];
    arr.push(p);
    porPath.set(p.comprobante_url, arr);
  }
  for (const grupo of porPath.values()) {
    if (grupo.length < 2) continue;
    let keep = grupo[0]!;
    for (const p of grupo.slice(1)) keep = mejor(keep, p);
    for (const p of grupo) {
      if (p.id === keep.id) continue;
      if (rechazarIds.has(p.id)) continue;
      rechazarIds.add(p.id);
      detalle.push(`path ${p.id.slice(0, 8)}→keep ${keep.id.slice(0, 8)} $${Number(p.monto)}`);
    }
  }

  // 2) Mismos datos (sin path compartido)
  const vivos = pendientes.filter((p) => !rechazarIds.has(p.id));
  for (let i = 0; i < vivos.length; i++) {
    const a = vivos[i]!;
    if (rechazarIds.has(a.id)) continue;
    for (let j = i + 1; j < vivos.length; j++) {
      const b = vivos[j]!;
      if (rechazarIds.has(b.id)) continue;
      const mismo = esMismoComprobante(
        {
          monto: Number(a.monto),
          fecha: a.fecha,
          pagadoAt: a.pagado_at,
          referencia: a.referencia,
          cuentaDestino: a.cuenta_destino,
          numeroCarro: a.numero_carro,
          contratoId: a.contrato_id,
        },
        {
          monto: Number(b.monto),
          fecha: b.fecha,
          pagadoAt: b.pagado_at,
          referencia: b.referencia,
          cuentaDestino: b.cuenta_destino,
          numeroCarro: b.numero_carro,
          contratoId: b.contrato_id,
        },
      );
      if (!mismo) continue;
      const keep = mejor(a, b);
      const drop = keep.id === a.id ? b : a;
      rechazarIds.add(drop.id);
      detalle.push(`datos ${drop.id.slice(0, 8)}→keep ${keep.id.slice(0, 8)} $${Number(drop.monto)}`);
    }
  }

  for (const id of rechazarIds) {
    const p = pendientes.find((x) => x.id === id);
    const notas = [p?.notas, NOTA_DUP].filter(Boolean).join(" · ");
    await sb.from("pagos").update({ estado_conciliacion: "rechazado", notas }).eq("id", id);
  }

  const despues = await cargarPendientesHoy();
  return {
    hoy,
    antes: pendientes.length,
    rechazados: rechazarIds.size,
    quedan: despues.length,
    detalle: detalle.slice(0, 40),
  };
}
