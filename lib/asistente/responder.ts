// El asistente del equipo. Lee la base con herramientas y responde con el modelo.
// Fase 1: cómo funciona. Fase 2: consultas de lectura. No ejecuta cambios.

import { generateText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { modeloAsistente } from "@/lib/ai/provider";
import { hoyPanama } from "@/lib/cartera/fecha";
import type { ModuloId } from "@/lib/equipo/modulos";
import { createServerSupabase } from "@/lib/supabase/server";
import { textoCatalogo } from "./catalogo";
import { columnasDe, consultarTabla, resumirTabla, type Filtro } from "./consultar";
import { alertasOperaciones } from "./operaciones";
import { cobroDeCarro, saldoCartera } from "./cobro";
import { manualDe } from "./manual";
import { cifrasSinFuente } from "./verificar";

export type TurnoAsistente = { rol: "user" | "assistant"; texto: string };

export type ConsultaHecha = { herramienta: string; entrada: unknown; salida: unknown };

export type RespuestaAsistente = {
  texto: string;
  consultas: ConsultaHecha[];
  /** Cifras que siguieron sin fuente después de la segunda vuelta. */
  sinValidar: number[];
  reintento: boolean;
};

const FiltroZ = z.object({
  columna: z.string(),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "ilike", "in", "is"]),
  valor: z.string(),
});

function filtrosDe(lista: z.infer<typeof FiltroZ>[] | undefined): Filtro[] | undefined {
  return lista?.map((f) => ({ columna: f.columna, op: f.op, valor: f.valor }));
}

function herramientas(modulos: readonly ModuloId[]) {
  const puedeCobrar = modulos.includes("cartera") || modulos.includes("resumen");
  const puedeOperar = modulos.includes("operaciones");
  return {
    columnas: tool({
      description: "Columnas reales de una tabla permitida. Úsala antes de filtrar si no estás seguro del nombre.",
      inputSchema: z.object({ tabla: z.string() }),
      execute: async (input) => columnasDe(modulos, input.tabla),
    }),
    ...(puedeOperar
      ? {
          alertas_operaciones: tool({
            description:
              "Lo que muestra Operaciones: mantenimiento (6.000 km), kit (kit de tiempos), licencias o revisado. Por defecto solo lo pendiente. Para un carro puntual (km desde su último mantenimiento, cuánto le falta para el kit), pasa carro (ej. 92, KW130, G07).",
            inputSchema: z.object({
              tipo: z.enum(["mantenimiento", "kit", "licencias", "revisado"]),
              todos: z.boolean().optional(),
              carro: z.string().optional(),
            }),
            execute: async (input) => alertasOperaciones(input.tipo, !input.todos, input.carro),
          }),
        }
      : {}),
    consultar: tool({
      description:
        "Lee filas de una tabla permitida. Filtros: eq, neq, gt, gte, lt, lte, ilike, in (valores separados por coma), is (null). Máximo 40 filas. Para un total o un conteo usa resumir.",
      inputSchema: z.object({
        tabla: z.string(),
        columnas: z.string().optional(),
        filtros: z.array(FiltroZ).optional(),
        orden: z.object({ columna: z.string(), asc: z.boolean().optional() }).optional(),
        limite: z.number().int().min(1).max(40).optional(),
      }),
      execute: async (input) =>
        consultarTabla(modulos, {
          tabla: input.tabla,
          columnas: input.columnas,
          filtros: filtrosDe(input.filtros),
          orden: input.orden,
          limite: input.limite,
        }),
    }),
    resumir: tool({
      description:
        "Cuenta filas (sin columna) o suma una columna numérica (con columna), con los mismos filtros. Úsalo para totales y conteos.",
      inputSchema: z.object({
        tabla: z.string(),
        columna: z.string().optional(),
        filtros: z.array(FiltroZ).optional(),
      }),
      execute: async (input) =>
        resumirTabla(modulos, {
          tabla: input.tabla,
          columna: input.columna,
          filtros: filtrosDe(input.filtros),
        }),
    }),
    ...(puedeCobrar
      ? {
          cobro_hoy: tool({
            description:
              "Total a pagar hoy de un carro, con el desglose del mensaje. Acepta 92, AL10, KW130 o G07. Es la única cifra de cobro que puedes decir.",
            inputSchema: z.object({
              carro: z.string(),
            }),
            execute: async (input) => cobroDeCarro(input.carro),
          }),
          saldo_cartera: tool({
            description:
              "Saldo de libro sumado de la cartera. estado: activo (por defecto), suspendido, finalizado, traspasado, devuelto o todos. empresa opcional: AUTOLUJO, KOWUA o GOLD.",
            inputSchema: z.object({
              estado: z.string().optional(),
              empresa: z.string().optional(),
            }),
            execute: async (input) => saldoCartera(input),
          }),
        }
      : {}),
  };
}

