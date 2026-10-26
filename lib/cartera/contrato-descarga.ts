import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/cartera/fecha";
import { numeroDeContrato } from "@/lib/cartera/contrato-numero";
import { armarDocxDesdeOriginal } from "@/lib/cartera/contrato-original";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

type ClienteDoc = {
  nombre: string;
  genero: string | null;
  cedula: string | null;
  telefono: string | null;
  whatsapp: string | null;
  direccion: string | null;
  notas: string | null;
};

type ContratoDoc = {
  id: string;
  cliente_id: string;
  fecha_inicio: string;
  letra_diaria: number;
  num_cuotas_total: number | null;
  abono_inicial: number | null;
  descuento_puntual: number | null;
  cobra_domingo: boolean | null;
  cuota_domingo: number | null;
  dias_primeros_domingos: number | null;
  vehiculo: {
    id: string;
    numero: string;
    placa: string | null;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
    empresa: { codigo: string; nombre: string } | { codigo: string; nombre: string }[] | null;
  } | null;
};

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function celularVisible(whatsapp: string | null, telefono: string | null): string | null {
  const raw = (telefono || whatsapp || "").replace(/\s/g, "");
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("507") && digits.length === 11) return digits.slice(3);
  return telefono || whatsapp;
}

export type DocumentoContrato =
  | { ok: true; docx: Buffer; nombreArchivo: string; etiqueta: string }
  | { ok: false; status: number; error: string };

/** El Word del contrato de este cliente, el mismo que se descarga. */
export async function documentoDeContrato(clienteId: string, contratoId: string): Promise<DocumentoContrato> {
  const sb = createServerSupabase();

  const { data: cliente, error: cErr } = await sb
    .from("clientes")
    .select("nombre, genero, cedula, telefono, whatsapp, direccion, notas")
    .eq("id", clienteId)
    .maybeSingle();
  if (cErr || !cliente) return { ok: false, status: 404, error: "No encontré el cliente." };
  const cli = cliente as ClienteDoc;

  const { data: contrato, error: kErr } = await sb
    .from("contratos")
    .select(
      "id, cliente_id, fecha_inicio, letra_diaria, num_cuotas_total, abono_inicial, descuento_puntual, cobra_domingo, cuota_domingo, dias_primeros_domingos, vehiculo:vehiculos(id, numero, placa, marca, modelo, anio, empresa:empresas(codigo, nombre))",
    )
    .eq("id", contratoId)
    .maybeSingle();
  if (kErr || !contrato) return { ok: false, status: 404, error: kErr?.message ?? "No encontré el contrato." };
  const con = contrato as unknown as ContratoDoc;
  if (con.cliente_id !== clienteId) return { ok: false, status: 404, error: "Ese contrato no es de este cliente." };
  const veh = uno(con.vehiculo);
  const empresa = uno(veh?.empresa ?? null);

  const refsCol = await sb.from("clientes").select("referencias, provincia").eq("id", clienteId).maybeSingle();
  const extraCli = refsCol.error
    ? null
    : (refsCol.data as { referencias?: string | null; provincia?: string | null } | null);
  let tec: {
    chasis: string | null;
    numero_motor: string | null;
    tipo: string | null;
    color: string | null;
    panapass: string | null;
  } | null = null;
  if (veh) {
    const porId = await sb
      .from("vehiculos")
      .select("chasis, numero_motor, tipo, color, panapass")
      .eq("id", veh.id)
      .maybeSingle();
    if (!porId.error && porId.data) {
      tec = porId.data as {
        chasis: string | null;
        numero_motor: string | null;
        tipo: string | null;
        color: string | null;
        panapass: string | null;
      };
    }
  }

  const referencias =
    extraCli?.referencias ??
    (cli.notas && /^1\. /m.test(cli.notas) ? cli.notas : null);
  const carro = veh?.numero ?? "—";
  const numeroContrato = await numeroDeContrato(sb, contratoId);
  const docx = await armarDocxDesdeOriginal({
    empresaCodigo: empresa?.codigo ?? null,
    numCuotas: con.num_cuotas_total,
    nombre: cli.nombre,
    cedula: cli.cedula,
    celular: celularVisible(cli.whatsapp, cli.telefono),
    genero: cli.genero,
    direccion: cli.direccion,
    provincia: extraCli?.provincia ?? null,
    referencias,
    fechaInicio: con.fecha_inicio,
    abono: Number(con.abono_inicial ?? 0),
    diasDomingos: Number(con.dias_primeros_domingos ?? 3),
    cuotaDomingo: Number(con.cuota_domingo ?? 30),
    letraDiaria: Number(con.letra_diaria),
    descuentoPuntual: Number(con.descuento_puntual ?? 5),
    cobraDomingo: con.cobra_domingo !== false,
    carro,
    placa: veh?.placa || "—",
    marca: veh?.marca || "—",
    chasis: tec?.chasis || "—",
    motor: tec?.numero_motor || "—",
    tipo: tec?.tipo || "—",
    modelo: veh?.modelo || "—",
    anio: veh?.anio != null ? String(veh.anio) : "—",
    color: tec?.color || "—",
    numeroContrato,
    fechaEmision: hoyPanama(),
    panapass: tec?.panapass ?? null,
  });
  const etiqueta = etiquetaCarroUi(empresa?.codigo ?? null, carro);
  return {
    ok: true,
    docx,
    nombreArchivo: `contrato-${etiqueta.replace(/\s+/g, "")}.docx`,
    etiqueta,
  };
}
