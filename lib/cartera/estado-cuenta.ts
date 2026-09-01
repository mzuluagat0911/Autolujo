// Motor de estado de cuenta. Calcula, por contrato, lo que el cliente debe hoy
// y arma el mensaje con el mismo formato que usa el equipo:
//   $60 cuenta · $5 por no pagar · $90 domingo 30  →  Total a pagar hoy: $65
// Todo determinista (código), nunca el LLM.

import { createServerSupabase } from "@/lib/supabase/server";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "$60" si es entero, "$60.50" si tiene centavos. */
export function money(n: number): string {
  const v = Math.round(n * 100) / 100;
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

function fechaLarga(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export type EstadoCuenta = {
  contratoId: string;
  vehiculoNumero: string;
  empresa: string | null;
  clienteNombre: string;
  waNumero: string | null;
  letra: number;
  cuenta: number;        // saldo pendiente (la "cuenta")
  recargo: number;       // recargo por no pagar (si no pagó hoy)
  domingo: number | null; // cargo de domingo próximo (informativo)
  domingoDia: number | null;
  totalHoy: number;      // cuenta + recargo
  pagoHoy: boolean;
  desglose: string;      // línea para el mensaje/template
  fecha: string;         // "29 de agosto"
  // Variables listas para el template estado_cuenta_diario:
  templateVars: [string, string, string, string, string];
};

type ContratoRow = {
  id: string;
  letra_diaria: number;
  descuento_puntual: number | null;
  cobra_domingo: boolean | null;
  cuota_domingo: number | null;
  vehiculo: { numero: string; empresa: { codigo: string } | null } | null;
  cliente: { nombre: string; whatsapp: string | null } | null;
};

function construir(c: ContratoRow, saldo: number, pagoHoy: boolean, hoy: Date): EstadoCuenta {
  const letra = Number(c.letra_diaria) || 0;
  const cuenta = Math.max(saldo, 0);
  const recargo = pagoHoy ? 0 : Number(c.descuento_puntual ?? 0);

  // ¿mañana es domingo y este contrato cobra domingo?
  const manana = new Date(hoy);
  manana.setDate(hoy.getDate() + 1);
  const esDomingoManana = manana.getDay() === 0;
  const domingo = esDomingoManana && c.cobra_domingo ? Number(c.cuota_domingo ?? 0) || null : null;

  const totalHoy = cuenta + recargo;

  const partes = [`${money(cuenta)} cuenta`];
  if (recargo > 0) partes.push(`${money(recargo)} por no pagar`);
  if (domingo) partes.push(`${money(domingo)} domingo ${manana.getDate()}`);
  const desglose = partes.join(" · ");

  const fecha = fechaLarga(hoy);
  const nombre = c.cliente?.nombre?.split(" ")[0] ?? "cliente"; // primer nombre
  const carro = c.vehiculo?.numero ?? "—";

  return {
    contratoId: c.id,
    vehiculoNumero: carro,
    empresa: c.vehiculo?.empresa?.codigo ?? null,
    clienteNombre: c.cliente?.nombre ?? "Sin nombre",
    waNumero: c.cliente?.whatsapp ?? null,
    letra,
    cuenta,
    recargo,
    domingo,
    domingoDia: domingo ? manana.getDate() : null,
    totalHoy,
    pagoHoy,
    desglose,
    fecha,
    templateVars: [nombre, carro, fecha, desglose, money(totalHoy)],
  };
}

const SEL =
  "id, letra_diaria, descuento_puntual, cobra_domingo, cuota_domingo, vehiculo:vehiculos(numero, empresa:empresas(codigo)), cliente:clientes(nombre, whatsapp)";

/** Estado de cuenta de un solo contrato. */
export async function estadoCuentaContrato(contratoId: string): Promise<EstadoCuenta | null> {
  const sb = createServerSupabase();
  const hoy = new Date();
  const hoyStr = hoy.toISOString().slice(0, 10);

  const { data: c } = await sb.from("contratos").select(SEL).eq("id", contratoId).maybeSingle();
  if (!c) return null;

  const { data: s } = await sb.from("vw_saldo_contrato").select("saldo_actual").eq("contrato_id", contratoId).maybeSingle();
  const { data: pagos } = await sb
    .from("pagos").select("id")
    .eq("contrato_id", contratoId).eq("fecha", hoyStr)
    .in("estado_conciliacion", ["conciliado", "manual"]).limit(1);

  return construir(
    c as unknown as ContratoRow,
    Number((s as { saldo_actual: number } | null)?.saldo_actual ?? 0),
    (pagos?.length ?? 0) > 0,
    hoy,
  );
}

/** Estado de cuenta de TODOS los contratos activos (para el envío del día). */
export async function estadosCuentaHoy(): Promise<EstadoCuenta[]> {
  const sb = createServerSupabase();
  const hoy = new Date();
  const hoyStr = hoy.toISOString().slice(0, 10);

  const [contratos, saldos, pagosHoy] = await Promise.all([
    sb.from("contratos").select(SEL).eq("estado", "activo"),
    sb.from("vw_saldo_contrato").select("contrato_id, saldo_actual"),
    sb.from("pagos").select("contrato_id").eq("fecha", hoyStr).in("estado_conciliacion", ["conciliado", "manual"]),
  ]);

  const saldoMap = new Map<string, number>();
  for (const s of (saldos.data ?? []) as { contrato_id: string; saldo_actual: number | null }[]) {
    saldoMap.set(s.contrato_id, Number(s.saldo_actual ?? 0));
  }
  const pagaronHoy = new Set((pagosHoy.data ?? []).map((p: { contrato_id: string | null }) => p.contrato_id));

  return ((contratos.data ?? []) as unknown as ContratoRow[])
    .map((c) => construir(c, saldoMap.get(c.id) ?? 0, pagaronHoy.has(c.id), hoy))
    // No le cobres a quien YA pagó hoy (transferencia conciliada o pago en oficina).
    .filter((e) => !e.pagoHoy)
    .sort((a, b) => b.totalHoy - a.totalHoy);
}
