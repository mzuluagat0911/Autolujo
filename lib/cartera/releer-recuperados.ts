// Rellena monto/datos de los pagos recuperados sin lectura, ahora que hay crédito.

import { leerComprobantes } from "@/lib/ai/comprobante";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, pagadoAtDesdeForm } from "@/lib/cartera/fecha";
import { bajarArchivoComprobante } from "@/lib/cartera/pipeline";
import { MARCA_RECUPERADO_SIN_LECTURA } from "@/lib/cartera/recuperar-comprobantes-hoy";
import {
  MARCA_REVISION_DOS_PAGOS,
  resumirAlertas,
  validarComprobante,
} from "@/lib/cartera/comprobante-validacion";

type PagoRecuperado = {
  id: string;
  comprobante_url: string | null;
  contrato_id: string | null;
  cliente_id: string | null;
  numero_carro: string | null;
  notas: string | null;
};

export async function listarPagosSinLectura(limite = 20): Promise<PagoRecuperado[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("pagos")
    .select("id, comprobante_url, contrato_id, cliente_id, numero_carro, notas, estado_conciliacion, origen, created_at")
    .eq("estado_conciliacion", "pendiente")
    .eq("origen", "comprobante")
    .ilike("notas", "%RECUPERADO_SIN_LECTURA%")
    .order("created_at", { ascending: true })
    .limit(limite);
  if (error || !data) return [];
  return (data as PagoRecuperado[]).filter((p) => !!p.comprobante_url);
}

/** La fila de $0 repite un comprobante que ya está: se rechaza, el primero se queda. */
async function rechazarRepetido(pago: PagoRecuperado, motivo: string): Promise<void> {
  const sb = createServerSupabase();
  const notas = [
    ...(pago.notas ?? "")
      .split(" · ")
      .map((t) => t.trim())
      .filter((t) => t && !t.includes("RECUPERADO_SIN_LECTURA")),
    `AVISO: comprobante repetido. ${motivo} Rechazado; el primero se queda.`,
  ].join(" · ");
  await sb
    .from("pagos")
    .update({ estado_conciliacion: "rechazado", notas })
    .eq("id", pago.id)
    .eq("estado_conciliacion", "pendiente");
}

