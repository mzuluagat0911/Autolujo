// Tipos del dominio de cartera. Reflejan las tablas de Supabase (ver schema).

export type Tarifa = {
  empresa_id: string | null; // null = aplica a todas
  modelo: string | null; // null = cualquier modelo
  anio: number | null; // null = cualquier año
  km_min: number;
  km_max: number;
  letra_diaria: number;
  vigente: boolean;
};

export type ConfigReglas = {
  hora_cierre: string; // "12:00" — el día operativo cierra a mediodía
  hora_limite_pago: string; // "19:00" — pago hasta las 7pm sin multa
  multa_tarde: number; // $5
  pago_minimo_diario: number; // $5
  pago_minimo_domingo: number; // $30
  km_incluido_mes: number; // 8000
  exceso_km_costo: number; // $2
  exceso_km_bloque: number; // por cada 10 km
};

// Una obligación pendiente del día (lo que el cliente debe cubrir).
export type Obligacion = {
  tipo: "acuerdo" | "cuenta_diaria";
  prioridad: number; // menor = se cubre primero (acuerdo antes que cuenta)
  monto: number; // monto debido de esta obligación
  ref?: string; // id del acuerdo, opcional
};

export type AsignacionPago = {
  tipo: Obligacion["tipo"];
  ref?: string;
  aplicado: number;
};

export type ResultadoPago = {
  asignaciones: AsignacionPago[];
  sobrante: number; // saldo a favor no aplicado
  totalAplicado: number;
};
