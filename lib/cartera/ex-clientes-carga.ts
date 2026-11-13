import { normalizarTelefono } from "./telefono";

function telefonosDeAlta(whatsapp: string | null, telefono: string | null): {
  whatsapp: string;
  telefono: string;
} | null {
  const waNorm = normalizarTelefono(whatsapp) ?? normalizarTelefono(telefono);
  if (!waNorm) return null;
  const local = waNorm.startsWith("507") && waNorm.length === 11 ? waNorm.slice(3) : waNorm;
  return { whatsapp: `+${waNorm}`, telefono: local };
}

export type FilaExcelEx = {
  carro: string;
  nombre: string;
  cedula: string;
  celular: string;
  deuda: number;
  motivo: string;
};

export type FilaCargaEx = FilaExcelEx & {
  empresaCodigo: "AUTOLUJO" | "KOWUA" | "GOLD";
  telefono: string | null;
  whatsapp: string | null;
};

const PLANO = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function textoCelda(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; hyperlink?: unknown };
    if (o.text != null) return textoCelda(o.text);
    if (o.result != null) return textoCelda(o.result);
  }
  return String(v).replace(/\s+/g, " ").trim();
}

export function montoCelda(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  const s = textoCelda(v).replace(/[$\s,]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** AL15 → Autolujo, KW114 → Kowua, G33 → Gold. */
export function empresaDeCarro(carro: string): "AUTOLUJO" | "KOWUA" | "GOLD" | null {
  const u = carro.trim().toUpperCase().replace(/\s+/g, "");
  if (u.startsWith("AL")) return "AUTOLUJO";
  if (u.startsWith("KW")) return "KOWUA";
  if (/^G\d/.test(u) || u.startsWith("GD") || u.startsWith("GOLD")) return "GOLD";
  return null;
}

function clavePersona(f: FilaExcelEx): string {
  const ced = f.cedula.replace(/\s+/g, "");
  if (ced) return `ced:${ced}`;
  return `nom:${PLANO(f.nombre)}|${f.carro.trim().toUpperCase()}`;
}

function carroPreferido(a: string, b: string): string {
  const aOk = Boolean(empresaDeCarro(a));
  const bOk = Boolean(empresaDeCarro(b));
  if (bOk && !aOk) return b;
  if (aOk && !bOk) return a;
  return a || b;
}

function mejorTexto(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

/** Misma cédula (o mismo nombre+carro) queda una sola fila. No se suman saldos iguales. */
export function fusionarFilasExcel(filas: FilaExcelEx[]): FilaExcelEx[] {
  const map = new Map<string, FilaExcelEx>();
  for (const cruda of filas) {
    const f: FilaExcelEx = {
      carro: cruda.carro.trim(),
      nombre: cruda.nombre.replace(/\s+/g, " ").trim(),
      cedula: cruda.cedula.replace(/\s+/g, " ").trim(),
      celular: cruda.celular.trim(),
      deuda: cruda.deuda,
      motivo: cruda.motivo.replace(/\s+/g, " ").trim(),
    };
    if (!f.nombre || f.deuda < 0) continue;
    const k = clavePersona(f);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, f);
      continue;
    }
    map.set(k, {
      carro: carroPreferido(prev.carro, f.carro),
      nombre: mejorTexto(prev.nombre, f.nombre),
      cedula: prev.cedula || f.cedula,
      celular: telefonosDeAlta(f.celular, f.celular) ? f.celular : prev.celular || f.celular,
      deuda: Math.max(prev.deuda, f.deuda),
      motivo: mejorTexto(prev.motivo, f.motivo),
    });
  }
  return [...map.values()];
}

export function filaCarga(f: FilaExcelEx, empresaCodigo: "AUTOLUJO" | "KOWUA" | "GOLD"): FilaCargaEx {
  const tels = telefonosDeAlta(f.celular, f.celular);
  return {
    ...f,
    empresaCodigo,
    telefono: tels?.telefono ?? (f.celular || null),
    whatsapp: tels?.whatsapp ?? null,
  };
}

export function prepararCarga(filas: FilaExcelEx[]): {
  listas: FilaCargaEx[];
  sinEmpresa: FilaExcelEx[];
} {
  const listas: FilaCargaEx[] = [];
  const sinEmpresa: FilaExcelEx[] = [];
  for (const f of fusionarFilasExcel(filas)) {
    const empresaCodigo = empresaDeCarro(f.carro);
    if (!empresaCodigo) {
      sinEmpresa.push(f);
      continue;
    }
    const tels = telefonosDeAlta(f.celular, f.celular);
    listas.push({
      ...f,
      empresaCodigo,
      telefono: tels?.telefono ?? (f.celular || null),
      whatsapp: tels?.whatsapp ?? null,
    });
  }
  return { listas, sinEmpresa };
}

export function resumenCarga(filas: FilaCargaEx[]): {
  personas: number;
  saldo: number;
  porEmpresa: Record<string, { n: number; saldo: number }>;
  sinWhatsapp: number;
} {
  const porEmpresa: Record<string, { n: number; saldo: number }> = {};
  let saldo = 0;
  let sinWhatsapp = 0;
  for (const f of filas) {
    saldo += f.deuda;
    const e = porEmpresa[f.empresaCodigo] ?? { n: 0, saldo: 0 };
    e.n += 1;
    e.saldo += f.deuda;
    porEmpresa[f.empresaCodigo] = e;
    if (!f.whatsapp) sinWhatsapp += 1;
  }
  return { personas: filas.length, saldo: Math.round(saldo * 100) / 100, porEmpresa, sinWhatsapp };
}
