// "A pagar hoy" de un carro. Sale de cobroHoy, no del saldo del libro.

import { createServerSupabase } from "@/lib/supabase/server";
import { cobroHoyContrato } from "@/lib/cartera/cobro-hoy";
import { estadoCuentaContrato } from "@/lib/cartera/estado-cuenta";
import { siglaEmpresa } from "@/lib/cartera/empresa";

type Pista = { numeros: string[]; empresa: "AUTOLUJO" | "KOWUA" | "GOLD" | null };

export function pistaDeCarro(raw: string): Pista {
  const compacto = raw.trim().toUpperCase().replace(/[·.\s-]+/g, "");
  const pref = compacto.match(/^(AUTOLUJO|KOWUA|GOLD|AL|KW|GD|G)([A-Z]?\d+)$/);
  if (!pref) {
    const n = raw.trim();
    return { numeros: [...new Set([n, n.replace(/^0+/, "") || n])], empresa: null };
  }
  const marca = pref[1];
  const resto = pref[2];
  const empresa =
    marca === "AL" || marca === "AUTOLUJO"
      ? "AUTOLUJO"
      : marca === "KW" || marca === "KOWUA"
        ? "KOWUA"
        : "GOLD";
  const numeros = new Set<string>();
  if (empresa === "GOLD") {
    const n = resto.replace(/^G/, "").replace(/^0+/, "") || "0";
    numeros.add(`G${n.padStart(2, "0")}`);
    numeros.add(`G${n}`);
    numeros.add(n);
  } else {
    numeros.add(resto.replace(/^0+/, "") || resto);
    numeros.add(resto);
  }
  return { numeros: [...numeros], empresa };
}

const ESTADOS = ["activo", "suspendido", "finalizado", "traspasado", "devuelto"] as const;

/** Saldo de libro sumado por estado de contrato y, si se pide, por empresa. No es lo que se cobra hoy. */
export async function saldoCartera(opts: { estado?: string; empresa?: string }) {
  const estado = (opts.estado ?? "activo").trim().toLowerCase();
  if (estado !== "todos" && !(ESTADOS as readonly string[]).includes(estado)) {
    return { error: `Estado no válido. Usa: ${ESTADOS.join(", ")} o todos.` };
  }
  const sb = createServerSupabase();
  let empresaId: string | null = null;
  if (opts.empresa) {
    const pista = pistaDeCarro(`${opts.empresa}1`).empresa;
    const codigo = pista ?? opts.empresa.trim().toUpperCase();
    const { data: e } = await sb.from("empresas").select("id").eq("codigo", codigo).maybeSingle();
    if (!e) return { error: "Empresa no encontrada. Usa AUTOLUJO, KOWUA o GOLD." };
    empresaId = String(e.id);
  }

  const ids: string[] = [];
  for (let desde = 0; desde < 5000; desde += 1000) {
    let q = sb.from("contratos").select("id").range(desde, desde + 999);
    if (estado !== "todos") q = q.eq("estado", estado);
    if (empresaId) q = q.eq("empresa_id", empresaId);
    const { data, error } = await q;
    if (error) return { error: "No pude leer los contratos." };
    ids.push(...(data ?? []).map((r) => String(r.id)));
    if ((data ?? []).length < 1000) break;
  }

  let suma = 0;
  let conDeuda = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb
      .from("vw_saldo_contrato")
      .select("saldo_actual")
      .in("contrato_id", ids.slice(i, i + 200));
    if (error) return { error: "No pude leer los saldos." };
    for (const r of data ?? []) {
      const n = Number(r.saldo_actual) || 0;
      suma += n;
      if (n > 0.009) conDeuda += 1;
    }
  }
  return {
    estado,
    empresa: opts.empresa ?? "todas",
    contratos: ids.length,
    contratosConSaldo: conDeuda,
    saldoLibro: Math.round(suma * 100) / 100,
    nota: "Saldo de libro (cargos menos pagos), con domingo y saldos a favor incluidos. No es lo que se cobra hoy.",
  };
}

export async function cobroDeCarro(carro: string) {
  const pista = pistaDeCarro(carro);
  const sb = createServerSupabase();
  const { data: empresas, error: ee } = await sb.from("empresas").select("id, codigo");
  if (ee) return { error: "No pude leer las empresas." };
  const empId = pista.empresa
    ? (empresas ?? []).find((e) => String(e.codigo).toUpperCase() === pista.empresa)?.id
    : null;
  if (pista.empresa && !empId) return { error: "No encontré esa empresa." };

  let consulta = sb.from("vehiculos").select("id, numero, empresa_id").in("numero", pista.numeros);
  if (empId) consulta = consulta.eq("empresa_id", empId);
  const { data: vehs, error: ev } = await consulta;
  if (ev) return { error: "No pude buscar el carro." };
  if (!vehs?.length) return { error: `No hay un carro ${carro.trim()}.` };

  const ids = vehs.map((v) => v.id);
  const { data: cons, error: ec } = await sb
    .from("contratos")
    .select("id, estado, fecha_inicio, vehiculo_id")
    .in("vehiculo_id", ids)
    .eq("estado", "activo");
  if (ec) return { error: "No pude leer el contrato." };
  const activos = (cons ?? []).slice(0, 3);
  if (activos.length === 0) {
    return { error: `El carro ${carro.trim()} no tiene un contrato activo.` };
  }

  const porVeh = new Map(vehs.map((v) => [v.id, v]));
  const porEmp = new Map((empresas ?? []).map((e) => [e.id, e.codigo]));
  const salida = [];
  for (const c of activos) {
    const estado = await estadoCuentaContrato(c.id);
    if (!estado) continue;
    const cobro = await cobroHoyContrato(estado);
    const veh = porVeh.get(c.vehiculo_id);
    const codigo = veh ? porEmp.get(veh.empresa_id) : null;
    salida.push({
      carro: `${siglaEmpresa(codigo)} ${veh?.numero ?? ""}`.trim(),
      aPagarHoy: cobro.totalCobrarHoy,
      desglose: cobro.desglose,
      lineas: cobro.lineas.map((l) => ({ etiqueta: l.etiqueta, monto: l.monto })),
      saldoLibro: estado.saldoVista,
      letra: estado.letra,
      alDia: estado.totalHoy <= 0.009,
    });
  }
  if (salida.length === 0) return { error: "No pude armar el cobro de ese carro." };
  return {
    nota: "aPagarHoy es el total del mensaje. saldoLibro es el libro y no se cobra aparte.",
    carros: salida,
  };
}
