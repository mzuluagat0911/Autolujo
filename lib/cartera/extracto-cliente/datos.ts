// Datos vivos para el extracto a cliente (misma lógica de letra que INFORMES).

import { createServerSupabase } from "@/lib/supabase/server";
import { GOLD_CUOTAS_PLAN } from "@/lib/cartera/data/gold-cuotas-plan";
import { diasEntre, hoyPanama } from "@/lib/cartera/fecha";
import { fechaInformeCartera, partirPago } from "@/lib/cartera/informe-mes";

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

export type ExtractoClienteDatos = {
  clienteId: string;
  contratoId: string;
  numero: string;
  placa: string;
  cedula: string;
  nombre: string;
  telefono: string;
  fechaInicio: string;
  diasCredito: number;
  letra: number;
  cuotasPactadas: number;
  cuotaInicial: number;
  valorMora: number;
  cuotasMora: number;
  /** Totales de letra por YYYY-MM. */
  pagosPorMes: Map<string, number>;
  anios: number[];
  generacion: string;
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
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

function telefonoFormato(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.length === 11 && d.startsWith("507")) return `${d.slice(3, 7)}-${d.slice(7)}`;
  return (raw ?? "").trim();
}

function claveGold(numero: string): string | null {
  const n = numero.trim().toUpperCase().replace(/\s+/g, "");
  const m = n.match(/^G?(\d+)$/);
  if (!m) return null;
  return `G${m[1].padStart(2, "0")}`;
}

function cuotasPactadasDe(numero: string, numCuotas: number | null): number {
  if (numCuotas != null && numCuotas > 0) return Math.round(numCuotas);
  const key = claveGold(numero);
  if (key && GOLD_CUOTAS_PLAN[key]?.total) return GOLD_CUOTAS_PLAN[key].total as number;
  return 1275;
}

function fechaGeneracion(hoy: string): string {
  const [y, m, d] = hoy.split("-");
  return `${d}/${m}/${y}`;
}

/** Carga contrato + cliente + pagos de letra agrupados por mes. */
export async function cargarExtractoCliente(
  clienteId: string,
  contratoId: string,
): Promise<ExtractoClienteDatos | { error: string; status: number }> {
  const sb = createServerSupabase();
  const { data: contrato, error } = await sb
    .from("contratos")
    .select(
      "id, cliente_id, fecha_inicio, letra_diaria, num_cuotas_total, abono_inicial, vehiculo:vehiculos(numero, placa), cliente:clientes(id, nombre, cedula, telefono, whatsapp)",
    )
    .eq("id", contratoId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!contrato) return { error: "Contrato no encontrado.", status: 404 };

  const row = contrato as {
    id: string;
    cliente_id: string;
    fecha_inicio: string | null;
    letra_diaria: number | null;
    num_cuotas_total: number | null;
    abono_inicial: number | null;
    vehiculo: { numero: string | null; placa: string | null } | { numero: string | null; placa: string | null }[] | null;
    cliente:
      | { id: string; nombre: string; cedula: string | null; telefono: string | null; whatsapp: string | null }
      | { id: string; nombre: string; cedula: string | null; telefono: string | null; whatsapp: string | null }[]
      | null;
  };

  if (row.cliente_id !== clienteId) {
    return { error: "El contrato no pertenece a este cliente.", status: 404 };
  }

  const veh = Array.isArray(row.vehiculo) ? row.vehiculo[0] : row.vehiculo;
  const cli = Array.isArray(row.cliente) ? row.cliente[0] : row.cliente;
  if (!cli) return { error: "Cliente no encontrado.", status: 404 };

  const numero = (veh?.numero ?? "").trim() || "—";
  const placa = (veh?.placa ?? "").trim().toUpperCase();
  const letra = Number(row.letra_diaria) || 30;
  const fechaInicio = (row.fecha_inicio ?? "").slice(0, 10);
  const hoy = hoyPanama();

  const { data: pagosData, error: pagosErr } = await sb
    .from("pagos")
    .select("fecha, pagado_at, monto, metodo, rubro, asignaciones, estado_conciliacion, notas")
    .eq("contrato_id", contratoId)
    .in("estado_conciliacion", ["conciliado", "manual"]);

  if (pagosErr) return { error: pagosErr.message, status: 500 };

  const pagosPorMes = new Map<string, number>();
  for (const p of pagosData ?? []) {
    const pago = p as {
      fecha: string | null;
      pagado_at: string | null;
      monto: number;
      metodo: string | null;
      rubro: string | null;
      asignaciones: unknown;
      notas: string | null;
    };
    const fechaGuardada = (pago.fecha ?? pago.pagado_at ?? "").toString().slice(0, 10);
    if (!fechaGuardada) continue;
    const fecha = fechaInformeCartera(pago.pagado_at, fechaGuardada);
    const parte = partirPago({
      contratoId,
      fecha,
      monto: Number(pago.monto) || 0,
      metodo: pago.metodo,
      notas: pago.notas,
      rubro: pago.rubro,
      asignaciones: lineas(pago.asignaciones),
    });
    const letraMes = r2(parte.pagos.Cuota);
    if (Math.abs(letraMes) <= 0.009) continue;
    const key = fecha.slice(0, 7); // YYYY-MM
    pagosPorMes.set(key, r2((pagosPorMes.get(key) ?? 0) + letraMes));
  }

  const anioIni = fechaInicio ? Number(fechaInicio.slice(0, 4)) : Number(hoy.slice(0, 4));
  let anioFin = Number(hoy.slice(0, 4));
  for (const key of pagosPorMes.keys()) {
    const y = Number(key.slice(0, 4));
    if (y > anioFin) anioFin = y;
  }
  const anios: number[] = [];
  for (let y = anioIni; y <= anioFin; y++) anios.push(y);
  // Misma ventana visual del Excel de referencia (hasta 5 años; si hay más, los últimos).
  const aniosVista = anios.length > 5 ? anios.slice(-5) : anios;

  return {
    clienteId,
    contratoId,
    numero,
    placa,
    cedula: (cli.cedula ?? "").trim(),
    nombre: cli.nombre,
    telefono: telefonoFormato(cli.whatsapp || cli.telefono),
    fechaInicio,
    diasCredito: fechaInicio ? Math.max(diasEntre(fechaInicio, hoy), 0) : 0,
    letra,
    cuotasPactadas: cuotasPactadasDe(numero, row.num_cuotas_total),
    cuotaInicial: Number(row.abono_inicial) || 0,
    valorMora: 0,
    cuotasMora: 0,
    pagosPorMes,
    anios: aniosVista,
    generacion: fechaGeneracion(hoy),
  };
}

export { MESES };
