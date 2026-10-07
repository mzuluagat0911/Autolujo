// La bienvenida de AutoLujo y Kowua ya se puede enviar. Gold sigue igual.
//
// Unos carros no reciben ni bienvenida ni cobro, y no se les abre letra,
// hasta que se les asigne un cliente nuevo (contrato creado después del corte).

import { createServerSupabase } from "@/lib/supabase/server";

const PAUSA = new Set<string>();

/** Un contrato creado después de esta hora es un cliente nuevo: ya se le cobra. */
export const SIN_CLIENTE_CORTE = "2026-10-07T03:00:00.000Z";

const SIN_CLIENTE: Record<string, Set<string>> = {
  KOWUA: new Set(["119", "120", "139", "151", "158", "163", "184", "187", "173"]),
  AUTOLUJO: new Set(["51", "56", "94", "313", "323", "327", "329"]),
};

function numeroCarro(numero: string | null | undefined): string {
  const t = String(numero ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = t.match(/^([A-Z]*)0*(\d+)$/);
  const cuerpo = m ? m[1] + String(Number(m[2])) : t;
  return cuerpo.replace(/\D/g, "");
}

export function envioPausado(codigo: string | null | undefined): boolean {
  return PAUSA.has(String(codigo ?? "").trim().toUpperCase());
}

/** Carro a la espera de cliente. Sin fecha de contrato, se toma como el corte actual. */
export function carroSinCliente(
  codigo: string | null | undefined,
  numero: string | null | undefined,
  contratoCreadoEn?: string | null,
): boolean {
  const emp = String(codigo ?? "").trim().toUpperCase();
  const lista = SIN_CLIENTE[emp];
  if (!lista || !lista.has(numeroCarro(numero))) return false;
  if (!contratoCreadoEn) return true;
  return contratoCreadoEn < SIN_CLIENTE_CORTE;
}

type VehiculoPausa = {
  numero?: string | null;
  empresa?: { codigo?: string | null } | null;
} | null;

function pausaDe(codigo: string | null | undefined, numero: string | null | undefined, creado: string | null): boolean {
  return envioPausado(codigo) || carroSinCliente(codigo, numero, creado);
}

export async function envioPausadoContrato(contratoId: string | null | undefined): Promise<boolean> {
  if (!contratoId) return false;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("contratos")
    .select("created_at, vehiculo:vehiculos(numero, empresa:empresas(codigo))")
    .eq("id", contratoId)
    .maybeSingle();
  const row = data as { created_at?: string | null; vehiculo?: VehiculoPausa } | null;
  return pausaDe(row?.vehiculo?.empresa?.codigo, row?.vehiculo?.numero, row?.created_at ?? null);
}

export async function envioPausadoVehiculo(vehiculoId: string | null | undefined): Promise<boolean> {
  if (!vehiculoId) return false;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("vehiculos")
    .select("numero, empresa:empresas(codigo)")
    .eq("id", vehiculoId)
    .maybeSingle();
  const veh = data as VehiculoPausa;
  if (envioPausado(veh?.empresa?.codigo)) return true;
  if (!carroSinCliente(veh?.empresa?.codigo, veh?.numero)) return false;
  const { data: con } = await sb
    .from("contratos")
    .select("created_at")
    .eq("vehiculo_id", vehiculoId)
    .eq("estado", "activo")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const creado = (con as { created_at?: string | null } | null)?.created_at ?? null;
  return carroSinCliente(veh?.empresa?.codigo, veh?.numero, creado);
}

export async function envioPausadoConversacion(conversacionId: string): Promise<boolean> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("conversaciones")
    .select("contrato_id, vehiculo_id")
    .eq("id", conversacionId)
    .maybeSingle();
  const row = data as { contrato_id: string | null; vehiculo_id: string | null } | null;
  if (!row) return false;
  if (row.contrato_id && (await envioPausadoContrato(row.contrato_id))) return true;
  return envioPausadoVehiculo(row.vehiculo_id);
}
