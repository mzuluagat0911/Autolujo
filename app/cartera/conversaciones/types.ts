/** Tipos compartidos de la bandeja de conversaciones. */

export type ConversacionLista = {
  id: string;
  wa_numero: string;
  etiqueta: string | null;
  ultimo_texto: string | null;
  ultimo_mensaje_at: string | null;
  no_leidos: number;
  estado: string;
  modo: "agente" | "humano";
  necesita_humano: boolean;
  motivo_escalada: string | null;
  ultimo_entrante_at: string | null;
  cliente: { nombre: string; cedula: string | null } | null;
  vehiculo: { numero: string; empresa: { codigo: string } | null } | null;
};

export type Mensaje = {
  id: string;
  direccion: "in" | "out";
  tipo: string;
  texto: string | null;
  media_url: string | null;
  enviado_por: string | null;
  created_at: string;
  signedUrl?: string | null;
};

export type ConversacionDetalle = ConversacionLista & {
  contrato_id: string | null;
  saldo: number | null;
  mensajes: Mensaje[];
  ventana_abierta: boolean;
};

export type FiltroBandeja = "todas" | "responder" | "humano" | "agente";
