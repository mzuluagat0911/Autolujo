// Validación antifraude de un comprobante ANTES de convertirlo en pago.
//
// Hasta ahora la única barrera era que la imagen "pareciera" un comprobante
// (`es_comprobante`). Eso deja pasar los tres fraudes clásicos:
//   1. reenviar la misma captura varias veces,
//   2. mandar un comprobante viejo como si fuera de hoy,
//   3. mandar una transferencia hecha a un tercero.
// Aquí se revisa lo que el código SÍ puede verificar contra la base.

import { createServerSupabase } from "@/lib/supabase/server";
import type { Comprobante } from "@/lib/ai/comprobante";
import { hoyPanama, sumarDias } from "./fecha";
import { digitos, mismaCuenta } from "./cuenta";

/** Días hacia atrás que se aceptan sin levantar la mano. */
const DIAS_TOLERANCIA = 7;

export type Alerta = {
  codigo:
    | "duplicado"
    | "cuenta_ajena"
    | "cuenta_otra_empresa"
    | "fecha_vieja"
    | "fecha_futura"
    | "sin_monto"
    | "lectura_dudosa";
  detalle: string;
};

export type Veredicto = {
  /** false = ni siquiera se crea el pago (ya existe). */
  crearPago: boolean;
  /** El caso necesita que lo mire una persona antes de dar nada por bueno. */
  revisionHumana: boolean;
  alertas: Alerta[];
  /** Id del pago previo cuando la referencia ya estaba registrada. */
  pagoDuplicadoId: string | null;
};

/** Solo los dígitos, para comparar cuentas escritas de mil formas. */
export { digitos, mismaCuenta } from "./cuenta";

/**
 * La referencia viene de un OCR. Un `%` o un `_` leídos de más convertirían el
 * `ilike` en un comodín que calza con cualquier pago: el comprobante legítimo
 * se descartaría como duplicado y el pago nunca se crearía.
 */
function escaparLike(v: string): string {
  return v.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function validarComprobante(opts: {
  comprobante: Comprobante;
  /** Empresa del carro al que se va a aplicar, si ya se resolvió. */
  empresaId?: string | null;
}): Promise<Veredicto> {
  const sb = createServerSupabase();
  const { comprobante: c, empresaId } = opts;
  const alertas: Alerta[] = [];
  let crearPago = true;
  let pagoDuplicadoId: string | null = null;

  // --- 1. ¿Ya registramos esta referencia? -----------------------------------
  const ref = (c.referencia ?? "").trim();
  if (ref) {
    const { data: previo } = await sb
      .from("pagos")
      .select("id, fecha, monto")
      .ilike("referencia", escaparLike(ref))
      .neq("estado_conciliacion", "rechazado")
      .limit(1)
      .maybeSingle();
    const p = previo as { id: string; fecha: string; monto: number } | null;
    if (p) {
      crearPago = false;
      pagoDuplicadoId = p.id;
      alertas.push({
        codigo: "duplicado",
        detalle: `La referencia ${ref} ya está registrada (pago del ${p.fecha} por $${p.monto}).`,
      });
    }
  }

  // --- 2. ¿La transferencia fue a una cuenta nuestra? ------------------------
  if (c.cuenta_destino && digitos(c.cuenta_destino).length >= 4) {
    const { data: cuentas } = await sb
      .from("cuentas_bancarias")
      .select("numero_cuenta, empresa_id, titular");
    const filas = (cuentas ?? []) as {
      numero_cuenta: string | null;
      empresa_id: string;
      titular: string | null;
    }[];

    const calce = filas.find((f) => f.numero_cuenta && mismaCuenta(c.cuenta_destino!, f.numero_cuenta));
    if (!calce) {
      alertas.push({
        codigo: "cuenta_ajena",
        detalle: `El comprobante dice que se transfirió a la cuenta ${c.cuenta_destino}, que no es de la empresa.`,
      });
    } else if (empresaId && calce.empresa_id !== empresaId) {
      alertas.push({
        codigo: "cuenta_otra_empresa",
        detalle: `El pago entró a la cuenta de ${calce.titular ?? "otra empresa"}, no a la del carro.`,
      });
    }
  }

  // --- 3. ¿La fecha del comprobante tiene sentido? ---------------------------
  const hoy = hoyPanama();
  if (c.fecha && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) {
    if (c.fecha > hoy) {
      alertas.push({ codigo: "fecha_futura", detalle: `El comprobante está fechado ${c.fecha}, en el futuro.` });
    } else if (c.fecha < sumarDias(hoy, -DIAS_TOLERANCIA)) {
      alertas.push({ codigo: "fecha_vieja", detalle: `El comprobante es del ${c.fecha}, hace más de ${DIAS_TOLERANCIA} días.` });
    }
  }

  // --- 4. Calidad de la lectura ----------------------------------------------
  if (c.monto == null || c.monto <= 0) {
    alertas.push({ codigo: "sin_monto", detalle: "No se pudo leer el monto del comprobante." });
  }
  if (c.confianza === "baja") {
    alertas.push({ codigo: "lectura_dudosa", detalle: "La lectura del comprobante quedó con confianza baja." });
  }

  return {
    crearPago,
    revisionHumana: alertas.length > 0,
    alertas,
    pagoDuplicadoId,
  };
}

/** Resumen de las alertas para dejarlo en las notas del pago / la conversación. */
export function resumirAlertas(alertas: Alerta[]): string {
  return alertas.map((a) => a.detalle).join(" · ");
}
