export type RolEquipo = "admin" | "cartera" | "comercial";

export type SesionEquipo = {
  id: string;
  email: string;
  nombre: string;
  rol: RolEquipo;
};
