"use server";

import { revalidatePath } from "next/cache";
import { procesarExtractoPDF, type ResultadoConciliacion } from "@/lib/cartera/extracto";
import {
  aplicarMovimientoExtracto,
  ignorarMovimientoExtracto,
  type ResultadoRevision,
} from "@/lib/cartera/revision-extracto";

function refrescarCartera() {
  revalidatePath("/admin");
  revalidatePath("/cartera");
  revalidatePath("/cartera/pagos");
  revalidatePath("/cartera/extractos");
}

const VACIO: ResultadoConciliacion = {
  ok: false, empresa: null, total: 0, aplicados: 0, parciales: 0, revisar: 0, montoAplicado: 0, detalle: [],
};

export async function conciliarExtracto(
  _prev: ResultadoConciliacion | null,
  formData: FormData,
): Promise<ResultadoConciliacion> {
  const empresaId = String(formData.get("empresa_id") ?? "").trim();
  if (!empresaId) {
    return { ...VACIO, error: "Elige la empresa de este extracto." };
  }
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) {
    return { ...VACIO, error: "Sube el PDF del extracto." };
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { ...VACIO, error: "El archivo debe ser un PDF." };
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const res = await procesarExtractoPDF(buf, "Equipo", empresaId);
    refrescarCartera();
    return res;
  } catch (e) {
    return { ...VACIO, error: e instanceof Error ? e.message : "Error procesando el PDF." };
  }
}

export async function resolverMovimientoExtracto(
  _prev: ResultadoRevision | null,
  formData: FormData,
): Promise<ResultadoRevision> {
  const movimientoId = String(formData.get("movimiento_id") ?? "").trim();
  const accion = String(formData.get("accion") ?? "").trim();
  const contratoId = String(formData.get("contrato_id") ?? "").trim() || null;
  const carro = String(formData.get("carro") ?? "").trim() || null;

  let res: ResultadoRevision;
  if (accion === "ignorar") {
    res = await ignorarMovimientoExtracto(movimientoId);
  } else if (accion === "aplicar") {
    res = await aplicarMovimientoExtracto({ movimientoId, contratoId, carro });
  } else {
    res = { ok: false, error: "Acción inválida." };
  }
  if (res.ok) refrescarCartera();
  return res;
}
