import { nombreDeWhatsApp } from "./lead";

/** Una plantilla por seguimiento 1–7. El 8 archiva y no manda mensaje. */
export const PLANTILLAS_SEGUIMIENTO = [
  {
    name: "comercial_seguimiento_1",
    text: "Hola, {{1}}. Quedé pendiente de su mensaje. ¿Seguimos con el carro?",
  },
  {
    name: "comercial_seguimiento_2",
    text: "Hola, {{1}}. Si le queda bien, le dejo una cita en Juan Díaz o en La Chorrera. ¿Cuál le sirve?",
  },
  {
    name: "comercial_seguimiento_3",
    text: "Hola, {{1}}. Lo dejo por aquí por si todavía quiere ver el carro. Cuando quiera, me escribe.",
  },
  {
    name: "comercial_seguimiento_4",
    text: "Hola, {{1}}. Le escribo de nuevo por si quedó con ganas de ver el carro. ¿Le busco un horario?",
  },
  {
    name: "comercial_seguimiento_5",
    text: "Hola, {{1}}. Sigo por aquí. Si quiere, le dejo la cita esta semana en Juan Díaz o en La Chorrera.",
  },
  {
    name: "comercial_seguimiento_6",
    text: "Hola, {{1}}. Pasó una semana. Si todavía busca carro, le aparto la visita.",
  },
  {
    name: "comercial_seguimiento_7",
    text: "Hola, {{1}}. Este es el último mensaje. Si quiere el carro, respóndame y le dejo la cita. Si no, cierro el chat.",
  },
] as const;

export const CUERPO_SEGUIMIENTO = PLANTILLAS_SEGUIMIENTO[0].text;
export const CUERPO_CONFIRMA_CITA =
  "Hola {{1}}. Le confirmamos su cita de mañana {{2}} a las {{3}} en {{4}}. Responda SI para confirmarla. Si no puede, escriba para reagendar o cancelar.";
export const CUERPO_RECORDATORIO_CITA =
  "Hola {{1}}. Hoy lo esperamos a las {{2}} en {{3}}. Si no puede asistir, responda este mensaje.";

export const PLANTILLA_SEGUIMIENTO = PLANTILLAS_SEGUIMIENTO[0].name;
export const PLANTILLA_CONFIRMA_CITA = "comercial_confirma_cita";
export const PLANTILLA_RECORDATORIO_CITA = "comercial_recordatorio_cita";

function parametro(valor: string, respaldo: string): string {
  const limpio = valor.replace(/[\n\r\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 120);
  return limpio || respaldo;
}

export function componentesPlantilla(valores: string[]): unknown[] {
  return [
    {
      type: "body",
      parameters: valores.map((valor) => ({ type: "text", text: parametro(valor, "—") })),
    },
  ];
}

/** Meta todavía no publicó esa plantilla. El seguimiento se queda pendiente y el cron lo reintenta. */
export function plantillaAunNoLista(error: string): boolean {
  return /132001|132015|132016|does not exist in the translation|template is (paused|disabled)|not approved|pending review/i.test(
    error,
  );
}

export function plantillaSeguimiento(nombre: string | null, intento: number): {
  name: string;
  componentes: unknown[];
  texto: string;
} {
  const indice = Math.min(PLANTILLAS_SEGUIMIENTO.length, Math.max(1, intento)) - 1;
  const modelo = PLANTILLAS_SEGUIMIENTO[indice];
  const persona = parametro(nombreDeWhatsApp(nombre) ?? "", "buenas");
  return {
    name: modelo.name,
    componentes: componentesPlantilla([persona]),
    texto: modelo.text.replace("{{1}}", persona),
  };
}

export function plantillaCita(tipo: "24h" | "dia", cita: {
  nombre: string;
  fechaTexto: string;
  hora: string;
  sede: string;
}): { name: string; componentes: unknown[]; texto: string } {
  const nombre = parametro(cita.nombre, "buenas");
  if (tipo === "dia") {
    const sede = parametro(cita.sede, "la sede");
    const hora = parametro(cita.hora, "la hora acordada");
    return {
      name: process.env.WHATSAPP_COMERCIAL_RECORDATORIO_TEMPLATE?.trim() || PLANTILLA_RECORDATORIO_CITA,
      componentes: componentesPlantilla([nombre, hora, sede]),
      texto: `Hola, ${nombre}. Hoy lo esperamos a las ${hora} en ${sede}. Si no puede asistir, responda este mensaje.`,
    };
  }
  const cuando = parametro(cita.fechaTexto, "mañana");
  const hora = parametro(cita.hora, "la hora acordada");
  const sede = parametro(cita.sede, "la sede");
  return {
    name: process.env.WHATSAPP_COMERCIAL_CONFIRMA_TEMPLATE?.trim() || PLANTILLA_CONFIRMA_CITA,
    componentes: componentesPlantilla([nombre, cuando, hora, sede]),
    texto: `Hola, ${nombre}. Le confirmamos su cita de mañana ${cuando} a las ${hora} en ${sede}. Responda SI para confirmarla. Si no puede, escriba para reagendar o cancelar.`,
  };
}
