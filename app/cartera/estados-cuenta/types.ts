import type { EstadoCuenta } from "@/lib/cartera/estado-cuenta";
import type { LineaExtracto } from "@/lib/cartera/extracto-desglose";

/** Estado del panel con contexto de ledger para desglosar saldo anterior. */
export type EstadoCuentaFila = EstadoCuenta & {
  acuerdoSaldo: number;
  extras: LineaExtracto[];
  /** Misma cifra del extracto / WhatsApp. La situación cobra esto, no el ledger. */
  totalCobrarHoy: number;
  /** Mismas líneas que el mensaje. */
  lineasCobro: LineaExtracto[];
  /** Mismo texto del desglose que el mensaje. */
  desgloseCobro: string;
};
