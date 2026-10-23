import type { ModuloId } from "./modulos";

export type SesionEquipo = {
  id: string;
  email: string;
  nombre: string;
  modulos: ModuloId[];
};
