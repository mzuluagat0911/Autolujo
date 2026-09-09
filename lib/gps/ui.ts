import type { FilaRastreo } from "./vincular";

export type FlotaFiltro = "todas" | "AL" | "KW" | "GD";
export type EstadoFiltro = "todos" | "movimiento" | "detenido" | "sin_senal";

export function etiquetaHash(f: Pick<FilaRastreo, "carro" | "nombre" | "placa" | "id_dispositivo">): string {
  if (f.carro) {
    const m = f.carro.match(/^([A-Za-z]+)\s*·\s*(.+)$/);
    if (m) return `#${m[1]!.toUpperCase()}${m[2]!.replace(/\s/g, "")}`;
    return `#${f.carro.replace(/[\s·]/g, "")}`;
  }
  const nom = (f.nombre ?? "").trim();
  if (nom.startsWith("#")) return nom.split(/\s+/)[0]!;
  return f.placa ? `#${f.placa}` : f.id_dispositivo.slice(0, 8);
}

export function prefijoFlota(f: Pick<FilaRastreo, "carro" | "nombre" | "placa" | "id_dispositivo">): FlotaFiltro | null {
  const carro = (f.carro ?? "").toUpperCase();
  if (carro.startsWith("AL")) return "AL";
  if (carro.startsWith("KW")) return "KW";
  if (carro.startsWith("GD") || carro.startsWith("G ·") || carro.startsWith("G ")) return "GD";
  const h = etiquetaHash(f).toUpperCase();
  if (h.startsWith("#AL")) return "AL";
  if (h.startsWith("#KW")) return "KW";
  if (h.startsWith("#GD") || /^#G\d/.test(h)) return "GD";
  return null;
}

export function enMovimiento(f: Pick<FilaRastreo, "velocidad">): boolean {
  return (f.velocidad ?? 0) >= 1;
}

export function estadoGps(f: Pick<FilaRastreo, "gps_en_linea" | "velocidad">): "movimiento" | "detenido" | "sin_senal" {
  if (!f.gps_en_linea) return "sin_senal";
  return enMovimiento(f) ? "movimiento" : "detenido";
}

export function estadoLabel(estado: ReturnType<typeof estadoGps>): string {
  if (estado === "movimiento") return "En movimiento";
  if (estado === "detenido") return "Detenido";
  return "Sin señal";
}

export function tonoEstado(estado: ReturnType<typeof estadoGps>): "good" | "crit" | "neutral" {
  if (estado === "movimiento") return "good";
  if (estado === "detenido") return "crit";
  return "neutral";
}

export function colorEstado(estado: ReturnType<typeof estadoGps>): string {
  if (estado === "movimiento") return "#059669";
  if (estado === "detenido") return "#dc2626";
  return "#6B7280";
}

export function statsFlota(filas: FilaRastreo[]) {
  let mov = 0;
  let det = 0;
  let sin = 0;
  let conCoords = 0;
  for (const f of filas) {
    if (f.latitud != null && f.longitud != null && Number.isFinite(f.latitud) && Number.isFinite(f.longitud)) {
      conCoords += 1;
    }
    const e = estadoGps(f);
    if (e === "sin_senal") sin += 1;
    else if (e === "movimiento") mov += 1;
    else det += 1;
  }
  return { mov, det, sin, conCoords, total: filas.length };
}

/** Fecha Diacor → texto corto Panamá. */
export function formatFechaGps(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const raw = fecha.trim();
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString("es-PA", {
      timeZone: "America/Panama",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return raw.length > 16 ? raw.slice(0, 16) : raw;
}

export function formatHoraCarga(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-PA", {
    timeZone: "America/Panama",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
