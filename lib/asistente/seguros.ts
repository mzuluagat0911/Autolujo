// Choques y finiquitos para el asistente. Solo lectura.

import { etiquetaCarroUi } from "@/lib/cartera/empresa";
import { hoyPanama } from "@/lib/cartera/fecha";
import { listarCasos } from "@/lib/seguros/datos";
import { cerrado } from "@/lib/seguros/modelo";
import { pistaDeCarro } from "./cobro";

const TOPE = 30;

function mesOk(raw: string | undefined, hoy: string): string | { error: string } {
  if (!raw || !raw.trim()) return hoy.slice(0, 7);
  const m = raw.trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return { error: "El mes va como YYYY-MM (ej. 2026-11)." };
  return m;
}

/** Quién cobró finiquito. Mes = fechaPago. Carro opcional. */
export async function pagosChoque(opts: { mes?: string; carro?: string }) {
  const hoy = hoyPanama();
  const mes = mesOk(opts.mes, hoy);
  if (typeof mes !== "string") return mes;

  let casos;
  try {
    casos = await listarCasos();
  } catch {
    return { error: "No pude leer los choques." };
  }

  let lista = casos.filter((c) => c.caso.seccion === "pagado" && c.caso.fechaPago.startsWith(mes));
  if (opts.carro?.trim()) {
    const pista = pistaDeCarro(opts.carro);
    lista = lista.filter(
      (c) =>
        pista.numeros.includes(c.numero) &&
        (!pista.empresa || (c.empresa ?? "").toUpperCase() === pista.empresa),
    );
    if (lista.length === 0) {
      return {
        mes,
        carro: opts.carro.trim(),
        total: 0,
        monto: 0,
        pagos: [],
        nota: `No hay finiquitos pagados en ${mes} para ese carro.`,
      };
    }
  }

  lista.sort(
    (a, b) =>
      b.caso.fechaPago.localeCompare(a.caso.fechaPago) ||
      a.numero.localeCompare(b.numero, "es", { numeric: true }),
  );
  const monto = lista.reduce((s, c) => s + (c.caso.montoFiniquito ?? 0), 0);
  return {
    mes,
    total: lista.length,
    monto,
    recortado: lista.length > TOPE,
    pagos: lista.slice(0, TOPE).map((c) => ({
      carro: etiquetaCarroUi(c.empresa, c.numero),
      placa: c.placa || null,
      cliente: c.caso.clienteNombre || null,
      fechaPago: c.caso.fechaPago,
      fechaChoque: c.fecha,
      monto: c.caso.montoFiniquito,
      aseguradora: c.caso.aseguradora || null,
    })),
  };
}

/** Pulso de choques: abiertos, audiencia, pagados del mes, totales. */
export async function resumenSeguros(opts: { mes?: string } = {}) {
  const hoy = hoyPanama();
  const mes = mesOk(opts.mes, hoy);
  if (typeof mes !== "string") return mes;

  let casos;
  try {
    casos = await listarCasos();
  } catch {
    return { error: "No pude leer los choques." };
  }

  const abiertos = casos.filter((c) => !cerrado(c.caso.seccion));
  const audiencia = casos.filter((c) => c.caso.seccion === "audiencia");
  const pagadosMes = casos.filter(
    (c) => c.caso.seccion === "pagado" && c.caso.fechaPago.startsWith(mes),
  );
  const montoPagado = pagadosMes.reduce((s, c) => s + (c.caso.montoFiniquito ?? 0), 0);
  const choquesMes = casos.filter((c) => c.fecha.startsWith(mes));
  const porConfirmar = casos.filter((c) => c.caso.porConfirmar && !cerrado(c.caso.seccion));

  return {
    mes,
    total: casos.length,
    abiertos: abiertos.length,
    audiencia: audiencia.length,
    porConfirmar: porConfirmar.length,
    choquesDelMes: choquesMes.length,
    pagadosMes: pagadosMes.length,
    montoPagadoMes: montoPagado,
    nota: "pagadosMes y montoPagadoMes usan fechaPago, no la fecha del choque.",
  };
}
