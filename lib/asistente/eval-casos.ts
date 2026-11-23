// Banco de preguntas del asistente. Sirve para medir router y, en vivo, tools/tono.
// No llama al modelo: el script scripts/asistente-eval.mts corre la parte estática.

import type { FichaId } from "./router";

export type CasoEval = {
  id: string;
  pregunta: string;
  /** Pantalla donde está el usuario (opcional). */
  ruta?: string;
  /** Fichas que deben quedar activas (todas deben aparecer). */
  fichas: FichaId[];
  /** Tool preferida para la cifra o el dato. */
  tool?: string;
  /** Qué debe oler la respuesta buena (para revisión humana / eval en vivo). */
  espera: string;
};

export const CASOS_EVAL: CasoEval[] = [
  // Cobro
  {
    id: "cobro-01",
    pregunta: "¿Cuánto debe hoy el 92?",
    ruta: "/cartera",
    fichas: ["cobro"],
    tool: "cobro_hoy",
    espera: "Monto único de cobro_hoy, sin partir cuota+atraso",
  },
  {
    id: "cobro-02",
    pregunta: "¿El domingo se cobra la cuota del acuerdo?",
    fichas: ["cobro"],
    espera: "No la cuota diaria del acuerdo; sí tajada/atrasos/acuerdo de domingo",
  },
  {
    id: "cobro-03",
    pregunta: "¿Cómo queda el mensaje del AL 52?",
    fichas: ["cobro"],
    tool: "cobro_hoy",
    espera: "Desglose del mensaje vía cobro_hoy",
  },
  {
    id: "cobro-04",
    pregunta: "¿Cuál es el saldo de libro de Autolujo?",
    fichas: ["cobro"],
    tool: "saldo_cartera",
    espera: "Saldo de libro, no a pagar hoy",
  },
  {
    id: "cobro-05",
    pregunta: "¿Dónde veo el estado de cuenta?",
    ruta: "/admin",
    fichas: ["cobro"],
    espera: "Enlace a /cartera/estados-cuenta",
  },
  {
    id: "cobro-06",
    pregunta: "¿Qué es el cierre de semana?",
    fichas: ["cobro"],
    espera: "Martes $10 solo si hay letra/acuerdo/abono vencidos",
  },
  {
    id: "cobro-07",
    pregunta: "Panapass del KW 111",
    fichas: ["cobro"],
    tool: "panapass",
    espera: "Número del tag; sí se dice",
  },
  {
    id: "cobro-08",
    pregunta: "¿Hoy es cumpleaños de alguien?",
    fichas: ["cobro"],
    tool: "cumpleanos",
    espera: "Lista o vacío vía cumpleanos",
  },
  {
    id: "cobro-09",
    pregunta: "Domingo al día, ¿cuánto cobra?",
    fichas: ["cobro"],
    espera: "$0 si está al día",
  },
  {
    id: "cobro-10",
    pregunta: "¿El saldo del contrato es lo que debe hoy?",
    fichas: ["cobro"],
    espera: "No: libro ≠ mensaje; usar cobro_hoy",
  },

  // Operaciones
  {
    id: "ops-01",
    pregunta: "¿Quién está próximo a mantenimiento?",
    ruta: "/operaciones/mantenimiento",
    fichas: ["operaciones"],
    tool: "alertas_operaciones",
    espera: "Cola mantenimiento 6.000 km",
  },
  {
    id: "ops-02",
    pregunta: "¿Cuándo es el kit de tiempos?",
    fichas: ["operaciones"],
    tool: "alertas_operaciones",
    espera: "100.000 primera vez, luego cada 60.000",
  },
  {
    id: "ops-03",
    pregunta: "¿La revisión mensual es lo mismo que el mantenimiento?",
    fichas: ["operaciones"],
    espera: "No: mensual ≠ básico 6.000",
  },
  {
    id: "ops-04",
    pregunta: "¿Se manda WhatsApp de mantenimiento al cliente?",
    fichas: ["operaciones"],
    espera: "No: número no guardado",
  },
  {
    id: "ops-05",
    pregunta: "¿Cuándo sale el informe de la semana?",
    fichas: ["operaciones"],
    espera: "Viernes 1:00 p.m.; Néstor cita, Amalia confirma",
  },
  {
    id: "ops-06",
    pregunta: "Licencias por vencer",
    ruta: "/operaciones/licencias",
    fichas: ["operaciones"],
    tool: "alertas_operaciones",
    espera: "Lista vía alertas_operaciones licencias",
  },
  {
    id: "ops-07",
    pregunta: "Placas y revisado del 45",
    fichas: ["operaciones"],
    tool: "alertas_operaciones",
    espera: "Estado revisado/placas del carro",
  },
  {
    id: "ops-08",
    pregunta: "Aceite ATF a cuántos km",
    fichas: ["operaciones"],
    espera: "50.000 km, aparte del kit",
  },
  {
    id: "ops-09",
    pregunta: "¿Qué es kmDesdeUltimo?",
    fichas: ["operaciones"],
    espera: "Km desde el último mantenimiento, no atraso",
  },
  {
    id: "ops-10",
    pregunta: "¿Dónde está la hoja de vida?",
    fichas: ["operaciones"],
    espera: "Enlace /operaciones/hoja-vida",
  },

  // Comercial
  {
    id: "com-01",
    pregunta: "¿Cuántos seguimientos vencidos hay?",
    ruta: "/comercial/resultados",
    fichas: ["comercial"],
    tool: "resumen_comercial",
    espera: "KPI vencidos de resumen_comercial",
  },
  {
    id: "com-02",
    pregunta: "¿Qué es un seguimiento vencido?",
    fichas: ["comercial"],
    espera: "Chat abierto con seguimiento_at pasado; no es seguimientos_comercial",
  },
  {
    id: "com-03",
    pregunta: "¿Cuántos leads calientes hay?",
    fichas: ["comercial"],
    tool: "resumen_comercial",
    espera: "calientes de resumen_comercial",
  },
  {
    id: "com-04",
    pregunta: "¿Cuántos seguimientos manda Lucía por hora?",
    fichas: ["comercial"],
    espera: "Hasta 120 por hora",
  },
  {
    id: "com-05",
    pregunta: "Embudo de comercial: leads, citas, ganados",
    fichas: ["comercial"],
    tool: "resumen_comercial",
    espera: "Números del embudo",
  },
  {
    id: "com-06",
    pregunta: "Estados de un seguimiento de Lucía",
    fichas: ["comercial"],
    espera: "pendiente, enviando, enviado, cancelado, fallido",
  },
  {
    id: "com-07",
    pregunta: "¿Dónde veo las citas?",
    fichas: ["comercial"],
    espera: "Enlace /comercial/citas",
  },
  {
    id: "com-08",
    pregunta: "Temperatura de un lead",
    fichas: ["comercial"],
    espera: "caliente, tibio, frio",
  },
  {
    id: "com-09",
    pregunta: "¿Cuántos ganados hay?",
    ruta: "/comercial",
    fichas: ["comercial"],
    tool: "resumen_comercial",
    espera: "ganados vía resumen_comercial",
  },
  {
    id: "com-10",
    pregunta: "Un seguimiento quedó fallido, ¿por qué no es enviado?",
    fichas: ["comercial"],
    espera: "Decir estado fallido; no explicar 'porque no es enviado'",
  },

  // Seguros
  {
    id: "seg-01",
    pregunta: "¿Quién cobró finiquito este mes?",
    ruta: "/seguros",
    fichas: ["seguros"],
    tool: "pagos_choque",
    espera: "Lista pagos_choque del mes",
  },
  {
    id: "seg-02",
    pregunta: "¿Cuántos choques abiertos hay?",
    fichas: ["seguros"],
    tool: "resumen_seguros",
    espera: "abiertos de resumen_seguros",
  },
  {
    id: "seg-03",
    pregunta: "¿Cómo va un choque con FUD?",
    fichas: ["seguros"],
    espera: "Salta audiencia; va a facturas",
  },
  {
    id: "seg-04",
    pregunta: "Si el carro queda en taller, ¿se cobra letra?",
    fichas: ["seguros"],
    espera: "Se pausa; si circulando, no",
  },
  {
    id: "seg-05",
    pregunta: "Pagos de choque del AL 10",
    fichas: ["seguros"],
    tool: "pagos_choque",
    espera: "pagos_choque con carro",
  },
  {
    id: "seg-06",
    pregunta: "¿Cuándo avisa la póliza?",
    fichas: ["seguros"],
    espera: "30 días antes de vencer",
  },
  {
    id: "seg-07",
    pregunta: "¿Dónde imprimo el registro vehicular?",
    fichas: ["seguros"],
    espera: "Enlace /seguros/registros",
  },
  {
    id: "seg-08",
    pregunta: "Casos en audiencia",
    ruta: "/seguros",
    fichas: ["seguros"],
    tool: "resumen_seguros",
    espera: "audiencia de resumen_seguros",
  },
  {
    id: "seg-09",
    pregunta: "Trámite con parte policivo",
    fichas: ["seguros"],
    espera: "Pasa por audiencia y resolución",
  },
  {
    id: "seg-10",
    pregunta: "¿Qué hay aquí?",
    ruta: "/seguros/registros",
    fichas: ["seguros"],
    espera: "Registros vehiculares: ver/imprimir y pagos por carro",
  },
];
