export const CUERPO_SEGUIMIENTO =
  "Hola {{1}}. Le escribimos de AutoLujo para continuar {{2}}. Si desea seguir, responda este mensaje. Si no desea más mensajes, responda NO.";
export const CUERPO_CONFIRMA_CITA =
  "Hola {{1}}. Le confirmamos su cita de mañana {{2}} a las {{3}} en {{4}}. Responda SI para confirmarla. Si no puede, escriba para reagendar o cancelar.";
export const CUERPO_RECORDATORIO_CITA =
  "Hola {{1}}. Hoy lo esperamos a las {{2}} en {{3}}. Si no puede asistir, responda este mensaje.";

export const PLANTILLA_SEGUIMIENTO = "comercial_seguimiento";
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

export function plantillaSeguimiento(nombre: string | null, interes: string | null): {
  name: string;
  componentes: unknown[];
  texto: string;
} {
  const persona = parametro(nombre ?? "", "buenas");
  const tema = interes?.trim() ? `sobre ${parametro(interes, "su consulta")}` : "su consulta";
  return {
    name: process.env.WHATSAPP_COMERCIAL_SEGUIMIENTO_TEMPLATE?.trim() || PLANTILLA_SEGUIMIENTO,
    componentes: componentesPlantilla([persona, tema]),
    texto: `Hola, ${persona}. Le escribimos de AutoLujo para continuar ${tema}. Si desea seguir, responda este mensaje. Si no desea más mensajes, responda NO.`,
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
