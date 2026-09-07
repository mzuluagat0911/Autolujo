// Cliente de Diacor (rastreo.diacorserver.com). POST + JSON + Bearer.
// El token dura 24 h: se cachea en el proceso y se renueva al vencer o al 403.

const HOST = (process.env.DIACOR_HOST ?? "rastreo.diacorserver.com").replace(/^https?:\/\//, "");
const BASE = `https://${HOST}/v3/apis/global_api/v3.1.0/public/index.php`;
const UA = "AutoLujo/1.0";

export type PosicionGps = {
  id_dispositivo: string;
  imei: string | null;
  nombre: string | null;
  placa: string | null;
  latitud: number | null;
  longitud: number | null;
  direccion: string | null;
  velocidad: number | null;
  fecha: string | null;
  gps_en_linea: boolean;
  encendido: boolean | null;
  bloqueado: boolean;
  odometro: number | null;
};

type Sesion = { token: string; expMs: number };

let sesion: Sesion | null = null;

export function diacorConfigurado(): boolean {
  return Boolean((process.env.DIACOR_USER ?? "").trim() && (process.env.DIACOR_PASSWORD ?? "").trim());
}

export class DiacorError extends Error {
  codigo?: string;
  http: number;
  constructor(message: string, codigo?: string, http = 0) {
    super(message);
    this.name = "DiacorError";
    this.codigo = codigo;
    this.http = http;
  }
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "N/A" ? null : s;
}

function boolish(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

export function normalizarPosicion(raw: Record<string, unknown>): PosicionGps {
  return {
    id_dispositivo: String(raw.id_dispositivo ?? "").trim(),
    imei: str(raw.imei),
    nombre: str(raw.nombre),
    placa: str(raw.placa),
    latitud: num(raw.latitud),
    longitud: num(raw.longitud),
    direccion: str(raw.direccion),
    velocidad: num(raw.velocidad),
    fecha: str(raw.fecha),
    gps_en_linea: boolish(raw.gps_en_linea),
    encendido: raw.encendido == null ? null : boolish(raw.encendido),
    bloqueado: boolish(raw.bloqueado),
    odometro: num(raw.odometro),
  };
}

function parseError(body: unknown, http: number): DiacorError {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const err = o.error && typeof o.error === "object" ? (o.error as Record<string, unknown>) : o;
  const codigo = str(err.code) ?? str(o.code) ?? undefined;
  const msg = str(err.message) ?? str(o.message) ?? str(o.msg) ?? `Diacor respondió ${http}.`;
  return new DiacorError(msg, codigo, http);
}

async function post<T>(path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": UA,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new DiacorError(`Diacor no devolvió JSON (${res.status}).`, undefined, res.status);
  }
  if (!res.ok) throw parseError(json, res.status);
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  if (o.success === false) throw parseError(json, res.status);
  return json as T;
}

type LoginOk = {
  success: boolean;
  data?: { token?: string; expiration_ts?: number; expiration?: string };
};

export async function loginDiacor(): Promise<Sesion> {
  const user = (process.env.DIACOR_USER ?? "").trim();
  const password = process.env.DIACOR_PASSWORD ?? "";
  if (!user || !password) {
    throw new DiacorError("Faltan DIACOR_USER y DIACOR_PASSWORD en el entorno.", "no_config");
  }
  const out = await post<LoginOk>("login", { user, password });
  const token = out.data?.token;
  if (!token) throw new DiacorError("El login no trajo token.", "no_token");
  const expTs = Number(out.data?.expiration_ts);
  const expMs = Number.isFinite(expTs) && expTs > 1_000_000_000_000
    ? expTs
    : Number.isFinite(expTs) && expTs > 0
      ? expTs * 1000
      : Date.now() + 20 * 60 * 60 * 1000;
  sesion = { token, expMs };
  return sesion;
}

async function token(): Promise<string> {
  if (sesion && sesion.expMs - Date.now() > 10 * 60 * 1000) return sesion.token;
  return (await loginDiacor()).token;
}

async function autenticado<T>(path: string, body: Record<string, unknown>): Promise<T> {
  try {
    return await post<T>(path, body, await token());
  } catch (e) {
    if (e instanceof DiacorError && (e.codigo === "expired_token" || e.codigo === "invalid_token" || e.codigo === "notoken" || e.http === 403)) {
      sesion = null;
      return await post<T>(path, body, (await loginDiacor()).token);
    }
    throw e;
  }
}

type ListaOk = { success?: boolean; data?: unknown };

function filas(json: ListaOk): Record<string, unknown>[] {
  const d = json.data;
  if (Array.isArray(d)) return d.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
  return [];
}

export async function posicionesGps(filtro: {
  id_dispositivo?: number;
  imei?: string;
  placa?: string;
} = {}): Promise<PosicionGps[]> {
  const body: Record<string, unknown> = {};
  if (filtro.id_dispositivo != null) body.id_dispositivo = filtro.id_dispositivo;
  if (filtro.imei) body.imei = filtro.imei;
  if (filtro.placa) body.placa = filtro.placa.replace(/\s+/g, "").slice(0, 10);
  try {
    const json = await autenticado<ListaOk>("posicion_gps", body);
    return filas(json).map(normalizarPosicion).filter((p) => p.id_dispositivo);
  } catch (e) {
    if (e instanceof DiacorError && (e.http === 404 || e.codigo === "device_not_found" || e.codigo === "not_found")) {
      return [];
    }
    throw e;
  }
}

export type RecorridoDia = {
  km: number | null;
  puntos: number;
};

/** Km de un dispositivo en un día (Panamá). 404 / sin info = 0 km. */
export async function recorridoDia(idDispositivo: string, fecha: string): Promise<RecorridoDia> {
  const id = Number(idDispositivo);
  if (!Number.isFinite(id) || id <= 0) return { km: null, puntos: 0 };
  try {
    const json = await autenticado<{
      data?: unknown;
      info_extra_recorrido?: { distancia_recorrida?: { total?: unknown } };
    }>("recorrido", {
      id_dispositivo: id,
      fecha_inicio: fecha,
      fecha_fin: fecha,
      hora_inicial: "00:00:00",
      hora_final: "23:59:59",
      velocidad_inicial: 0,
      velocidad_final: 300,
    });
    const extra = json.info_extra_recorrido?.distancia_recorrida?.total;
    const km = extra == null || extra === "" ? 0 : Number(String(extra).replace(",", "."));
    const puntos = Array.isArray(json.data) ? json.data.length : 0;
    return { km: Number.isFinite(km) ? km : 0, puntos };
  } catch (e) {
    if (e instanceof DiacorError && (e.http === 404 || e.codigo === "noinfo" || e.codigo === "not_found")) {
      return { km: 0, puntos: 0 };
    }
    throw e;
  }
}
