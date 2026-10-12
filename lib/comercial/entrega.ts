export type EntregaComercial = "enviado" | "entregado" | "leido" | "fallido";

const RANGO: Record<EntregaComercial, number> = {
  fallido: 0,
  enviado: 1,
  entregado: 2,
  leido: 3,
};

/** Meta manda sent, delivered, read o failed. No se baja un leído a entregado. */
export function entregaNueva(actual: string | null | undefined, estadoMeta: string): EntregaComercial | null {
  const mapa: Record<string, EntregaComercial> = {
    sent: "enviado",
    delivered: "entregado",
    read: "leido",
    failed: "fallido",
  };
  const siguiente = mapa[estadoMeta];
  if (!siguiente) return null;
  if (siguiente === "fallido") return actual === "fallido" ? null : "fallido";
  const previo = actual && actual in RANGO ? RANGO[actual as EntregaComercial] : 0;
  if (previo === 0 && actual === "fallido") return null;
  if (RANGO[siguiente] <= previo) return null;
  return siguiente;
}

export function idMensajeEnviado(json: unknown): string | null {
  const id = (json as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
  return id?.trim() || null;
}
