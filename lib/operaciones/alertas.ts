// Alertas de operaciones: semáforo de licencias, mantenimiento por km y
// revisado/placa. Todo defensivo: si la migración 0018 aún no corrió (columnas
// inexistentes) o no hay datos, devuelve `disponible: false` sin romper la UI.

import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

export const KM_MANTENIMIENTO = 6000;
export const KM_AVISO = 5000; // "pronto" antes de llegar a los 6.000
/** Kit de tiempo: preventivo ~cada 60.000 km; ventana de citación 55–65 mil del ciclo. */
export const KM_KIT_TIEMPO = 60_000;
export const KM_KIT_AVISO = 5_000;
export const KM_KIT_HOLGURA = 5_000; // hasta +5k se considera “por hacer”


export type NivelSemaforo = "vencido" | "rojo" | "amarillo" | "verde";

export function nivelPorDias(dias: number): NivelSemaforo {
  if (dias < 0) return "vencido";
  if (dias <= 30) return "rojo";
  if (dias <= 90) return "amarillo";
  return "verde";
}

function diasHasta(fecha: string, hoy: string): number {
  const a = new Date(`${fecha}T00:00:00Z`).getTime();
  const b = new Date(`${hoy}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86400000);
}

/** Mapa vehiculo_id → cliente (contrato activo), para saber a quién citar/avisar. */
async function clientePorVehiculoActivo(): Promise<Map<string, { nombre: string; contacto: string | null }>> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("contratos")
    .select("vehiculo_id, cliente:clientes(nombre, whatsapp, telefono)")
    .eq("estado", "activo");
  const out = new Map<string, { nombre: string; contacto: string | null }>();
  for (const r of (data ?? []) as unknown as { vehiculo_id: string; cliente: { nombre: string; whatsapp: string | null; telefono: string | null } | null }[]) {
    if (r.vehiculo_id && r.cliente) {
      out.set(r.vehiculo_id, { nombre: r.cliente.nombre, contacto: r.cliente.whatsapp ?? r.cliente.telefono ?? null });
    }
  }
  return out;
}

export type LicenciaItem = {
  id: string;
  nombre: string;
  contacto: string | null;
  fecha: string;
  dias: number;
  nivel: NivelSemaforo;
  carro: string | null;
  vehiculoId: string | null;
};

/** Mapa cliente_id → carro del contrato activo. */
async function carroPorClienteActivo(): Promise<
  Map<string, { etiqueta: string; vehiculoId: string }>
> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("contratos")
    .select("cliente_id, vehiculo:vehiculos(id, numero, empresa:empresas(codigo))")
    .eq("estado", "activo");
  const out = new Map<string, { etiqueta: string; vehiculoId: string }>();
  for (const r of (data ?? []) as unknown as {
    cliente_id: string;
    vehiculo: {
      id: string;
      numero: string;
      empresa: { codigo: string } | { codigo: string }[] | null;
    } | null;
  }[]) {
    if (!r.cliente_id || !r.vehiculo) continue;
    const empRaw = r.vehiculo.empresa;
    const emp = Array.isArray(empRaw) ? empRaw[0]?.codigo ?? null : empRaw?.codigo ?? null;
    out.set(r.cliente_id, {
      etiqueta: etiquetaCarroUi(emp, r.vehiculo.numero),
      vehiculoId: r.vehiculo.id,
    });
  }
  return out;
}

export async function licenciasSemaforo(): Promise<{ disponible: boolean; items: LicenciaItem[] }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("clientes")
    .select("id, nombre, whatsapp, telefono, fecha_vencimiento_licencia")
    .not("fecha_vencimiento_licencia", "is", null);
  if (error) return { disponible: false, items: [] };

  const carros = await carroPorClienteActivo();
  const hoy = hoyPanama();
  const items = ((data ?? []) as unknown as {
    id: string;
    nombre: string;
    whatsapp: string | null;
    telefono: string | null;
    fecha_vencimiento_licencia: string;
  }[])
    .map((c) => {
      const dias = diasHasta(c.fecha_vencimiento_licencia, hoy);
      const carro = carros.get(c.id);
      return {
        id: c.id,
        nombre: c.nombre,
        contacto: c.whatsapp ?? c.telefono ?? null,
        fecha: c.fecha_vencimiento_licencia,
        dias,
        nivel: nivelPorDias(dias),
        carro: carro?.etiqueta ?? null,
        vehiculoId: carro?.vehiculoId ?? null,
      };
    })
    .sort((a, b) => a.dias - b.dias);
  return { disponible: true, items };
}

export type MantenimientoItem = {
  vehiculoNumero: string; empresa: string | null; cliente: string | null; contacto: string | null;
  desde: string; kmDesde: number; faltan: number;
  estado: "vencido" | "pronto" | "ok";
};

/**
 * Km recorridos desde el último mantenimiento = suma del km diario de Diacor
 * (tabla gps_dias) desde `fecha_ultimo_mantenimiento`. Necesita solo la fecha
 * del último mantenimiento por carro; el km lo aporta el GPS.
 */
export async function mantenimientoKm(): Promise<{ disponible: boolean; items: MantenimientoItem[] }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("id, numero, fecha_ultimo_mantenimiento, empresa:empresas(codigo)")
    .not("fecha_ultimo_mantenimiento", "is", null);
  if (error) return { disponible: false, items: [] };
  const vehs = (data ?? []) as unknown as { id: string; numero: string; fecha_ultimo_mantenimiento: string; empresa: { codigo: string } | null }[];
  if (vehs.length === 0) return { disponible: true, items: [] };

  // Suma de km de gps_dias por vehículo, desde su fecha de último mantenimiento.
  const ids = vehs.map((v) => v.id);
  const anchor = new Map(vehs.map((v) => [v.id, v.fecha_ultimo_mantenimiento]));
  const minAnchor = vehs.reduce((m, v) => (v.fecha_ultimo_mantenimiento < m ? v.fecha_ultimo_mantenimiento : m), vehs[0].fecha_ultimo_mantenimiento);
  const { data: dias } = await sb
    .from("gps_dias")
    .select("vehiculo_id, fecha, km")
    .in("vehiculo_id", ids)
    .gte("fecha", minAnchor);
  const kmMap = new Map<string, number>();
  for (const d of (dias ?? []) as { vehiculo_id: string | null; fecha: string; km: number | null }[]) {
    if (!d.vehiculo_id || d.km == null) continue;
    const a = anchor.get(d.vehiculo_id);
    if (a && d.fecha >= a) kmMap.set(d.vehiculo_id, (kmMap.get(d.vehiculo_id) ?? 0) + Number(d.km));
  }

  const clientes = await clientePorVehiculoActivo();
  const items = vehs
    .map((v) => {
      const kmDesde = Math.round(kmMap.get(v.id) ?? 0);
      const faltan = KM_MANTENIMIENTO - kmDesde;
      const estado: MantenimientoItem["estado"] =
        kmDesde >= KM_MANTENIMIENTO ? "vencido" : kmDesde >= KM_AVISO ? "pronto" : "ok";
      const c = clientes.get(v.id);
      return { vehiculoNumero: v.numero, empresa: v.empresa?.codigo ?? null, cliente: c?.nombre ?? null, contacto: c?.contacto ?? null, desde: v.fecha_ultimo_mantenimiento, kmDesde, faltan, estado };
    })
    .sort((a, b) => b.kmDesde - a.kmDesde);
  return { disponible: true, items };
}

export type KitTiempoItem = {
  vehiculoNumero: string;
  empresa: string | null;
  cliente: string | null;
  contacto: string | null;
  kmActual: number;
  marcaKm: number;
  faltan: number;
  estado: "vencido" | "pronto" | "ok";
};

/** Próxima marca de kit (60k, 120k, …) y estado de citación. */
export function evaluarKitTiempo(kmActual: number): {
  marcaKm: number;
  faltan: number;
  estado: KitTiempoItem["estado"];
} {
  const km = Math.max(0, Math.round(kmActual));
  const ciclo = Math.floor(km / KM_KIT_TIEMPO);
  const ultima = ciclo * KM_KIT_TIEMPO;
  const siguiente = (ciclo + 1) * KM_KIT_TIEMPO;

  // Pasó la marca y sigue en holgura (ej. 60–65k) → citar ya.
  if (ultima >= KM_KIT_TIEMPO && km < ultima + KM_KIT_HOLGURA) {
    return { marcaKm: ultima, faltan: ultima - km, estado: "vencido" };
  }
  const faltan = siguiente - km;
  if (faltan <= KM_KIT_AVISO) {
    return { marcaKm: siguiente, faltan, estado: "pronto" };
  }
  return { marcaKm: siguiente, faltan, estado: "ok" };
}

export async function kitTiempoKm(): Promise<{ disponible: boolean; items: KitTiempoItem[] }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("id, numero, km_actual, empresa:empresas(codigo)")
    .not("km_actual", "is", null)
    .neq("estado", "entregado");
  if (error) return { disponible: false, items: [] };

  const clientes = await clientePorVehiculoActivo();
  const items = ((data ?? []) as unknown as {
    id: string;
    numero: string;
    km_actual: number;
    empresa: { codigo: string } | null;
  }[])
    .map((v) => {
      const ev = evaluarKitTiempo(Number(v.km_actual));
      const c = clientes.get(v.id);
      return {
        vehiculoNumero: v.numero,
        empresa: v.empresa?.codigo ?? null,
        cliente: c?.nombre ?? null,
        contacto: c?.contacto ?? null,
        kmActual: Math.round(Number(v.km_actual)),
        marcaKm: ev.marcaKm,
        faltan: ev.faltan,
        estado: ev.estado,
      };
    })
    .filter((i) => i.estado !== "ok")
    .sort((a, b) => a.faltan - b.faltan);

  return { disponible: true, items };
}

export type RevisadoItem = { vehiculoNumero: string; empresa: string | null; cliente: string | null; contacto: string | null; fecha: string; dias: number; nivel: NivelSemaforo };

export async function revisadoSemaforo(): Promise<{ disponible: boolean; items: RevisadoItem[] }> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("vehiculos")
    .select("id, numero, revisado_vence, empresa:empresas(codigo)")
    .not("revisado_vence", "is", null);
  if (error) return { disponible: false, items: [] };
  const clientes = await clientePorVehiculoActivo();
  const hoy = hoyPanama();
  const items = ((data ?? []) as unknown as { id: string; numero: string; revisado_vence: string; empresa: { codigo: string } | null }[])
    .map((v) => {
      const dias = diasHasta(v.revisado_vence, hoy);
      const c = clientes.get(v.id);
      return { vehiculoNumero: v.numero, empresa: v.empresa?.codigo ?? null, cliente: c?.nombre ?? null, contacto: c?.contacto ?? null, fecha: v.revisado_vence, dias, nivel: nivelPorDias(dias) };
    })
    .sort((a, b) => a.dias - b.dias);
  return { disponible: true, items };
}
