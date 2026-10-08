// Archivo del estado de cuenta. Los montos salen del extracto que ya ve la
// pantalla: "A pagar hoy" es el total del día. El resto son saldos del libro
// (domingo, mantenimiento, acuerdo) y no se suman otra vez a ese total.

import {
  esAdelantado,
  money,
  textoEstadoCuotas,
  textoSituacionCuotas,
  type EstadoCuenta,
} from "./estado-cuenta";
import { siglaEmpresa, etiquetaCarroUi } from "./empresa";
import { categoriaDeEtiqueta, esEtiquetaDomingo } from "./prioridad-extras";
import type { EstadoCuentaFila } from "@/app/cartera/estados-cuenta/types";

export type UltimoPago = { fecha: string; monto: number; hora?: string | null };

const COLUMNAS = [
  "Nombre",
  "Carro",
  "Empresa",
  "Situación",
  "A pagar hoy",
  "Letra diaria",
  "Cuentas",
  "Pendientes",
  "Domingos",
  "Mantenimiento",
  "Acuerdos",
  "Recargos",
  "Otros",
  "Detalle de otros",
  "Último pago",
  "Fecha y hora último pago",
  "Cuotas del contrato",
  "Desglose de hoy",
  "Observación",
] as const;

function celda(v: string): string {
  if (/[;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function monto(n: number): string {
  return money(Math.max(Number(n) || 0, 0));
}

function situacion(e: EstadoCuentaFila): string {
  if (e.totalCobrarHoy <= 0.009 && !e.pendiente && !esAdelantado(e)) return "Al día";
  return textoSituacionCuotas(e);
}

function cuentasDeHoy(e: EstadoCuentaFila): number {
  const deLinea = (e.lineasCobro ?? [])
    .filter((l) => !l.aviso && l.etiqueta === "cuenta")
    .reduce((s, l) => s + l.monto, 0);
  if (deLinea > 0.009) return deLinea;
  return Math.max(Number(e.cuenta) || 0, 0);
}

function otrosDe(e: EstadoCuentaFila): { total: number; detalle: string } {
  const partes: string[] = [];
  let total = 0;
  for (const x of e.extras ?? []) {
    if (x.monto <= 0.009) continue;
    if (esEtiquetaDomingo(x.etiqueta)) continue;
    const cat = categoriaDeEtiqueta(x.etiqueta);
    if (cat === "mantenimiento" || cat === "acuerdo" || cat === "domingo") continue;
    if (/por no pagar|cierre(\s+de)?\s+semana|recargo/i.test(x.etiqueta)) continue;
    total += x.monto;
    partes.push(`${x.etiqueta} ${money(x.monto)}`);
  }
  return { total, detalle: partes.join(" · ") };
}

function mantenimientoDe(e: EstadoCuentaFila): number {
  return (e.extras ?? [])
    .filter((x) => x.monto > 0.009 && categoriaDeEtiqueta(x.etiqueta) === "mantenimiento")
    .reduce((s, x) => s + x.monto, 0);
}

function observacion(e: EstadoCuenta): string {
  const partes: string[] = [];
  if (e.enTaller) {
    const nombre = e.tallerEtiqueta || "En taller";
    const desde = e.tallerDesde ? ` desde ${e.tallerDesde}` : "";
    const hasta = e.tallerHasta ? ` · vuelve ${e.tallerHasta}` : "";
    partes.push(`${nombre}${desde}${hasta}`);
  }
  if (e.inactivo) {
    partes.push(e.inactivoDesde ? `Improductivo desde ${e.inactivoDesde}` : "Improductivo");
  }
  if (e.devuelto) {
    partes.push(e.devueltoDesde ? `Devuelto desde ${e.devueltoDesde}` : "Devuelto");
  }
  if (e.pendiente) partes.push("Comprobante en validación");
  return partes.join(" · ");
}

export function filasCsvEstado(
  estados: EstadoCuentaFila[],
  ultimos: Record<string, UltimoPago>,
): string[][] {
  return estados.map((e) => {
    const ultimo = ultimos[e.contratoId];
    const otros = otrosDe(e);
    return [
      e.clienteNombre,
      etiquetaCarroUi(e.empresa, e.vehiculoNumero),
      siglaEmpresa(e.empresa) || e.empresaNombre || "",
      situacion(e),
      monto(e.totalCobrarHoy),
      monto(e.letra),
      monto(cuentasDeHoy(e)),
      monto(e.pendienteAnterior),
      monto(e.domingoSaldo),
      monto(mantenimientoDe(e)),
      monto(e.acuerdoSaldo),
      monto(e.recargosAcumulados),
      monto(otros.total),
      otros.detalle,
      ultimo ? monto(ultimo.monto) : "",
      ultimo ? [ultimo.fecha, ultimo.hora].filter(Boolean).join(" ") : "",
      textoEstadoCuotas(e),
      e.desgloseCobro || e.desglose || "",
      observacion(e),
    ];
  });
}

/** CSV con separador ; para que Excel en español no parta los montos. */
export function csvEstadoCuenta(
  estados: EstadoCuentaFila[],
  ultimos: Record<string, UltimoPago>,
): string {
  const lineas = [COLUMNAS.join(";"), ...filasCsvEstado(estados, ultimos).map((f) => f.map(celda).join(";"))];
  return lineas.join("\r\n");
}
