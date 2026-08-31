"use server";

import { enviarEstadoCuentaPrueba } from "@/lib/cartera/envios";

export type ResultadoPrueba = { ok: boolean; error?: string; preview?: string } | null;

export async function accionEnviarPrueba(
  _prev: ResultadoPrueba,
  formData: FormData,
): Promise<ResultadoPrueba> {
  const carro = String(formData.get("carro") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  if (!carro) return { ok: false, error: "Indica el número de carro." };
  return enviarEstadoCuentaPrueba(carro, numero || undefined);
}
