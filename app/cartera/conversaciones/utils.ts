import type { ConversacionLista } from "./types";

export function tituloConv(c: Pick<ConversacionLista, "vehiculo" | "etiqueta">): string {
  if (c.vehiculo) {
    const emp = c.vehiculo.empresa?.codigo;
    return `${emp ? emp + " · " : ""}Carro ${c.vehiculo.numero}`;
  }
  return c.etiqueta ?? "Sin carro asignado";
}

export function placaConv(c: Pick<ConversacionLista, "vehiculo" | "etiqueta">): string {
  if (c.vehiculo?.numero) return c.vehiculo.numero;
  if (c.etiqueta) {
    const digits = c.etiqueta.replace(/\D/g, "").slice(0, 4);
    return digits || "—";
  }
  return "—";
}

export function tiempoRelativo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ahora = Date.now();
  const diff = ahora - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} h`;
  const dias = Math.floor(hrs / 24);
  if (dias < 7) return `${dias} d`;
  return d.toLocaleDateString("es-PA", { day: "2-digit", month: "short" });
}

export function horaMensaje(iso: string): string {
  return new Date(iso).toLocaleString("es-PA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSaldo(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function telefonoBonito(wa: string): string {
  const digits = wa.replace(/\D/g, "");
  if (digits.startsWith("507") && digits.length === 11) {
    return `+507 ${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return `+${digits}`;
}
