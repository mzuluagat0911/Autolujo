// Abono “solo domingos”: el paquete (N × cuota) no entra al saldo en el alta.
// Entra el primer domingo después de que ese abono queda en cero.
import { fechaConDiaSemana, esAbonoSoloDomingo } from "./acuerdo";
import { esDomingo, sumarDias } from "./fecha";
import { createServerSupabase } from "@/lib/supabase/server";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Primer domingo en que el paquete ya puede cobrarse. El domingo que liquidó el abono no. */
export function primerDomingoDelPaquete(desde: string): string {
  const dia = desde.slice(0, 10);
  if (esDomingo(dia)) return sumarDias(dia, 7);
  return fechaConDiaSemana(dia, 0);
}

/**
 * Si el abono de solo domingos llegó a cero, publica el paquete que el alta dejó quieto.
 * Si el cargo ya existe, no hace nada.
 */
export async function soltarPaqueteDomingos(opts: {
  contratoId: string;
  desde: string;
  acuerdo: {
    descripcion?: string | null;
    frecuencia?: string | null;
    cuota_diaria?: number | null;
    cuota_domingo?: number | null;
  };
}): Promise<void> {
  if (!esAbonoSoloDomingo(opts.acuerdo)) return;
  const sb = createServerSupabase();
  const { data: contrato } = await sb
    .from("contratos")
    .select("cobra_domingo, cuota_domingo, dias_primeros_domingos")
    .eq("id", opts.contratoId)
    .maybeSingle();
  const fila = contrato as {
    cobra_domingo: boolean | null;
    cuota_domingo: number | null;
    dias_primeros_domingos: number | null;
  } | null;
  if (!fila?.cobra_domingo) return;
  const cuota = Math.max(Number(fila.cuota_domingo) || 0, 0);
  const dias = Math.max(Math.round(Number(fila.dias_primeros_domingos) || 0), 0);
  if (cuota <= 0.009 || dias <= 0) return;
  const monto = r2(dias * cuota);

  const porCodigo = await sb
    .from("cargos")
    .select("id")
    .eq("contrato_id", opts.contratoId)
    .eq("concepto_codigo", "DOMINGOS")
    .limit(1);
  const porTexto = porCodigo.error
    ? await sb
        .from("cargos")
        .select("id")
        .eq("contrato_id", opts.contratoId)
        .ilike("concepto", "Domingos (%")
        .limit(1)
    : { data: [] as { id: string }[], error: null };
  if ((porCodigo.data ?? []).length > 0 || (porTexto.data ?? []).length > 0) return;

  const fecha = primerDomingoDelPaquete(opts.desde);
  const cargo = {
    contrato_id: opts.contratoId,
    fecha,
    tipo: "otras",
    concepto_codigo: "DOMINGOS",
    concepto: `Domingos (${dias} × $${cuota})`,
    monto,
  };
  const ins = await sb.from("cargos").insert(cargo);
  if (ins.error && /DOMINGOS|concepto_codigo/i.test(ins.error.message)) {
    const { concepto_codigo: _c, ...sin } = cargo;
    const retry = await sb.from("cargos").insert(sin);
    if (retry.error) console.error("[domingos-aplazados]", retry.error.message);
  } else if (ins.error) {
    console.error("[domingos-aplazados]", ins.error.message);
  }
}
