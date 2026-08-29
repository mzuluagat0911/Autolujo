"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Resuelve un pago de la cola de conciliación.
 * - conciliar: lo marca aplicado (opcionalmente a un contrato).
 * - rechazar: lo descarta (ej. comprobante inválido o duplicado).
 */
export async function resolverPago(formData: FormData): Promise<void> {
  const pagoId = String(formData.get("pago_id") ?? "");
  const accion = String(formData.get("accion") ?? "");
  const contratoId = String(formData.get("contrato_id") ?? "").trim() || null;
  if (!pagoId) throw new Error("Falta el pago.");

  const nuevoEstado =
    accion === "conciliar" ? "conciliado" : accion === "rechazar" ? "rechazado" : null;
  if (!nuevoEstado) throw new Error("Acción inválida.");

  const sb = createServerSupabase();
  const patch: Record<string, unknown> = { estado_conciliacion: nuevoEstado };
  if (contratoId) patch.contrato_id = contratoId;

  const { error } = await sb.from("pagos").update(patch).eq("id", pagoId);
  if (error) throw new Error(error.message);

  revalidatePath("/cartera/pagos");
  revalidatePath("/");
}
