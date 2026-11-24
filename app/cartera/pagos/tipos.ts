import type { SalidaFila } from "@/lib/cartera/salidas-aplicar";

export type PagoFila = {
  id: string;
  fecha: string | null;
  monto: number;
  banco: string | null;
  referencia: string | null;
  numero_carro: string | null;
  carroResuelto: string | null;
  estado_conciliacion: string;
  origen?: string | null;
  contrato_id?: string | null;
  contratoLabel?: string | null;
  comprobante_url: string | null;
  notas: string | null;
  created_at: string;
  rubro?: string | null;
  destino_interior?: string | null;
  signedUrl?: string | null;
  salida?: SalidaFila | null;
  alertaCuenta: boolean;
  empresa: string | null;
};

export type ContratoOpt = {
  /** UUID de contrato, o `ex:<uuid>` si es deuda de Excel sin contrato. */
  id: string;
  label: string;
  empresa: string | null;
  /** Solo contratos vivos. Ex clientes van en su propio grupo. */
  activo: boolean;
  /** `ex` = lista de cobro (Excel/manual/archivo sin amarre usable en Activos). */
  grupo?: "contrato" | "ex";
};
