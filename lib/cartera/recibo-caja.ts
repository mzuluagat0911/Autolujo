import { createServerSupabase } from "@/lib/supabase/server";
import { siglaEmpresa } from "./empresa";
import { etiquetaRubro } from "./rubros-pago";
import type { AsignacionPago, ResultadoPago } from "./types";

/** Oficina donde está la impresora de 80 mm. El nombre legal cambia por empresa. */
const OFICINA = {
  ciudad: "Ciudad de Panamá",
  direccion: "Juan Díaz, San Fernando, calle 131 este",
  telefono: "+507 6643-2422",
};

const RAZON: Record<string, { nombre: string; correo: string | null }> = {
  AL: { nombre: "INVERSIONES AUTO LUJO PANAMA S.A.", correo: "inversionesautolujopanama@hotmail.com" },
  KW: { nombre: "KOWUA S.A.", correo: null },
  GD: { nombre: "REPARACIONES AUTOMOTRICES GOLD S.A.", correo: null },
};

export type LineaRecibo = { concepto: string; valor: number };

export type ReciboCaja = {
  numero: string;
  fechaPago: string;
  empresa: string;
  correo: string | null;
  nombre: string;
  cedula: string;
  placa: string;
  unidad: string;
  metodo: string;
  monto: number;
  lineas: LineaRecibo[];
  letra: number | null;
  atendio: string;
};

function numeroRecibo(id: string): string {
  const n = parseInt(id.replace(/-/g, "").slice(0, 8), 16) % 100_000_000;
  return String(Number.isFinite(n) ? n : 0).padStart(8, "0");
}

export function fechaRecibo(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "—";
  const fecha = new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const hora = new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${fecha} ${hora}`;
}

function metodoVisible(metodo: string | null): string {
  const m = (metodo ?? "").toLowerCase();
  if (m === "efectivo") return "Efectivo";
  if (m === "tarjeta") return "Tarjeta";
  if (m === "transferencia") return "Transferencia";
  if (m === "yappy") return "Yappy";
  if (!m) return "—";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function lineasDe(raw: unknown, rubro: string | null, monto: number): LineaRecibo[] {
  const lista = asignacionesDe(raw);
  if (lista.length > 0) {
    return lista.map((a) => ({
      concepto: (a.etiqueta || a.tipo || "Pago").replace(/_/g, " "),
      valor: Number(a.aplicado) || 0,
    }));
  }
  return [{ concepto: etiquetaRubro(rubro), valor: monto }];
}

function asignacionesDe(raw: unknown): AsignacionPago[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as AsignacionPago[];
  if (typeof raw === "object" && Array.isArray((raw as ResultadoPago).asignaciones)) {
    return (raw as ResultadoPago).asignaciones;
  }
  return [];
}

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function cargarRecibo(pagoId: string, atendio: string): Promise<ReciboCaja | null> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("pagos")
    .select(
      "id, fecha, pagado_at, monto, metodo, numero_carro, rubro, asignaciones, cliente:clientes(nombre, cedula), contrato:contratos(letra_diaria, vehiculo:vehiculos(numero, placa, empresa:empresas(codigo, nombre)))",
    )
    .eq("id", pagoId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    fecha: string | null;
    pagado_at: string | null;
    monto: number;
    metodo: string | null;
    numero_carro: string | null;
    rubro: string | null;
    asignaciones: unknown;
    cliente: { nombre: string | null; cedula: string | null } | { nombre: string | null; cedula: string | null }[] | null;
    contrato: {
      letra_diaria: number | null;
      vehiculo: {
        numero: string | null;
        placa: string | null;
        empresa: { codigo: string | null; nombre: string | null } | { codigo: string | null; nombre: string | null }[] | null;
      } | null;
    } | null;
  };

  const cliente = uno(row.cliente);
  const contrato = uno(row.contrato);
  const veh = uno(contrato?.vehiculo ?? null);
  const emp = uno(veh?.empresa ?? null);
  const sigla = siglaEmpresa(emp?.codigo ?? null);
  const razon = RAZON[sigla] ?? {
    nombre: emp?.nombre?.trim() || "AutoLujo",
    correo: null,
  };
  const monto = Number(row.monto) || 0;

  return {
    numero: numeroRecibo(row.id),
    fechaPago: fechaRecibo(row.pagado_at ?? (row.fecha ? `${row.fecha}T12:00:00-05:00` : null)),
    empresa: razon.nombre,
    correo: razon.correo,
    nombre: (cliente?.nombre ?? "—").toUpperCase(),
    cedula: cliente?.cedula?.trim() || "—",
    placa: veh?.placa?.trim() || "—",
    unidad: (veh?.numero ?? row.numero_carro ?? "—").trim(),
    metodo: metodoVisible(row.metodo),
    monto,
    lineas: lineasDe(row.asignaciones, row.rubro, monto),
    letra: contrato?.letra_diaria != null ? Number(contrato.letra_diaria) : null,
    atendio: atendio.trim() || "Oficina",
  };
}

export const DATOS_OFICINA = OFICINA;
