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
import { hoyPanama, horaPanama, sumarDias } from "./fecha";
import { digitos, mismaCuenta } from "./cuenta";

/** Texto exacto que el agente manda cuando faltó el número. Sirve para saber que ya se pidió. */
export const FRASE_PEDIR_CONFIRMACION =
  "Mándeme una captura donde se vea el número de confirmación de la transferencia.";

/** El banco no lo cruza solo: el equipo confirma que sí fueron dos pagos. */
export const MARCA_REVISION_DOS_PAGOS = "REVISION_DOS_PAGOS";

/** Días hacia atrás que se aceptan sin levantar la mano. */
const DIAS_TOLERANCIA = 7;

export type Alerta = {
  codigo:
    | "duplicado"
    | "reenvio_dia"
    | "pedir_referencia"
    | "hora_distinta"
    | "cuenta_ajena"
    | "cuenta_otra_empresa"
    | "fecha_vieja"
    | "fecha_futura"
    | "moneda_no_esperada"
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

function normalizarHora(hora: string | null | undefined): string | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((hora ?? "").trim());
  if (!m) return null;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

export async function validarComprobante(opts: {
  comprobante: Comprobante;
  /** Empresa del carro al que se va a aplicar, si ya se resolvió. */
  empresaId?: string | null;
  /**
   * Contrato del chat (si ya está vinculado). Sirve para detectar reenvíos del
   * día en el lanzamiento: el cliente manda de nuevo el comprobante que ya
   * quedó cargado por Excel / otro canal, sin referencia bancaria en el primero.
   */
  contratoId?: string | null;
  /** Ya le pedimos en este chat la captura con el número de confirmación. */
  yaPidieronReferencia?: boolean;
}): Promise<Veredicto> {
  const sb = createServerSupabase();
  const { comprobante: c, empresaId, contratoId } = opts;
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

  // --- 1b. Mismo día y mismo monto ------------------------------------------
  // Si el número de confirmación es distinto, son dos pagos: no se pide nada.
  // Si no se ve el número y ya hay un pago igual, primero se pide la captura.
  // Si ya se pidió y no llega el número: hora distinta → el equipo lo revisa
  // antes de aplicarlo; sin hora o la misma hora → es el mismo comprobante.
  const fechaComp = (c.fecha && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : null) ?? hoyPanama();
  const montoComp = c.monto != null && c.monto > 0 ? Number(c.monto) : null;
  if (crearPago && contratoId && montoComp != null) {
    const { data: delDia } = await sb
      .from("pagos")
      .select("id, monto, origen, fecha, pagado_at, referencia")
      .eq("contrato_id", contratoId)
      .eq("fecha", fechaComp)
      .neq("estado_conciliacion", "rechazado")
      .limit(20);
    const mismos = ((delDia ?? []) as {
      id: string;
      monto: number;
      origen: string | null;
      fecha: string;
      pagado_at: string | null;
      referencia: string | null;
    }[]).filter((p) => Math.abs(Number(p.monto) - montoComp) < 0.02);
    if (mismos.length > 0) {
      const refNueva = ref.toLowerCase();
      const mismaRef = refNueva
        ? mismos.some((p) => (p.referencia ?? "").trim().toLowerCase() === refNueva)
        : false;
      if (refNueva && mismaRef) {
        crearPago = false;
        pagoDuplicadoId = mismos.find((p) => (p.referencia ?? "").trim().toLowerCase() === refNueva)?.id ?? mismos[0]!.id;
        alertas.push({
          codigo: "duplicado",
          detalle: `La referencia ${ref} ya está en un pago de hoy por $${montoComp.toFixed(2)}.`,
        });
      } else if (!refNueva) {
        const primero = mismos[0]!;
        if (!opts.yaPidieronReferencia) {
          crearPago = false;
          pagoDuplicadoId = primero.id;
          alertas.push({
            codigo: "pedir_referencia",
            detalle: `Ya hay un pago del ${fechaComp} por $${montoComp.toFixed(2)} y esta captura no trae número de confirmación.`,
          });
        } else {
          const horaNueva = normalizarHora(c.hora);
          const horasPrevias = mismos
            .map((p) => (p.pagado_at ? horaPanama(new Date(p.pagado_at)) : null))
            .filter((h): h is string => !!h);
          const horaRepetida = !!horaNueva && horasPrevias.includes(horaNueva);
          if (!horaNueva || horaRepetida) {
            crearPago = false;
            pagoDuplicadoId = primero.id;
            alertas.push({
              codigo: "reenvio_dia",
              detalle: horaRepetida
                ? `La hora ${horaNueva} es la del pago que ya está registrado. Es el mismo comprobante.`
                : `No se lee la hora ni el número de confirmación. Se toma como el mismo comprobante de $${montoComp.toFixed(2)}.`,
            });
          } else {
            pagoDuplicadoId = primero.id;
            alertas.push({
              codigo: "hora_distinta",
              detalle: `Mismo monto ($${montoComp.toFixed(2)}) sin número de confirmación, hora ${horaNueva} distinta a ${horasPrevias.join(", ") || "la del primer pago"}. Lo revisa el equipo antes de aplicarlo.`,
            });
          }
        }
      }
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

  // --- 3b. ¿La moneda es la esperada? ----------------------------------------
  // Cobramos en USD/balboas. Un comprobante en otra moneda (ej. pesos COP) suele
  // significar que se pagó a una cuenta que no es de la empresa, o un monto que
  // el lector podría malinterpretar por mil. Lo mira una persona.
  const moneda = (c.moneda ?? "").toUpperCase();
  if (moneda && !["USD", "B/.", "B/", "PAB", "BALBOAS", "DOLARES", "DÓLARES", "USD$", "$"].includes(moneda)) {
    alertas.push({
      codigo: "moneda_no_esperada",
      detalle: `El comprobante parece estar en ${c.moneda}, no en dólares/balboas.`,
    });
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

export function pagoEsperaRevisionDosPagos(notas: string | null | undefined): boolean {
  return (notas ?? "").includes(MARCA_REVISION_DOS_PAGOS);
}