async function releerUno(pago: PagoRecuperado): Promise<{ ok: boolean; detalle: string }> {
  const sb = createServerSupabase();
  const path = pago.comprobante_url;
  if (!path) return { ok: false, detalle: "sin_url" };

  const bytes = await bajarArchivoComprobante(path);
  if (!bytes) return { ok: false, detalle: "no_baja" };

  const lista = (await leerComprobantes(bytes, "image/jpeg")).filter((c) => c.es_comprobante);
  if (lista.length === 0) {
    const notas = [
      (pago.notas ?? "").replace(MARCA_RECUPERADO_SIN_LECTURA, "").trim(),
      "LECTURA_IA: la foto no se ve como comprobante. Revisar a mano.",
    ]
      .filter(Boolean)
      .join(" · ");
    await sb.from("pagos").update({ notas }).eq("id", pago.id);
    return { ok: false, detalle: "no_es_comprobante" };
  }

  const primero = lista[0]!;
  // Ya no se le puede pedir la captura al cliente: sin número, la misma hora
  // o sin hora es el mismo comprobante.
  const veredicto = await validarComprobante({
    comprobante: primero,
    contratoId: pago.contrato_id,
    yaPidieronReferencia: true,
    comprobantePath: path,
    excluirPagoId: pago.id,
  });
  if (!veredicto.crearPago) {
    await rechazarRepetido(pago, resumirAlertas(veredicto.alertas));
    return { ok: true, detalle: "repetido_rechazado" };
  }

  const fechaLeida =
    primero.fecha && /^\d{4}-\d{2}-\d{2}$/.test(primero.fecha) ? primero.fecha : null;
  const horaLeida =
    primero.hora && /^([01]?\d|2[0-3]):[0-5]\d$/.test(primero.hora)
      ? primero.hora.slice(0, 5)
      : null;
  const fechaPago = fechaLeida ?? hoyPanama();
  const pagadoAt = horaLeida ? pagadoAtDesdeForm(fechaPago, horaLeida) : new Date().toISOString();

  const notasBase = (pago.notas ?? "")
    .split(" · ")
    .map((t) => t.trim())
    .filter((t) => t && !t.includes("RECUPERADO_SIN_LECTURA") && !t.startsWith("LECTURA_IA:"));
  const notas = [
    ...notasBase,
    `Lectura IA (confianza: ${primero.confianza}).`,
    veredicto.alertas.length ? `ALERTAS: ${resumirAlertas(veredicto.alertas)}` : null,
    veredicto.alertas.some((a) => a.codigo === "hora_distinta") ? MARCA_REVISION_DOS_PAGOS : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const patchBase = {
    monto: primero.monto ?? 0,
    banco: primero.banco,
    cuenta_destino: primero.cuenta_destino,
    fecha: fechaPago,
    pagado_at: pagadoAt,
    numero_carro: primero.numero_carro ?? pago.numero_carro,
  };
  const { error } = await sb
    .from("pagos")
    .update({
      ...patchBase,
      referencia: primero.referencia,
      notas,
    })
    .eq("id", pago.id)
    .eq("estado_conciliacion", "pendiente");
  // El índice único de referencia: otro pago ya tiene ese número.
  if (error?.code === "23505") {
    await rechazarRepetido(pago, `La referencia ${primero.referencia ?? ""} ya está registrada.`);
    return { ok: true, detalle: "repetido_rechazado" };
  }
  if (error) return { ok: false, detalle: error.message };

  // Si la foto traía varios comprobantes, nace un pago extra por cada uno.
  for (const extra of lista.slice(1)) {
    const v2 = await validarComprobante({
      comprobante: extra,
      contratoId: pago.contrato_id,
      yaPidieronReferencia: true,
      comprobantePath: path,
    });
    if (!v2.crearPago) continue;
    const f2 =
      extra.fecha && /^\d{4}-\d{2}-\d{2}$/.test(extra.fecha) ? extra.fecha : fechaPago;
    const h2 =
      extra.hora && /^([01]?\d|2[0-3]):[0-5]\d$/.test(extra.hora) ? extra.hora.slice(0, 5) : null;
    await sb.from("pagos").insert({
      contrato_id: pago.contrato_id,
      cliente_id: pago.cliente_id,
      fecha: f2,
      pagado_at: h2 ? pagadoAtDesdeForm(f2, h2) : new Date().toISOString(),
      monto: extra.monto ?? 0,
      banco: extra.banco,
      referencia: extra.referencia,
      cuenta_destino: extra.cuenta_destino,
      comprobante_url: path,
      numero_carro: extra.numero_carro ?? pago.numero_carro,
      origen: "comprobante",
      estado_conciliacion: "pendiente",
      notas: [
        `Lectura IA extra (confianza: ${extra.confianza}). Misma foto recuperada.`,
        v2.alertas.length ? `ALERTAS: ${resumirAlertas(v2.alertas)}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return {
    ok: true,
    detalle: `$${Number(primero.monto ?? 0).toFixed(2)}${lista.length > 1 ? ` +${lista.length - 1}` : ""}`,
  };
}

/** Lee un lote de pagos recuperados sin visión. */
export async function releerPagosRecuperados(limite = 8): Promise<{
  pendientes: number;
  leidos: number;
  fallidos: number;
  detalles: string[];
}> {
  const lote = await listarPagosSinLectura(limite);
  let leidos = 0;
  let fallidos = 0;
  const detalles: string[] = [];
  for (const p of lote) {
    try {
      const r = await releerUno(p);
      if (r.ok) {
        leidos++;
        detalles.push(`${p.id.slice(0, 8)}… ${r.detalle}`);
      } else {
        fallidos++;
        detalles.push(`${p.id.slice(0, 8)}… ${r.detalle}`);
      }
    } catch (e) {
      fallidos++;
      const msg = e instanceof Error ? e.message : String(e);
      detalles.push(`${p.id.slice(0, 8)}… ${msg.slice(0, 160)}`);
    }
  }
  return { pendientes: lote.length, leidos, fallidos, detalles: detalles.slice(0, 12) };
}
