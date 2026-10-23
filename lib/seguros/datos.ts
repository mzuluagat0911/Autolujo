import { createServerSupabase } from "@/lib/supabase/server";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import { hoyPanama, sumarDias } from "@/lib/cartera/fecha";
import {
  ORIGEN_SEGUROS,
  TITULO_CASO,
  TITULO_POLIZA,
  parseCaso,
  type AseguradoraId,
  type Caso,
  type CasoFila,
  type Poliza,
} from "./modelo";

const BUCKET = "comprobantes";

type VehiculoMini = {
  id: string;
  numero: string;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  estado: string;
  empresa: { codigo: string } | { codigo: string }[] | null;
};

function empresaDe(v: VehiculoMini["empresa"]): string {
  if (!v) return "";
  return Array.isArray(v) ? v[0]?.codigo ?? "" : v.codigo;
}

async function eventosSeguros(titulo: string) {
  const sb = createServerSupabase();
  const rows: {
    id: string;
    vehiculo_id: string;
    fecha: string;
    km: number | null;
    detalle: string | null;
    lugar: string | null;
    valor: number | null;
  }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb
      .from("vehiculo_eventos")
      .select("id, vehiculo_id, fecha, km, detalle, lugar, valor")
      .eq("origen", ORIGEN_SEGUROS)
      .eq("titulo", titulo)
      .order("fecha", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

async function vehiculosDe(ids: string[]): Promise<Map<string, VehiculoMini>> {
  const map = new Map<string, VehiculoMini>();
  if (ids.length === 0) return map;
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("id, numero, placa, marca, modelo, estado, empresa:empresas(codigo)")
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as unknown as VehiculoMini[]) map.set(row.id, row);
  return map;
}

export async function listarCasos(): Promise<CasoFila[]> {
  const eventos = await eventosSeguros(TITULO_CASO);
  const vehs = await vehiculosDe([...new Set(eventos.map((e) => e.vehiculo_id))]);
  const filas: CasoFila[] = [];
  for (const e of eventos) {
    const caso = parseCaso(e.detalle);
    const v = vehs.get(e.vehiculo_id);
    if (!caso || !v) continue;
    filas.push({
      id: e.id,
      vehiculoId: e.vehiculo_id,
      fecha: e.fecha,
      km: e.km,
      caso,
      numero: v.numero,
      placa: v.placa ?? "",
      marca: v.marca ?? "",
      empresa: empresaDe(v.empresa),
      estadoCarro: v.estado,
    });
  }
  return filas;
}

export async function leerCaso(id: string): Promise<CasoFila | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculo_eventos")
    .select("id, vehiculo_id, fecha, km, detalle, lugar, valor, origen, titulo")
    .eq("id", id)
    .maybeSingle();
  if (error || !data || data.origen !== ORIGEN_SEGUROS || data.titulo !== TITULO_CASO) return null;
  const caso = parseCaso(data.detalle);
  if (!caso) return null;
  const vehs = await vehiculosDe([data.vehiculo_id]);
  const v = vehs.get(data.vehiculo_id);
  if (!v) return null;
  return {
    id: data.id,
    vehiculoId: data.vehiculo_id,
    fecha: data.fecha,
    km: data.km,
    caso,
    numero: v.numero,
    placa: v.placa ?? "",
    marca: v.marca ?? "",
    empresa: empresaDe(v.empresa),
    estadoCarro: v.estado,
  };
}

