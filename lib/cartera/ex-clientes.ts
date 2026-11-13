import { createServerSupabase } from "@/lib/supabase/server";
import { siglaEmpresa } from "./empresa";

export type EstadoExCliente = "cobro" | "acuerdo" | "pausado" | "cerrado";
export type OrigenExCliente = "manual" | "excel";

export type ExCliente = {
  id: string;
  nombre: string;
  cedula: string | null;
  telefono: string | null;
  whatsapp: string | null;
  empresaId: string;
  empresa: string;
  carro: string | null;
  saldo: number;
  motivo: string | null;
  notas: string | null;
  origen: OrigenExCliente;
  estado: EstadoExCliente;
  createdAt: string;
};

export type EmpresaEx = { id: string; codigo: string; nombre: string };

function tablaAusente(message: string): boolean {
  return /ex_clientes|schema cache|could not find the table/i.test(message);
}

function fila(row: Record<string, unknown>): ExCliente {
  const emp = row.empresa as { codigo: string | null } | null;
  return {
    id: String(row.id),
    nombre: String(row.nombre ?? ""),
    cedula: (row.cedula as string | null) ?? null,
    telefono: (row.telefono as string | null) ?? null,
    whatsapp: (row.whatsapp as string | null) ?? null,
    empresaId: String(row.empresa_id),
    empresa: siglaEmpresa(emp?.codigo) || "—",
    carro: (row.carro as string | null) ?? null,
    saldo: Number(row.saldo ?? 0),
    motivo: (row.motivo as string | null) ?? null,
    notas: (row.notas as string | null) ?? null,
    origen: row.origen === "excel" ? "excel" : "manual",
    estado: (row.estado as EstadoExCliente) || "cobro",
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listarEmpresasEx(): Promise<EmpresaEx[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb.from("empresas").select("id, codigo, nombre").order("codigo");
  if (error) return [];
  return ((data ?? []) as EmpresaEx[]).map((e) => ({
    ...e,
    codigo: siglaEmpresa(e.codigo) || e.codigo,
  }));
}

export async function listarExClientes(): Promise<{ filas: ExCliente[]; error: string | null }> {
  try {
    const sb = createServerSupabase();
    const { data, error } = await sb
      .from("ex_clientes")
      .select("id, nombre, cedula, telefono, whatsapp, empresa_id, carro, saldo, motivo, notas, origen, estado, created_at, empresa:empresas(codigo)")
      .order("created_at", { ascending: false });
    if (error) {
      return {
        filas: [],
        error: tablaAusente(error.message)
          ? "Falta aplicar la migración 0048 para registrar ex clientes."
          : error.message,
      };
    }
    return { filas: ((data ?? []) as Record<string, unknown>[]).map(fila), error: null };
  } catch (e) {
    return { filas: [], error: e instanceof Error ? e.message : "Error" };
  }
}
