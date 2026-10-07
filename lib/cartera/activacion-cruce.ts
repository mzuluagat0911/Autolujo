// Fase 4. Primera llave: el dinero se mueve solo si el motor y la sombra
// coinciden, y el ancla es carro inequívoco o la referencia exacta del voucher.
// `motor` apaga la llave y vuelve a aplicar todo lo que decidirMovimiento llama perfecto.

import type { VeredictoCruce } from "./cruce";
import type { RecomendacionSombra } from "./puntaje-cruce";

export type NivelActivacion = "motor" | "maxima";

export const NIVEL_ACTIVACION: NivelActivacion = "maxima";

export function versionMotor(nivel: NivelActivacion = NIVEL_ACTIVACION): string {
  return nivel === "maxima" ? "maxima-v1" : "cimientos-v1";
}

export function aplicarEnEsteNivel(
  motor: VeredictoCruce,
  sombra: RecomendacionSombra,
  nivel: NivelActivacion = NIVEL_ACTIVACION,
): { aplicar: boolean; retenido: boolean; motivo: string } {
  const quiere = motor.tipo === "perfecto" || motor.tipo === "repetido";
  if (!quiere) return { aplicar: false, retenido: false, motivo: "" };
  if (nivel === "motor") return { aplicar: true, retenido: false, motivo: "" };

  const candidato = sombra.candidatos.find((c) => c.pagoId === motor.pago.id);
  const anclaMaxima = Boolean(
    candidato &&
      !candidato.bloqueado &&
      candidato.senales.some((s) => s.codigo === "carro" || s.codigo === "referencia_exacta"),
  );
  if (sombra.tipo === "automatico" && sombra.pagoId === motor.pago.id && anclaMaxima) {
    return { aplicar: true, retenido: false, motivo: "" };
  }

  return {
    aplicar: false,
    retenido: true,
    motivo:
      "Queda en revisión: hace falta carro inequívoco o la referencia exacta del voucher, y que la sombra esté de acuerdo.",
  };
}