export async function guardarFila(
  id: string,
  vehiculoId: string,
  fecha: string,
  km: number | null,
  lugar: string,
  caso: Caso,
): Promise<string | null> {
  const sb = createServerSupabase();
  const { error } = await sb
    .from("vehiculo_eventos")
    .update({
      fecha,
      km,
      lugar: lugar.slice(0, 180) || null,
      valor: caso.montoFiniquito,
      detalle: JSON.stringify(caso),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("vehiculo_id", vehiculoId)
    .eq("origen", ORIGEN_SEGUROS);
  return error ? error.message : null;
}

export async function crearFila(input: {
  vehiculoId: string;
  fecha: string;
  caso: Caso;
}): Promise<{ id: string } | { error: string }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculo_eventos")
    .insert({
      vehiculo_id: input.vehiculoId,
      fecha: input.fecha,
      tipo: "otro",
      titulo: TITULO_CASO,
      detalle: JSON.stringify(input.caso),
      lugar: input.caso.lugar.slice(0, 180) || null,
      origen: ORIGEN_SEGUROS,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "No se pudo abrir el caso." };
  await sb.from("vehiculo_eventos").insert({
    vehiculo_id: input.vehiculoId,
    fecha: input.fecha,
    tipo: "chapisteria",
    titulo: "Colisión reportada",
    detalle: "El caso está en Seguros.",
    origen: "manual",
  });
  return { id: data.id };
}

export type CarroParaCaso = {
  id: string;
  etiqueta: string;
  placa: string;
  marca: string;
  modelo: string;
  cliente: string;
  clienteId: string | null;
  contratoId: string | null;
  estado: string;
};

export async function carrosParaCaso(): Promise<CarroParaCaso[]> {
  const sb = createServerSupabase();
  const { data: vehs, error } = await sb
    .from("vehiculos")
    .select("id, numero, placa, marca, modelo, estado, empresa:empresas(codigo)")
    .neq("estado", "entregado")
    .order("numero");
  if (error) throw new Error(error.message);
  const { data: contratos } = await sb
    .from("contratos")
    .select("id, vehiculo_id, cliente_id, cliente:clientes(nombre)")
    .eq("estado", "activo");
  const porCarro = new Map<string, { id: string; clienteId: string | null; nombre: string }>();
  for (const c of (contratos ?? []) as unknown as {
    id: string;
    vehiculo_id: string;
    cliente_id: string | null;
    cliente: { nombre: string } | { nombre: string }[] | null;
  }[]) {
    const cli = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
    porCarro.set(c.vehiculo_id, { id: c.id, clienteId: c.cliente_id, nombre: cli?.nombre ?? "" });
  }
  return ((vehs ?? []) as unknown as VehiculoMini[]).map((v) => {
    const sigla = siglaEmpresa(empresaDe(v.empresa));
    const contrato = porCarro.get(v.id);
    return {
      id: v.id,
      etiqueta: sigla ? `${sigla} · ${v.numero}` : v.numero,
      placa: v.placa ?? "",
      marca: v.marca ?? "",
      modelo: v.modelo ?? "",
      cliente: contrato?.nombre ?? "",
      clienteId: contrato?.clienteId ?? null,
      contratoId: contrato?.id ?? null,
      estado: v.estado,
    };
  });
}

export async function subirArchivo(path: string, bytes: Uint8Array, tipo: string): Promise<string | null> {
  const sb = createServerSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: tipo || "application/octet-stream",
    upsert: true,
  });
  return error ? error.message : null;
}

export async function borrarArchivo(path: string): Promise<void> {
  const sb = createServerSupabase();
  await sb.storage.from(BUCKET).remove([path]);
}

