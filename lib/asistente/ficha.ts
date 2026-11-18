// Cumpleaños y número de Panapass. El asistente los consulta siempre:
// no dependen del módulo que tenga abierta la persona.

import { createServerSupabase } from "@/lib/supabase/server";
import { esCumpleanos, tienePermanencia } from "@/lib/cartera/cuota";
import { estadoCuentaContrato } from "@/lib/cartera/estado-cuenta";
import { siglaEmpresa } from "@/lib/cartera/empresa";
import { hoyPanama } from "@/lib/cartera/fecha";
import { pistaDeCarro } from "./cobro";

type EmpresaJoin = { codigo: string } | { codigo: string }[] | null;

function codigoDe(empresa: EmpresaJoin): string {
  const row = Array.isArray(empresa) ? empresa[0] : empresa;
  return row?.codigo ?? "";
}

async function carrosDe(carro: string): Promise<
  { id: string; numero: string; empresaId: string; codigo: string; panapass: string }[] | { error: string }
> {
  const pista = pistaDeCarro(carro);
  const sb = createServerSupabase();
  const { data: empresas, error: ee } = await sb.from("empresas").select("id, codigo");
  if (ee) return { error: "No pude leer las empresas." };
  const empId = pista.empresa
    ? (empresas ?? []).find((e) => String(e.codigo).toUpperCase() === pista.empresa)?.id
    : null;
  if (pista.empresa && !empId) return { error: "No encontré esa empresa." };

  let consulta = sb.from("vehiculos").select("id, numero, empresa_id, panapass").in("numero", pista.numeros);
  if (empId) consulta = consulta.eq("empresa_id", empId);
  const { data, error } = await consulta;
  if (error) return { error: "No pude buscar el carro." };
  if (!data?.length) return { error: `No hay un carro ${carro.trim()}.` };
  const porEmp = new Map((empresas ?? []).map((e) => [e.id, String(e.codigo)]));
  return data.map((v) => ({
    id: String(v.id),
    numero: String(v.numero ?? ""),
    empresaId: String(v.empresa_id ?? ""),
    codigo: porEmp.get(v.empresa_id) ?? "",
    panapass: String(v.panapass ?? "").trim(),
  }));
}

export async function panapassDe(carro: string) {
  const carros = await carrosDe(carro);
  if ("error" in carros) return carros;
  return {
    nota: "panapass es el número del tag. Si viene vacío, no está cargado.",
    carros: carros.map((v) => ({
      carro: `${siglaEmpresa(v.codigo)} ${v.numero}`.trim(),
      panapass: v.panapass || null,
    })),
  };
}

type Persona = {
  nombre: string;
  carro: string | null;
  fechaNacimiento: string;
  esHoy: boolean;
  aplica: boolean | null;
  motivo: string | null;
};

