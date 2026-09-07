export type RolEquipo = "admin" | "cartera";

export type SesionEquipo = {
  id: string;
  email: string;
  nombre: string;
  rol: RolEquipo;
};
