// Motor de estado de cuenta. Calcula, por contrato, lo que el cliente debe hoy
// y arma el mensaje con el mismo formato que usa el equipo:
//   $60 cuenta · $5 por no pagar · $90 domingo 30  →  Total a pagar hoy: $65
// Todo determinista (código), nunca el LLM.
//
// El saldo viene de vw_saldo_contrato, que depende del devengo diario
// (lib/cartera/devengo.ts). Si el devengo no corrió, el saldo no incluye la
// cuota de hoy.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, pasoCorte, fechaLarga, sumarDias, esDomingo } from "./fecha";
import { contratosConPagoEnDia, contratosConPagoPuntualEnDia, pagoHoyContrato } from "./pagos-dia";

/** "$60" si es entero, "$60.50" si tiene centavos. */
export function money(n: number): string {
  const v = Math.round(n * 100) / 100;
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

export type EstadoCuenta = {
  contratoId: string;
  vehiculoNumero: string;
  empresa: string | null;
  clienteNombre: string;
  waNumero: string | null;
  letra: number;
  cuenta: number;         // saldo pendiente (la "cuenta")
  recargo: number;        // recargo YA causado (solo si pasó el corte sin pagar)
  recargoSiTarda: number; // lo que se suma si no paga antes de las 7 p.m.
  domingo: number | null; // cargo de domingo próximo (informativo)
  domingoDia: number | null;
  totalHoy: number;       // cuenta + recargo causado
  pagoHoy: boolean;
  desglose: string;       // línea para el mensaje/template
  fecha: string;          // "29 de agosto"
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

function construir(
  c: ContratoRow,
  saldo: number,
  pagoHoy: boolean,
  pagoPuntual: boolean,
  hoy: string,
  corte: boolean,
  multaHoyRegistrada: boolean,
): EstadoCuenta {
  const letra = Number(c.letra_diaria) || 0;
  const cuenta = Math.max(saldo, 0);

  // El recargo por no pagar solo existe DESPUÉS de las 7 p.m. Antes del corte
  // el cliente todavía conserva el descuento. Si el cron de las 7 p.m. ya lo
  // anotó como cargo multa, el saldo ya lo trae — no sumarlo otra vez.
  const penalidad = Number(c.descuento_puntual ?? 0);
  const causado = !pagoPuntual && corte && !multaHoyRegistrada;
  const recargo = causado ? penalidad : 0;
  const recargoSiTarda = !pagoPuntual && !corte && !pagoHoy ? penalidad : 0;

  // ¿mañana es domingo y este contrato cobra domingo?
  const manana = sumarDias(hoy, 1);
  const domingo =
    esDomingo(manana) && c.cobra_domingo
      ? Number(c.cuota_domingo ?? 0) || null
      : null;

  const totalHoy = cuenta + recargo;

  const partes = [`${money(cuenta)} cuenta`];
  if (recargo > 0) partes.push(`${money(recargo)} por no pagar`);
  else if (recargoSiTarda > 0) partes.push(`${money(recargoSiTarda)} si pagas después de las 7 p.m.`);
  if (domingo) partes.push(`${money(domingo)} domingo ${Number(manana.slice(8, 10))}`);
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
    recargoSiTarda,
    domingo,
    domingoDia: domingo ? Number(manana.slice(8, 10)) : null,
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
  const hoy = hoyPanama();

  const { data: c } = await sb.from("contratos").select(SEL).eq("id", contratoId).maybeSingle();
  if (!c) return null;

  const { data: s } = await sb.from("vw_saldo_contrato").select("saldo_actual").eq("contrato_id", contratoId).maybeSingle();
  const { pagoHoy, pagoPuntual } = await pagoHoyContrato(contratoId, hoy);
  const { data: multa } = await sb
    .from("cargos").select("id")
    .eq("contrato_id", contratoId).eq("fecha", hoy)
    .eq("tipo", "multa").eq("concepto_codigo", "PAGO_TARDE").limit(1);

  return construir(
    c as unknown as ContratoRow,
    Number((s as { saldo_actual: number } | null)?.saldo_actual ?? 0),
    pagoHoy,
    pagoPuntual,
    hoy,
    pasoCorte(),
    (multa?.length ?? 0) > 0,
  );
}

/** Estado de cuenta de TODOS los contratos activos (para el envío del día). */
export async function estadosCuentaHoy(): Promise<EstadoCuenta[]> {
  const sb = createServerSupabase();
  const hoy = hoyPanama();
  const corte = pasoCorte();

  const [contratos, saldos, multasHoy, pagaronHoy, pagaronPuntual] = await Promise.all([
    sb.from("contratos").select(SEL).eq("estado", "activo"),
    sb.from("vw_saldo_contrato").select("contrato_id, saldo_actual"),
    sb.from("cargos").select("contrato_id").eq("fecha", hoy).eq("tipo", "multa").eq("concepto_codigo", "PAGO_TARDE"),
    contratosConPagoEnDia(hoy),
    contratosConPagoPuntualEnDia(hoy),
  ]);

  const saldoMap = new Map<string, number>();
  for (const s of (saldos.data ?? []) as { contrato_id: string; saldo_actual: number | null }[]) {
    saldoMap.set(s.contrato_id, Number(s.saldo_actual ?? 0));
  }
  const pagaronHoySet = pagaronHoy;
  const pagaronPuntualSet = pagaronPuntual;
  const multaHoy = new Set((multasHoy.data ?? []).map((g: { contrato_id: string }) => g.contrato_id));

  return ((contratos.data ?? []) as unknown as ContratoRow[])
    .map((c) =>
      construir(
        c,
        saldoMap.get(c.id) ?? 0,
        pagaronHoySet.has(c.id),
        pagaronPuntualSet.has(c.id),
        hoy,
        corte,
        multaHoy.has(c.id),
      ),
    )
    // No le cobres a quien YA pagó hoy (transferencia conciliada o pago en oficina).
    .filter((e) => !e.pagoHoy)
    .sort((a, b) => b.totalHoy - a.totalHoy);
}
