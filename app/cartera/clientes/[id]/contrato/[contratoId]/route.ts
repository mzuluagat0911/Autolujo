import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { armarTextoContrato } from "@/lib/cartera/contrato-documento";
import { etiquetaCarroUi } from "@/lib/cartera/empresa";

export const dynamic = "force-dynamic";

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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; contratoId: string }> },
) {
  const { id, contratoId } = await ctx.params;
  const sb = createServerSupabase();

  const { data: cliente, error: cErr } = await sb
    .from("clientes")
    .select("nombre, genero, cedula, telefono, whatsapp, direccion, notas")
    .eq("id", id)
    .maybeSingle();
  if (cErr || !cliente) {
    return NextResponse.json({ error: "No encontré el cliente." }, { status: 404 });
  }
  const cli = cliente as ClienteDoc;

  const { data: contrato, error: kErr } = await sb
    .from("contratos")
    .select(
      "id, cliente_id, fecha_inicio, letra_diaria, num_cuotas_total, abono_inicial, descuento_puntual, cobra_domingo, cuota_domingo, dias_primeros_domingos, vehiculo:vehiculos(id, numero, placa, marca, modelo, anio, empresa:empresas(codigo, nombre))",
    )
    .eq("id", contratoId)
    .maybeSingle();
  if (kErr || !contrato) {
    return NextResponse.json({ error: kErr?.message ?? "No encontré el contrato." }, { status: 404 });
  }
  const con = contrato as unknown as ContratoDoc;
  if (con.cliente_id !== id) {
    return NextResponse.json({ error: "Ese contrato no es de este cliente." }, { status: 404 });
  }
  const veh = uno(con.vehiculo);
  const empresa = uno(veh?.empresa ?? null);

  const refsCol = await sb.from("clientes").select("referencias, provincia").eq("id", id).maybeSingle();
  const extraCli = refsCol.error
    ? null
    : (refsCol.data as { referencias?: string | null; provincia?: string | null } | null);
  let tec: { chasis: string | null; numero_motor: string | null; tipo: string | null; color: string | null } | null = null;
  if (veh) {
    const porId = await sb
      .from("vehiculos")
      .select("chasis, numero_motor, tipo, color")
      .eq("id", veh.id)
      .maybeSingle();
    if (!porId.error && porId.data) {
      tec = porId.data as {
        chasis: string | null;
        numero_motor: string | null;
        tipo: string | null;
        color: string | null;
      };
    }
  }

  const referencias =
    extraCli?.referencias ??
    (cli.notas && /^1\. /m.test(cli.notas) ? cli.notas : null);
  const carro = veh?.numero ?? "—";
  const texto = armarTextoContrato({
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
  });

  const nombreArchivo = `contrato-${etiquetaCarroUi(empresa?.codigo ?? null, carro).replace(/\s+/g, "")}.txt`;
  return new NextResponse(texto, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
