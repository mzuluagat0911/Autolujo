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
import { cuentaAUnDigito, digitos, mismaCuenta } from "./cuenta";
import { canonReferencia, esMismoComprobante } from "./cruce";

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
export { cuentaAUnDigito, digitos, mismaCuenta } from "./cuenta";

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
  const refCanon = canonReferencia(ref);
  if (ref) {
    const { data: previos } = await sb
      .from("pagos")
      .select("id, fecha, monto, referencia")
      .ilike("referencia", `%${escaparLike(refCanon ?? ref)}%`)
      .neq("estado_conciliacion", "rechazado")
      .limit(30);
    const p = ((previos ?? []) as { id: string; fecha: string; monto: number; referencia: string | null }[])
      .find((row) => {
        if (refCanon) return canonReferencia(row.referencia) === refCanon;
        return (row.referencia ?? "").trim().toLowerCase() === ref.toLowerCase();
      }) ?? null;
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
  // La hora guardada de un pago conciliado es la de la conciliación, no la del
  // papel: no sirve para decir que dos números distintos son la misma captura.
  // Si no se ve el número y ya hay un pago igual, primero se pide la captura.
  // Si ya se pidió y no llega el número: hora distinta → el equipo lo revisa
  // antes de aplicarlo; sin hora o la misma hora → es el mismo comprobante.
  const fechaComp = (c.fecha && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : null) ?? hoyPanama();
  const montoComp = c.monto != null && c.monto > 0 ? Number(c.monto) : null;
  if (crearPago && contratoId && montoComp != null) {
    const { data: delDia } = await sb
      .from("pagos")
      .select("id, monto, origen, fecha, pagado_at, referencia, cuenta_destino, numero_carro, contrato_id")
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
      cuenta_destino: string | null;
      numero_carro: string | null;
      contrato_id: string | null;
    }[]).filter((p) => Math.abs(Number(p.monto) - montoComp) < 0.02);
    if (mismos.length > 0) {
      const mismaRef = refCanon
        ? mismos.some((p) => canonReferencia(p.referencia) === refCanon)
        : false;
      if (refCanon && mismaRef) {
        crearPago = false;
        pagoDuplicadoId = mismos.find((p) => canonReferencia(p.referencia) === refCanon)?.id ?? mismos[0]!.id;
        alertas.push({
          codigo: "duplicado",
          detalle: `La referencia ${ref} ya está en un pago de hoy por $${montoComp.toFixed(2)}.`,
        });
      } else if (!refCanon) {
        const primero = mismos[0]!;
        if (!opts.yaPidieronReferencia) {
          crearPago = false;
          pagoDuplicadoId = primero.id;
          alertas.push({
            codigo: "pedir_referencia",
            detalle: `Ya hay un pago del ${fechaComp} por $${montoComp.toFixed(2)} y esta captura no trae número de confirmación.`,
          });
        } else {
          const igual = mismos.some((p) =>
            esMismoComprobante(
              {
                monto: montoComp,
                fecha: fechaComp,
                referencia: ref,
                cuentaDestino: c.cuenta_destino,
                numeroCarro: c.numero_carro,
                contratoId,
              },
              {
                monto: Number(p.monto),
                fecha: p.fecha,
                pagadoAt: p.pagado_at,
                referencia: p.referencia,
                cuentaDestino: p.cuenta_destino,
                numeroCarro: p.numero_carro,
                contratoId: p.contrato_id,
              },
            ),
          );
          if (igual) {
            crearPago = false;
            pagoDuplicadoId = primero.id;
            alertas.push({
              codigo: "reenvio_dia",
              detalle: `Es el mismo comprobante de $${montoComp.toFixed(2)} del ${fechaComp}. No se vuelve a cargar.`,
            });
          } else {
            const horaNueva = normalizarHora(c.hora);
            pagoDuplicadoId = primero.id;
            alertas.push({
              codigo: "hora_distinta",
              detalle: `Aviso: ya hay un pago del ${fechaComp} por $${montoComp.toFixed(2)}${horaNueva ? ` y esta captura marca las ${horaNueva}` : ""}, pero no coinciden todos los datos. Queda en revisión.`,
            });
          }
        }
      }
    }
  }

  // Sin contrato amarrado: el mismo número, monto y día tampoco se vuelve a cargar.
  if (crearPago && refCanon && montoComp != null) {
    const { data: porDia } = await sb
      .from("pagos")
      .select("id, fecha, monto, referencia")
      .eq("fecha", fechaComp)
      .neq("estado_conciliacion", "rechazado")
      .limit(40);
    const otro = ((porDia ?? []) as { id: string; fecha: string; monto: number; referencia: string | null }[])
      .find((row) => canonReferencia(row.referencia) === refCanon && Math.abs(Number(row.monto) - montoComp) < 0.02);
    if (otro) {
      crearPago = false;
      pagoDuplicadoId = otro.id;
      alertas.push({
        codigo: "duplicado",
        detalle: `La referencia ${ref} ya está registrada (pago del ${otro.fecha} por $${otro.monto}).`,
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

    let calce = filas.find((f) => f.numero_cuenta && mismaCuenta(c.cuenta_destino!, f.numero_cuenta));
    if (!calce) {
      const cercanas = filas.filter(
        (f) => f.numero_cuenta && cuentaAUnDigito(c.cuenta_destino!, f.numero_cuenta),
      );
      // Un solo dígito de más o de menos, y una sola cuenta nuestra así: es
      // la lectura la que falló, no el cliente. Se guarda el número real.
      if (cercanas.length === 1 && cercanas[0]?.numero_cuenta) {
        c.cuenta_destino = cercanas[0].numero_cuenta;
        calce = cercanas[0];
      }
    }
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

const NOTA_REPETIDO =
  "AVISO: comprobante repetido (mismos monto, día, referencia, cuenta y carro). Rechazado; no queda en comprobantes ni en revisión.";

type PagoCruceFila = {
  id: string;
  created_at?: string;
  monto: number;
  fecha: string | null;
  pagado_at: string | null;
  referencia: string | null;
  cuenta_destino: string | null;
  contrato_id: string | null;
  numero_carro: string | null;
  estado_conciliacion: string;
  origen: string | null;
  notas: string | null;
};

function comoCruce(q: PagoCruceFila) {
  return {
    monto: Number(q.monto),
    fecha: q.fecha,
    pagadoAt: q.pagado_at,
    referencia: q.referencia,
    cuentaDestino: q.cuenta_destino,
    numeroCarro: q.numero_carro,
    contratoId: q.contrato_id,
  };
}

/**
 * Un comprobante pendiente que repite todos los datos de uno anterior se rechaza.
 * El primero se queda. Así no vuelve a salir en la cola.
 */
export async function rechazarComprobantesRepetidos(): Promise<number> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("pagos")
    .select("id, created_at, monto, fecha, pagado_at, referencia, cuenta_destino, contrato_id, numero_carro, estado_conciliacion, origen, notas")
    .neq("estado_conciliacion", "rechazado")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error || !data) return 0;
  const vivos = data as PagoCruceFila[];
  const rechazar: { id: string; notas: string | null }[] = [];
  for (let i = 0; i < vivos.length; i++) {
    const p = vivos[i];
    if (p.estado_conciliacion !== "pendiente" || p.origen !== "comprobante") continue;
    // Recuperados sin lectura (monto 0) no se comen entre sí ni a otros.
    if ((p.notas ?? "").includes("RECUPERADO_SIN_LECTURA")) continue;
    const previo = vivos.slice(0, i).find((q) => {
      if ((q.notas ?? "").includes("RECUPERADO_SIN_LECTURA")) return false;
      return esMismoComprobante(comoCruce(p), comoCruce(q));
    });
    if (previo) rechazar.push({ id: p.id, notas: p.notas });
  }
  for (const p of rechazar) {
    const notas = [p.notas, NOTA_REPETIDO].filter(Boolean).join(" · ");
    await sb.from("pagos").update({ estado_conciliacion: "rechazado", notas }).eq("id", p.id);
  }
  return rechazar.length + (await rechazarRecuperadosConLectura());
}

const NOTA_RECUPERADO_SOBRA =
  "AVISO: esta foto ya tiene su comprobante leído. La fila de $0 de recuperación sobra; queda rechazada.";

/** Fila de $0 de recuperación cuya foto ya tiene otro comprobante vivo. */
async function rechazarRecuperadosConLectura(): Promise<number> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("pagos")
    .select("id, comprobante_url, notas")
    .eq("estado_conciliacion", "pendiente")
    .eq("origen", "comprobante")
    .eq("monto", 0)
    .ilike("notas", "%RECUPERADO_SIN_LECTURA%")
    .not("comprobante_url", "is", null)
    .limit(300);
  const filas = (data ?? []) as { id: string; comprobante_url: string; notas: string | null }[];
  if (filas.length === 0) return 0;
  const { data: otros } = await sb
    .from("pagos")
    .select("id, comprobante_url, monto, notas")
    .in("comprobante_url", [...new Set(filas.map((f) => f.comprobante_url))])
    .neq("estado_conciliacion", "rechazado");
  const vivos = ((otros ?? []) as { id: string; comprobante_url: string; monto: number; notas: string | null }[])
    .filter((o) => !(Number(o.monto) === 0 && (o.notas ?? "").includes("RECUPERADO_SIN_LECTURA")));
  let n = 0;
  for (const f of filas) {
    const tieneOtro = vivos.some((o) => o.comprobante_url === f.comprobante_url && o.id !== f.id);
    if (!tieneOtro) continue;
    const notas = [f.notas, NOTA_RECUPERADO_SOBRA].filter(Boolean).join(" · ");
    const { error } = await sb
      .from("pagos")
      .update({ estado_conciliacion: "rechazado", notas })
      .eq("id", f.id)
      .eq("estado_conciliacion", "pendiente")
      .eq("monto", 0);
    if (!error) n++;
  }
  return n;
}

/**
 * Devuelve a la cola los comprobantes que se rechazaron como "repetidos" con la
 * regla vieja (mismo día/monto sin compartir contrato ni carro). La foto ya
 * estaba en el chat; al abrir Comprobantes desaparecían.
 */
export async function restaurarComprobantesMalRechazados(): Promise<number> {
  const sb = createServerSupabase();
  const { data: marcados, error } = await sb
    .from("pagos")
    .select("id, created_at, monto, fecha, pagado_at, referencia, cuenta_destino, contrato_id, numero_carro, estado_conciliacion, origen, notas")
    .eq("estado_conciliacion", "rechazado")
    .eq("origen", "comprobante")
    .ilike("notas", `%${NOTA_REPETIDO.slice(0, 40)}%`)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error || !marcados?.length) return 0;

  const { data: vivosRaw } = await sb
    .from("pagos")
    .select("id, created_at, monto, fecha, pagado_at, referencia, cuenta_destino, contrato_id, numero_carro, estado_conciliacion, origen, notas")
    .neq("estado_conciliacion", "rechazado")
    .order("created_at", { ascending: true })
    .limit(1000);
  const vivos = (vivosRaw ?? []) as PagoCruceFila[];

  let restaurados = 0;
  for (const p of marcados as PagoCruceFila[]) {
    const sigueRepetido = vivos.some((q) => esMismoComprobante(comoCruce(p), comoCruce(q)));
    if (sigueRepetido) continue;
    const notas = (p.notas ?? "")
      .split(" · ")
      .map((t) => t.trim())
      .filter((t) => t && !t.includes("comprobante repetido"))
      .join(" · ") || null;
    const { error: updErr } = await sb
      .from("pagos")
      .update({ estado_conciliacion: "pendiente", notas })
      .eq("id", p.id)
      .eq("estado_conciliacion", "rechazado");
    if (updErr) continue;
    vivos.push({ ...p, estado_conciliacion: "pendiente", notas });
    restaurados++;
  }
  return restaurados;
}

/** Resumen de las alertas para dejarlo en las notas del pago / la conversación. */
export function resumirAlertas(alertas: Alerta[]): string {
  return alertas.map((a) => a.detalle).join(" · ");
}

export function pagoEsperaRevisionDosPagos(notas: string | null | undefined): boolean {
  return (notas ?? "").includes(MARCA_REVISION_DOS_PAGOS);
}