async function empresas(): Promise<{ codigo: string; id: string }[]> {
  const sb = createServerSupabase();
  const { data } = await sb.from("empresas").select("id, codigo").order("codigo");
  return (data ?? []).map((e) => ({ codigo: String(e.codigo), id: String(e.id) }));
}

export async function responderAsistente(opts: {
  modulos: readonly ModuloId[];
  historial: TurnoAsistente[];
}): Promise<RespuestaAsistente> {
  const modulos = opts.modulos;
  const tools = herramientas(modulos);
  const system = `${manualDe(modulos, { hoy: hoyPanama(), empresas: await empresas() })}\n${textoCatalogo(modulos)}`;
  const messages: ModelMessage[] = opts.historial.slice(-12).map((m) => ({
    role: m.rol,
    content: m.texto.slice(0, 4000),
  }));

  const consultas: ConsultaHecha[] = [];
  const correr = async (msgs: ModelMessage[]) => {
    const result = await generateText({
      model: modeloAsistente(),
      system,
      messages: msgs,
      tools,
      stopWhen: ({ steps }) => steps.length >= 6,
      temperature: 0.1,
      maxOutputTokens: 900,
    });
    for (const step of result.steps) {
      for (const r of step.toolResults) {
        if (!r) continue;
        consultas.push({ herramienta: r.toolName, entrada: r.input, salida: r.output });
      }
    }
    return result.text.trim();
  };

  const fuentes = () => ({
    sistema: system,
    usuario: opts.historial.filter((m) => m.rol === "user").map((m) => m.texto),
    datos: consultas.map((c) => JSON.stringify(c.salida)),
  });

  const PROMESA = /\b(voy a|déjame|dejame|permíteme|permiteme|intentaré|consultaré|buscaré|revisaré)\b/i;

  let texto = await correr(messages);
  let sueltas = cifrasSinFuente(texto, fuentes());
  let reintento = false;
  const avisos: string[] = [];
  if (sueltas.length > 0) {
    avisos.push(
      `estas cifras no salen de ninguna consulta de esta respuesta: ${sueltas.join(", ")}. Vuelve a consultar y responde solo con datos que devuelva una herramienta. Si no puedes validar una cifra, quítala y di qué no pudiste confirmar.`,
    );
  }
  if (PROMESA.test(texto)) {
    avisos.push("dijiste que ibas a hacer algo y no lo hiciste. Hazlo ahora con las herramientas y entrega la respuesta final. Si no se puede, di qué falló.");
  }
  if (avisos.length > 0) {
    reintento = true;
    texto = await correr([
      ...messages,
      { role: "assistant", content: texto },
      { role: "user", content: `Revisión interna, no la menciones: ${avisos.join(" También: ")}` },
    ]);
    sueltas = cifrasSinFuente(texto, fuentes());
  }

  if (!texto) texto = "No encontré una respuesta con los datos que puedo ver.";
  if (PROMESA.test(texto)) {
    texto = "No pude completar la consulta. Intenta preguntarlo de otra forma o revisa la pantalla directamente.";
  }
  if (/\b(gemini|openai|anthropic|claude|gpt-?\d|entrenad[oa] por|modelo de lenguaje)\b/i.test(texto)) {
    texto = "Soy el asistente de la plataforma AutoLujo.";
  }
  if (sueltas.length > 0) {
    texto = `${texto}\n\nOjo: no pude confirmar ${sueltas.join(", ")} con la base. Tómalo como no validado.`;
  }
  return { texto, consultas, sinValidar: sueltas, reintento };
}
