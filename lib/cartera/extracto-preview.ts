// Texto de la letra diaria (mismo cuerpo que la plantilla extracto_detalle).
// Módulo puro: usable en cliente y servidor.

import { money, type EstadoCuenta } from "./estado-cuenta";
import {
  armarExtractoDiario,
  textoDesgloseExtracto,
  type LineaExtracto,
} from "./extracto-desglose";

export type ExtractoCtx = {
  acuerdoSaldo: number;
  extras: LineaExtracto[];
  preferencia?: string | null;
};

/** Sin saldo de días anteriores: solo le toca la cuota de hoy. */
export function estaAlDia(e: EstadoCuenta): boolean {
  return e.pendienteAnterior <= 0.009 && e.recargo <= 0.009;
}

function avisoRecargoDe(e: EstadoCuenta): string {
  return money(e.recargoSiTarda > 0.009 ? e.recargoSiTarda : e.penalidad);
}

/** Vars de `extracto_detalle`: nombre, fecha, carro, desglose, total, avisoRecargo. */
export function varsExtractoDetalle(e: EstadoCuenta, ctx?: ExtractoCtx): string[] {
  const [nombre, carro, fecha] = e.templateVars;
  const armado = armarExtractoDiario(e, {
    acuerdoSaldo: ctx?.acuerdoSaldo ?? 0,
    extras: ctx?.extras ?? [],
    preferencia: ctx?.preferencia,
  });
  return [
    nombre,
    fecha,
    carro,
    textoDesgloseExtracto(armado.lineas),
    money(armado.totalCobrarHoy),
    avisoRecargoDe(e),
  ];
}

/** Vista previa del WhatsApp que mandaría el cron / envío manual. */
export function previewEstadoCuenta(e: EstadoCuenta, ctx?: ExtractoCtx): string {
  const [nombre, fecha, carro, desglose, total, avisoRecargo] = varsExtractoDetalle(e, ctx);
  return [
    `Buen día ${nombre} 🌞`,
    ``,
    `❌ EXTRACTO DIARIO`,
    ``,
    fecha,
    ``,
    `🔹 Carro ${carro}`,
    ``,
    ...desglose.split(" · ").filter(Boolean),
    ``,
    `*DEBE TOTAL PAGAR HOY: ${total}*`,
    ``,
    `*RECUERDE:* El sistema cierra a las 7:00 p.m.`,
    `*Se genera ${avisoRecargo} de recargo por no pagar.*`,
    ``,
    `Envíanos tu comprobante por aquí. ¡Gracias!`,
  ].join("\n");
}

/** Total a cobrar hoy según la misma regla del extracto (un extra/día). */
export function totalCobrarHoyExtracto(e: EstadoCuenta, ctx?: ExtractoCtx): number {
  return armarExtractoDiario(e, {
    acuerdoSaldo: ctx?.acuerdoSaldo ?? 0,
    extras: ctx?.extras ?? [],
    preferencia: ctx?.preferencia,
  }).totalCobrarHoy;
}
