// Bitácora de la fase 1. Si la migración 0034 todavía no está aplicada,
// el cruce sigue funcionando y esta escritura se omite.

import { createServerSupabase } from "@/lib/supabase/server";
import { versionMotor } from "./activacion-cruce";

export const MOTOR_CONCILIACION = versionMotor();

export type EventoConciliacion = {
  accion: string;
  actor?: string | null;
  extractoId?: string | null;
  movimientoId?: string | null;
  pagoId?: string | null;
  contratoId?: string | null;
  empresaId?: string | null;
  motivo?: string | null;
  antes?: unknown;
  despues?: unknown;
};

function tablaAusente(message: string): boolean {
  return /conciliacion_auditoria|schema cache|could not find the table/i.test(message);
}

export async function registrarAuditoriaConciliacion(evento: EventoConciliacion): Promise<void> {
  try {
    const sb = createServerSupabase();
    const { error } = await sb.from("conciliacion_auditoria").insert({
      actor: evento.actor ?? null,
      accion: evento.accion,
      extracto_id: evento.extractoId ?? null,
      movimiento_id: evento.movimientoId ?? null,
      pago_id: evento.pagoId ?? null,
      contrato_id: evento.contratoId ?? null,
      empresa_id: evento.empresaId ?? null,
      motivo: evento.motivo ?? null,
      antes: evento.antes ?? null,
      despues: evento.despues ?? null,
      motor_version: MOTOR_CONCILIACION,
    });
    if (error && !tablaAusente(error.message)) {
      console.error("[conciliacion] auditoría", error.message);
    }
  } catch (e) {
    console.error("[conciliacion] auditoría", e);
  }
}
