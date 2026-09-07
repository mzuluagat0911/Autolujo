import type { PosicionGps } from "./diacor";

export type VehiculoGps = {
  id: string;
  numero: string;
  placa: string | null;
  gps_id: string | null;
  empresa: string | null;
  estado?: string | null;
};

const EN_TALLER = new Set(["mantenimiento", "chapisteria", "improductivo", "por_entregar"]);

export function vehiculoEnTaller(v: VehiculoGps | null | undefined): boolean {
  return Boolean(v?.estado && EN_TALLER.has(v.estado));
}

export type FilaRastreo = PosicionGps & {
  vehiculoId: string | null;
  carro: string | null;
};

export function normalizarPlaca(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "#AL66", "KW202", "#G02" → empresa + número de carro. */
export function parseEtiquetaDiacor(nombre: string | null | undefined): {
  codigoEmpresa: "AUTOLUJO" | "KOWUA" | "GOLD";
  numero: string;
} | null {
  const t = (nombre ?? "").toUpperCase().replace(/\s+/g, "");
  const m = t.match(/#?(AL|KW|G)(\d{1,3})\b/);
  if (!m) return null;
  const pref = m[1]!;
  const bruto = m[2]!;
  if (pref === "AL") return { codigoEmpresa: "AUTOLUJO", numero: String(Number(bruto)) };
  if (pref === "KW") return { codigoEmpresa: "KOWUA", numero: String(Number(bruto)) };
  return { codigoEmpresa: "GOLD", numero: bruto.padStart(2, "0") };
}

function mismoNumero(a: string, b: string): boolean {
  const na = a.replace(/^G/i, "").replace(/^0+/, "") || "0";
  const nb = b.replace(/^G/i, "").replace(/^0+/, "") || "0";
  return na === nb;
}

/** Cruza un punto Diacor con un carro: gps_id, luego placa, luego #AL66 del nombre. */
export function casarPosicion(p: PosicionGps, vehiculos: VehiculoGps[]): VehiculoGps | null {
  const porId = vehiculos.find((v) => v.gps_id && v.gps_id === p.id_dispositivo);
  if (porId) return porId;
  const placa = normalizarPlaca(p.placa);
  if (placa) {
    const hits = vehiculos.filter((v) => v.placa && normalizarPlaca(v.placa) === placa);
    if (hits.length === 1) return hits[0]!;
  }
  const etq = parseEtiquetaDiacor(p.nombre);
  if (!etq) return null;
  const hits = vehiculos.filter(
    (v) => (v.empresa ?? "").toUpperCase() === etq.codigoEmpresa && mismoNumero(v.numero, etq.numero),
  );
  return hits.length === 1 ? hits[0]! : null;
}

export function armarFilas(posiciones: PosicionGps[], vehiculos: VehiculoGps[]): FilaRastreo[] {
  return posiciones.map((p) => {
    const v = casarPosicion(p, vehiculos);
    return {
      ...p,
      vehiculoId: v?.id ?? null,
      carro: v ? (v.empresa ? `${v.empresa} · ${v.numero}` : v.numero) : null,
    };
  });
}

/** Sugerencias para guardar gps_id: placa calza y el carro aún no tiene id. */
export function sugerenciasVinculo(
  posiciones: PosicionGps[],
  vehiculos: VehiculoGps[],
): { vehiculoId: string; gps_id: string; placa: string }[] {
  const out: { vehiculoId: string; gps_id: string; placa: string }[] = [];
  const usados = new Set(vehiculos.map((v) => v.gps_id).filter(Boolean) as string[]);
  for (const p of posiciones) {
    if (!p.id_dispositivo || usados.has(p.id_dispositivo)) continue;
    const placa = normalizarPlaca(p.placa);
    if (!placa) continue;
    const hits = vehiculos.filter((v) => !v.gps_id && v.placa && normalizarPlaca(v.placa) === placa);
    if (hits.length !== 1) continue;
    const v = hits[0]!;
    out.push({ vehiculoId: v.id, gps_id: p.id_dispositivo, placa });
    usados.add(p.id_dispositivo);
  }
  return out;
}