export async function cumpleanosDe(opts: { fecha?: string; carro?: string }) {
  const hoy = hoyPanama();
  const fecha = (opts.fecha ?? "").trim() || hoy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "La fecha va como YYYY-MM-DD." };
  const sb = createServerSupabase();

  if (opts.carro?.trim()) {
    const carros = await carrosDe(opts.carro);
    if ("error" in carros) return carros;
    const personas: Persona[] = [];
    for (const v of carros) {
      const { data: cons, error } = await sb
        .from("contratos")
        .select("id, fecha_inicio, cliente:clientes(nombre, fecha_nacimiento)")
        .eq("vehiculo_id", v.id)
        .eq("estado", "activo")
        .limit(1);
      if (error) return { error: "No pude leer el contrato." };
      const c = (cons ?? [])[0] as {
        id: string;
        fecha_inicio: string;
        cliente: { nombre: string | null; fecha_nacimiento: string | null } | { nombre: string | null; fecha_nacimiento: string | null }[] | null;
      } | undefined;
      const cliente = Array.isArray(c?.cliente) ? c?.cliente[0] : c?.cliente;
      const nacimiento = cliente?.fecha_nacimiento ?? null;
      const base = {
        nombre: (cliente?.nombre ?? "").trim() || "Sin nombre",
        carro: `${siglaEmpresa(v.codigo)} ${v.numero}`.trim(),
        fechaNacimiento: nacimiento,
      };
      if (!nacimiento || !c) {
        personas.push({ ...base, fechaNacimiento: nacimiento ?? "", esHoy: false, aplica: null, motivo: nacimiento ? null : "no tiene fecha de nacimiento" });
        continue;
      }
      const es = esCumpleanos(nacimiento, fecha);
      const libre = es && fecha === hoy ? await diaLibre(c.id, c.fecha_inicio, hoy) : null;
      personas.push({
        nombre: base.nombre,
        carro: base.carro,
        fechaNacimiento: nacimiento,
        esHoy: es && fecha === hoy,
        aplica: es ? (libre?.aplica ?? null) : false,
        motivo: es ? (libre?.motivo ?? (fecha === hoy ? null : "el día libre solo se evalúa hoy")) : "ese día no es su cumpleaños",
      });
    }
    return { fecha, personas };
  }

  const clientes: { id: string; nombre: string; fecha_nacimiento: string }[] = [];
  for (let desde = 0; desde < 5000; desde += 1000) {
    const { data, error } = await sb
      .from("clientes")
      .select("id, nombre, fecha_nacimiento")
      .not("fecha_nacimiento", "is", null)
      .range(desde, desde + 999);
    if (error) return { error: "No pude leer las fechas de nacimiento." };
    for (const r of data ?? []) {
      if (!r.fecha_nacimiento || !esCumpleanos(String(r.fecha_nacimiento), fecha)) continue;
      clientes.push({ id: String(r.id), nombre: String(r.nombre ?? "").trim(), fecha_nacimiento: String(r.fecha_nacimiento) });
    }
    if ((data ?? []).length < 1000) break;
  }

  const personas: Persona[] = [];
  for (let i = 0; i < clientes.length; i += 100) {
    const lote = clientes.slice(i, i + 100);
    const { data, error } = await sb
      .from("contratos")
      .select("id, fecha_inicio, cliente_id, vehiculo:vehiculos(numero, empresa:empresas(codigo))")
      .in("cliente_id", lote.map((c) => c.id))
      .eq("estado", "activo");
    if (error) return { error: "No pude leer los carros." };
    const porCliente = new Map<string, { id: string; fecha_inicio: string; carro: string }[]>();
    for (const row of (data ?? []) as unknown as {
      id: string;
      fecha_inicio: string;
      cliente_id: string;
      vehiculo: { numero: string; empresa: EmpresaJoin } | { numero: string; empresa: EmpresaJoin }[] | null;
    }[]) {
      const veh = Array.isArray(row.vehiculo) ? row.vehiculo[0] : row.vehiculo;
      const lista = porCliente.get(row.cliente_id) ?? [];
      lista.push({
        id: row.id,
        fecha_inicio: row.fecha_inicio,
        carro: veh ? `${siglaEmpresa(codigoDe(veh.empresa))} ${veh.numero}`.trim() : "",
      });
      porCliente.set(row.cliente_id, lista);
    }
    for (const cliente of lote) {
      const carros = porCliente.get(cliente.id) ?? [];
      if (carros.length === 0) {
        personas.push({
          nombre: cliente.nombre || "Sin nombre",
          carro: null,
          fechaNacimiento: cliente.fecha_nacimiento,
          esHoy: fecha === hoy,
          aplica: false,
          motivo: "sin contrato activo",
        });
        continue;
      }
      for (const carro of carros) {
        const libre = fecha === hoy ? await diaLibre(carro.id, carro.fecha_inicio, hoy) : null;
        personas.push({
          nombre: cliente.nombre || "Sin nombre",
          carro: carro.carro || null,
          fechaNacimiento: cliente.fecha_nacimiento,
          esHoy: fecha === hoy,
          aplica: libre?.aplica ?? null,
          motivo: libre?.motivo ?? (fecha === hoy ? null : "el día libre solo se evalúa hoy"),
        });
      }
    }
  }
  return { fecha, n: personas.length, personas: personas.slice(0, 40) };
}

async function diaLibre(
  contratoId: string,
  fechaInicio: string,
  hoy: string,
): Promise<{ aplica: boolean; motivo: string | null }> {
  if (!tienePermanencia(fechaInicio, hoy, 1)) {
    return { aplica: false, motivo: "menos de 1 mes de permanencia" };
  }
  const est = await estadoCuentaContrato(contratoId);
  if (!est) return { aplica: false, motivo: "no pude leer el estado de cuenta" };
  if (est.pendienteAnterior > 0.009) return { aplica: false, motivo: "tiene saldo pendiente; debe estar al día" };
  if (est.cuotaHoy <= 0) return { aplica: false, motivo: "hoy no corre letra" };
  return { aplica: true, motivo: null };
}
