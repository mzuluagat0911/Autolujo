import { cargarDatosInformes } from "./datos";
import { libroInformes } from "./xlsx";

/** Descarga INFORMES.xlsx con la misma estructura de pestañas. */
export async function archivoInformes(desde: string, hasta: string): Promise<Buffer> {
  const datos = await cargarDatosInformes(desde, hasta);
  return libroInformes(datos);
}
