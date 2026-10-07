// Fase 5, en sombra. Reordena candidatos con alias y pesos aprendidos,
// marca anomalías y explica. No entra en aplicarEnEsteNivel: no mueve dinero.

import { canonNombre, extraerNombre } from "./cruce";
import type { CandidatoSombra } from "./puntaje-cruce";
import { TARIFAS_SALIDA_INTERIOR } from "./salidas-interior";

export const APRENDIZAJE_VERSION = "aprendizaje-v1";
export const MARCA_IMAGEN_PARECIDA = "APRENDIZAJE_IMAGEN:";
export const ALIAS_MINIMO = 2;

export const PESOS_INICIALES: PesosAprendizaje = {
  carro: 35,
  referencia_exacta: 40,
  referencia_texto: 8,
  monto: 25,
  fecha: 15,
  cuenta: 15,
  empresa: 10,
  contrato: 10,
  alias: 12,
  nombre: 6,
};

const TOPE: Record<string, [number, number]> = {
  alias: [0, 18],
  nombre: [0, 12],
  referencia_texto: [0, 20],
};

const APRENDIBLES = new Set(["alias", "nombre", "referencia_texto"]);

export type PesosAprendizaje = Record<string, number>;

export type AliasAprendido = {
  tipo: "remitente" | "cuenta_emisora";
  valor: string;
  contratoId: string;
  numero: string | null;
  veces: number;
  vigente: boolean;
};

export type RecomendacionAprendizaje = {
  version: typeof APRENDIZAJE_VERSION;
  tipo: "automatico" | "revision" | "omitido";
  puntaje: number | null;
  pagoId: string | null;
  contratoId: string | null;
  motivo: string;
  coincide: boolean;
  anomalias: string[];
};

export type EjemploAprendizaje = {
  senales: string[];
  resultado: "acierto" | "rechazo";
};

export function ajustarPesos(pesos: PesosAprendizaje, ejemplo: EjemploAprendizaje): PesosAprendizaje {
  const paso = ejemplo.resultado === "acierto" ? 1 : -1;
  const next = { ...PESOS_INICIALES, ...pesos };
  for (const codigo of ejemplo.senales) {
    if (!APRENDIBLES.has(codigo)) continue;
    const [min, max] = TOPE[codigo] ?? [0, 18];
    const actual = next[codigo] ?? 0;
    next[codigo] = Math.min(max, Math.max(min, actual + paso));
  }
  return next;
}

export function valorAlias(nombre: string | null, descripcion: string | null): string | null {
  const bruto = (nombre ?? "").trim() || extraerNombre(descripcion ?? "") || "";
  const canon = canonNombre(bruto);
  const palabras = canon.split(" ").filter((w) => w.length >= 3);
  if (palabras.length < 2 && canon.length < 8) return null;
  return canon || null;
}

export function aliasQueCalza(aliases: AliasAprendido[], nombre: string | null, descripcion: string | null): AliasAprendido | null {
  const valor = valorAlias(nombre, descripcion);
  if (!valor) return null;
  const vivos = aliases.filter((a) => a.vigente && a.veces >= ALIAS_MINIMO && a.tipo === "remitente" && a.valor === valor);
  if (vivos.length !== 1) return null;
  return vivos[0] ?? null;
}

export function senalesEnsenables(row: {
  numeroCarro?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
}): string[] {
  const senales = ["monto", "fecha"];
  if (row.numeroCarro) senales.push("carro");
  if (valorAlias(row.nombre ?? null, row.descripcion ?? null)) senales.push("alias");
  return senales;
}

export function montoLejosDeLaLetra(monto: number, letra: number | null): boolean {
  if (!letra || letra <= 0 || !(monto > 0)) return false;
  if (Math.abs(monto - letra) < 0.02) return false;
  const tarifas = TARIFAS_SALIDA_INTERIOR.map((t) => t.monto);
  if (tarifas.some((t) => Math.abs(monto - (letra + t)) < 0.02 || Math.abs(monto - t) < 0.02)) return false;
  return monto > letra * 4;
}

