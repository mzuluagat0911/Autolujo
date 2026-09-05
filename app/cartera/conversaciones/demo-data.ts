import type { ConversacionDetalle, ConversacionLista } from "./types";

const hace = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

export const DEMO_CONVERSACIONES: ConversacionLista[] = [
  {
    id: "demo-144",
    wa_numero: "50761234567",
    etiqueta: "Carro 144",
    ultimo_texto: "Gracias!",
    ultimo_mensaje_at: hace(3),
    no_leidos: 0,
    estado: "abierta",
    modo: "agente",
    necesita_humano: false,
    motivo_escalada: null,
    ultimo_entrante_at: hace(3),
    cliente: { nombre: "Carlos Mendoza", cedula: "8-123-4567" },
    vehiculo: { numero: "144", empresa: { codigo: "AUTOLUJO" } },
  },
  {
    id: "demo-201",
    wa_numero: "50769876543",
    etiqueta: "Carro 201",
    ultimo_texto: "Necesito hablar con alguien del equipo, por favor",
    ultimo_mensaje_at: hace(8),
    no_leidos: 2,
    estado: "abierta",
    modo: "humano",
    necesita_humano: true,
    motivo_escalada: "Cliente pide revisar un cobro de multa",
    ultimo_entrante_at: hace(8),
    cliente: { nombre: "María González", cedula: "8-765-4321" },
    vehiculo: { numero: "201", empresa: { codigo: "KOWUA" } },
  },
  {
    id: "demo-g12",
    wa_numero: "50765554433",
    etiqueta: "Carro G12",
    ultimo_texto: "Perfecto, le aviso cuando llegue el comprobante",
    ultimo_mensaje_at: hace(25),
    no_leidos: 0,
    estado: "abierta",
    modo: "humano",
    necesita_humano: false,
    motivo_escalada: null,
    ultimo_entrante_at: hace(30),
    cliente: { nombre: "José Ramírez", cedula: "8-999-1122" },
    vehiculo: { numero: "G12", empresa: { codigo: "GOLD" } },
  },
];

const MENSAJES: Record<string, ConversacionDetalle["mensajes"]> = {
  "demo-144": [
    {
      id: "m1",
      direccion: "in",
      tipo: "text",
      texto: "Buenos días 👋 aquí mando el pago de hoy",
      media_url: null,
      enviado_por: null,
      created_at: hace(18),
    },
    {
      id: "m2",
      direccion: "in",
      tipo: "image",
      texto: "📷 Comprobante",
      media_url: null,
      enviado_por: null,
      created_at: hace(17),
      signedUrl:
        "https://images.unsplash.com/photo-1554224311-7f93b2d704f9?w=400&h=300&fit=crop",
    },
    {
      id: "m3",
      direccion: "out",
      tipo: "text",
      texto:
        "Recibí su comprobante de $35.00. Lo estoy validando contra su saldo del Carro 144.",
      media_url: null,
      enviado_por: null,
      created_at: hace(15),
    },
    {
      id: "m4",
      direccion: "out",
      tipo: "text",
      texto:
        "Listo ✅ Tu pago quedó registrado.\n\nSaldo actual: $1,245.50\nLetra de hoy: $35.00\n\n¡Gracias por tu puntualidad!",
      media_url: null,
      enviado_por: null,
      created_at: hace(12),
    },
    {
      id: "m5",
      direccion: "in",
      tipo: "text",
      texto: "Gracias!",
      media_url: null,
      enviado_por: null,
      created_at: hace(3),
    },
  ],
  "demo-201": [
    {
      id: "m1",
      direccion: "in",
      tipo: "text",
      texto: "Buenas tardes, ¿cuánto debo hoy?",
      media_url: null,
      enviado_por: null,
      created_at: hace(45),
    },
    {
      id: "m2",
      direccion: "out",
      tipo: "text",
      texto:
        "Hola María 👋 Tu saldo del Carro 201 es $892.00 y la letra de hoy es $31.00.",
      media_url: null,
      enviado_por: null,
      created_at: hace(42),
    },
    {
      id: "m3",
      direccion: "in",
      tipo: "text",
      texto: "Pero ayer me cobraron una multa de $5 y no pagué tarde",
      media_url: null,
      enviado_por: null,
      created_at: hace(20),
    },
    {
      id: "m4",
      direccion: "out",
      tipo: "text",
      texto:
        "Entiendo tu consulta sobre la multa. Voy a pasarte con alguien del equipo que puede revisar tu caso con detalle.",
      media_url: null,
      enviado_por: null,
      created_at: hace(18),
    },
    {
      id: "m5",
      direccion: "in",
      tipo: "text",
      texto: "Necesito hablar con alguien del equipo, por favor",
      media_url: null,
      enviado_por: null,
      created_at: hace(8),
    },
  ],
  "demo-g12": [
    {
      id: "m1",
      direccion: "in",
      tipo: "text",
      texto: "Hola, ¿puedo pagar mañana en la mañana?",
      media_url: null,
      enviado_por: null,
      created_at: hace(60),
    },
    {
      id: "m2",
      direccion: "out",
      tipo: "text",
      texto:
        "Hola José. El corte es al mediodía; si pagas mañana antes de las 12:00 queda al día. ¿Te sirve?",
      media_url: null,
      enviado_por: null,
      created_at: hace(55),
    },
    {
      id: "m3",
      direccion: "in",
      tipo: "text",
      texto: "Sí, mañana temprano hago la transferencia",
      media_url: null,
      enviado_por: null,
      created_at: hace(50),
    },
    {
      id: "m4",
      direccion: "out",
      tipo: "text",
      texto: "Perfecto, le aviso cuando llegue el comprobante",
      media_url: null,
      enviado_por: null,
      created_at: hace(25),
    },
  ],
};

const SALDOS: Record<string, number> = {
  "demo-144": 1245.5,
  "demo-201": 892,
  "demo-g12": 2100,
};

export function demoDetalle(id: string): ConversacionDetalle | null {
  const base = DEMO_CONVERSACIONES.find((c) => c.id === id);
  if (!base) return null;
  return {
    ...base,
    contrato_id: "demo-contrato",
    saldo: SALDOS[id] ?? null,
    mensajes: MENSAJES[id] ?? [],
    ventana_abierta: true,
  };
}

export function demoBandeja(): { convs: ConversacionLista[]; error: null } {
  return { convs: DEMO_CONVERSACIONES, error: null };
}

/** Simula una respuesta del agente tras un mensaje del cliente (solo demo). */
export function demoRespuestaAgente(textoCliente: string): string {
  const t = textoCliente.toLowerCase();
  if (t.includes("saldo") || t.includes("debo")) {
    return "El saldo se lo confirmo en un momento.";
  }
  if (t.includes("comprobante") || t.includes("pago") || t.includes("transfer")) {
    return "Cuando lo tenga, mándeme la captura del comprobante.";
  }
  return "Recibí su mensaje. Si es urgente, alguien del equipo toma este chat.";
}