export async function firmar(paths: string[]): Promise<Record<string, string>> {
  const limpios = paths.filter(Boolean);
  const out: Record<string, string> = {};
  if (limpios.length === 0) return out;
  const sb = createServerSupabase();
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(limpios, 60 * 60);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

type PolizaJson = { v: 1; aseguradora: AseguradoraId; numero: string; path: string | null };

export async function listarPolizas(): Promise<Poliza[]> {
  const eventos = await eventosSeguros(TITULO_POLIZA);
  const vehs = await vehiculosDe([...new Set(eventos.map((e) => e.vehiculo_id))]);
  const filas: Poliza[] = [];
  for (const e of eventos) {
    let json: PolizaJson | null = null;
    try {
      const j = JSON.parse(e.detalle ?? "") as PolizaJson;
      if (j?.v === 1) json = j;
    } catch {
      json = null;
    }
    const v = vehs.get(e.vehiculo_id);
    if (!json || !v) continue;
    filas.push({
      id: e.id,
      vehiculoId: e.vehiculo_id,
      vence: e.fecha,
      aseguradora: json.aseguradora,
      numero: json.numero,
      path: json.path,
      numeroCarro: v.numero,
      placa: v.placa ?? "",
      empresa: empresaDe(v.empresa),
    });
  }
  return filas;
}

export async function guardarPoliza(input: {
  vehiculoId: string;
  vence: string;
  aseguradora: AseguradoraId;
  numero: string;
  path: string | null;
}): Promise<string | null> {
  const sb = createServerSupabase();
  const cuerpo: PolizaJson = {
    v: 1,
    aseguradora: input.aseguradora,
    numero: input.numero,
    path: input.path,
  };
  const { data: ya } = await sb
    .from("vehiculo_eventos")
    .select("id, detalle")
    .eq("vehiculo_id", input.vehiculoId)
    .eq("origen", ORIGEN_SEGUROS)
    .eq("titulo", TITULO_POLIZA)
    .limit(1)
    .maybeSingle();
  let path = input.path;
  if (!path && ya?.detalle) {
    try {
      path = (JSON.parse(ya.detalle) as PolizaJson).path ?? null;
    } catch {
      path = null;
    }
    cuerpo.path = path;
  }
  if (ya?.id) {
    const { error } = await sb
      .from("vehiculo_eventos")
      .update({
        fecha: input.vence,
        detalle: JSON.stringify(cuerpo),
        tipo: "documento",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ya.id);
    return error ? error.message : null;
  }
  const { error } = await sb.from("vehiculo_eventos").insert({
    vehiculo_id: input.vehiculoId,
    fecha: input.vence,
    tipo: "documento",
    titulo: TITULO_POLIZA,
    detalle: JSON.stringify(cuerpo),
    origen: ORIGEN_SEGUROS,
  });
  return error ? error.message : null;
}

export type RegistroCarro = {
  placa: string;
  marca: string;
  modelo: string;
  anio: string;
  color: string;
  tipo: string;
  chasis: string;
  motor: string;
};

export function registroTieneDatos(r: RegistroCarro | null | undefined): boolean {
  if (!r) return false;
  return Object.values(r).some((v) => v.trim());
}

/** Ficha del carro que ya vive en el sistema. El paquete no pide volver a cargarla. */
export async function registroDeVehiculo(vehiculoId: string): Promise<RegistroCarro | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("placa, marca, modelo, anio, color, tipo, chasis, numero_motor")
    .eq("id", vehiculoId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    placa: string | null;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
    color: string | null;
    tipo: string | null;
    chasis: string | null;
    numero_motor: string | null;
  };
  return {
    placa: row.placa ?? "",
    marca: row.marca ?? "",
    modelo: row.modelo ?? "",
    anio: row.anio != null ? String(row.anio) : "",
    color: row.color ?? "",
    tipo: row.tipo ?? "",
    chasis: row.chasis ?? "",
    motor: row.numero_motor ?? "",
  };
}

export async function empresaDeVehiculo(vehiculoId: string): Promise<{ id: string; codigo: string } | null> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("vehiculos")
    .select("empresa_id, empresa:empresas(id, codigo)")
    .eq("id", vehiculoId)
    .maybeSingle();
  const emp = data?.empresa as { id: string; codigo: string } | { id: string; codigo: string }[] | null;
  const row = Array.isArray(emp) ? emp[0] : emp;
  if (!row?.id) return null;
  return { id: row.id, codigo: row.codigo };
}

export function pathEmpresa(empresaId: string, cual: "registro" | "representante"): string {
  return `seguros/empresas/${empresaId}/${cual}`;
}

export async function listarEmpresas(): Promise<{ id: string; codigo: string; nombre: string }[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb.from("empresas").select("id, codigo, nombre").order("codigo");
  if (error) return [];
  return (data ?? []) as { id: string; codigo: string; nombre: string }[];
}

export function polizasPorVencer(polizas: Poliza[], hoy = hoyPanama()): Poliza[] {
  const limite = sumarDias(hoy, 30);
  return polizas.filter((p) => p.vence && p.vence <= limite);
}
