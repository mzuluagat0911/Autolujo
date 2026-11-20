// Puente sin módulos de Node. La pantalla del navegador importa el estado
// de cuenta, y este archivo no puede arrastrar async_hooks.

export type PagoConciliado = {
  id: string;
  contrato_id: string;
  fecha: string;
  monto: number;
  rubro: string | null;
  asignaciones: unknown;
};

type Lector = (ids: string[]) => Promise<PagoConciliado[]>;

let lector: Lector | null = null;
let preparar: Lector | null = null;

export function usarLecturaDePagos(fn: Lector, arranque: Lector) {
  lector = fn;
  preparar = arranque;
}

export function pagosCompartidos(ids: string[], directo: Lector): Promise<PagoConciliado[]> {
  return (lector ?? directo)(ids);
}

export function prepararCompartido(ids: string[], directo: Lector): Promise<PagoConciliado[]> {
  return (preparar ?? directo)(ids);
}