export function rankearAprendizaje(opts: {
  candidatos: CandidatoSombra[];
  aliases: AliasAprendido[];
  pesos: PesosAprendizaje;
  nombre: string | null;
  descripcion: string | null;
  letra: number | null;
  monto: number;
  refAjena: boolean;
  imagenParecida: boolean;
  sombraTipo: "automatico" | "revision" | "omitido";
  sombraPagoId: string | null;
}): RecomendacionAprendizaje {
  const pesos = { ...PESOS_INICIALES, ...opts.pesos };
  const alias = aliasQueCalza(opts.aliases, opts.nombre, opts.descripcion);
  const anomalias: string[] = [];
  if (opts.refAjena) anomalias.push("Esa referencia ya apareció en otra empresa.");
  if (opts.imagenParecida) anomalias.push("La imagen se parece a otro comprobante.");
  if (montoLejosDeLaLetra(opts.monto, opts.letra)) anomalias.push("El monto queda lejos de la letra.");

  const vivos = opts.candidatos
    .filter((c) => !c.bloqueado)
    .map((c) => repescar(c, pesos, alias, anomalias));

  if (alias && !vivos.some((c) => c.contratoId === alias.contratoId)) {
    anomalias.push(
      `El remitente suele ser el carro ${alias.numero ?? alias.contratoId} (${alias.veces} veces) y no está entre los candidatos.`,
    );
  }

  const ordenados = [...vivos].sort((a, b) => b.puntaje - a.puntaje);
  const primero = ordenados[0];
  const decision = !primero || primero.puntaje < 45
    ? {
        tipo: "omitido" as const,
        puntaje: primero?.puntaje ?? null,
        pagoId: null,
        contratoId: null,
        motivo: anomalias[0] ?? "Sin candidato para el ranking.",
      }
    : decidir(primero, ordenados[1] ?? null, ordenados.length);

  const coincide =
    decision.tipo === opts.sombraTipo &&
    (decision.tipo === "omitido" || decision.pagoId === opts.sombraPagoId);

  return {
    version: APRENDIZAJE_VERSION,
    ...decision,
    coincide,
    anomalias,
  };
}

function repescar(
  c: CandidatoSombra,
  pesos: PesosAprendizaje,
  alias: AliasAprendido | null,
  anomalias: string[],
): CandidatoSombra {
  const senales = c.senales.map((s) => ({
    ...s,
    peso: APRENDIBLES.has(s.codigo) ? (pesos[s.codigo] ?? s.peso) : s.peso,
  }));
  if (alias && c.contratoId === alias.contratoId) {
    senales.push({
      codigo: "alias",
      peso: pesos.alias ?? 0,
      detalle: `Remitente visto ${alias.veces} veces en el carro ${alias.numero ?? ""}.`.trim(),
    });
  } else if (alias && c.contratoId && c.contratoId !== alias.contratoId) {
    const aviso = `El remitente suele ser el carro ${alias.numero ?? "otro"} y este candidato es ${c.numero ?? "otro"}.`;
    if (!anomalias.includes(aviso)) anomalias.push(aviso);
  }
  const puntaje = senales.reduce((s, n) => s + n.peso, 0);
  return { ...c, senales, puntaje };
}

function decidir(
  primero: CandidatoSombra,
  segundo: CandidatoSombra | null,
  cuantos: number,
): Pick<RecomendacionAprendizaje, "tipo" | "puntaje" | "pagoId" | "contratoId" | "motivo"> {
  const fuerte = primero.senales.some((s) => s.codigo === "carro" || s.codigo === "referencia_exacta");
  const holgado = !segundo || primero.puntaje - segundo.puntaje >= 25;
  const alias = primero.senales.find((s) => s.codigo === "alias");
  if (primero.puntaje >= 80 && fuerte && holgado) {
    const ancla = primero.senales.find((s) => s.codigo === "carro" || s.codigo === "referencia_exacta");
    return {
      tipo: "automatico",
      puntaje: primero.puntaje,
      pagoId: primero.pagoId,
      contratoId: primero.contratoId,
      motivo: [ancla?.detalle, alias?.detalle].filter(Boolean).join(" "),
    };
  }
  return {
    tipo: "revision",
    puntaje: primero.puntaje,
    pagoId: primero.pagoId,
    contratoId: primero.contratoId,
    motivo: fuerte
      ? `${cuantos} candidatos y no hay una brecha clara.`
      : alias
        ? `${alias.detalle} Un alias no concilia solo.`
        : "La mejor señal no tiene carro ni referencia exacta.",
  };
}

export function textoAprendizaje(r: RecomendacionAprendizaje): string {
  const acuerdo = r.coincide ? "coincide" : "no coincide";
  const verbo = r.tipo === "automatico" ? "automático" : r.tipo === "revision" ? "revisión" : "omitido";
  const puntaje = r.tipo === "omitido" ? "" : ` ${r.puntaje ?? 0}`;
  const detalle = [r.motivo, ...r.anomalias.filter((a) => a !== r.motivo)].filter(Boolean).join(". ");
  return `Aprendizaje: ${verbo}${puntaje} · ${acuerdo} · ${detalle} No mueve dinero.`;
}
