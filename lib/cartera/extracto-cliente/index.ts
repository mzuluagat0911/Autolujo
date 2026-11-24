import { cargarExtractoCliente } from "./datos";
import { libroExtractoCliente } from "./xlsx";

export type { ExtractoClienteDatos } from "./datos";

/** Genera el extracto a cliente (.xlsx) para un contrato. */
export async function archivoExtractoCliente(
  clienteId: string,
  contratoId: string,
): Promise<{ ok: true; buffer: Buffer; nombreArchivo: string } | { ok: false; error: string; status: number }> {
  const datos = await cargarExtractoCliente(clienteId, contratoId);
  if ("error" in datos) return { ok: false, error: datos.error, status: datos.status };
  const buffer = await libroExtractoCliente(datos);
  const placa = datos.placa ? `-${datos.placa}` : "";
  const nombreArchivo = `extracto-carro-${datos.numero}${placa}.xlsx`;
  return { ok: true, buffer, nombreArchivo };
}
