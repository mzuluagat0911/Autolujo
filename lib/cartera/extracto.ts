// Conciliación por extracto bancario (Banco General).
// Sube el PDF → parsea movimientos → cruza por # de carro (y por nombre) →
// aplica el pago al contrato (parciales incluidos) → marca excepciones.
// Todo el dinero se calcula aquí, no en el LLM.

import { extractText, getDocumentProxy } from "unpdf";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, instantePanama } from "./fecha";

const MESES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
};

function parseFecha(s: string): string | null {
  const m = /(\d{1,2})-([a-zA-Záéíóú]{3})[a-z]*-(\d{4})/i.exec(s);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase().slice(0, 3)];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[1].padStart(2, "0")}`;
}

// Clave canónica de un # de carro: quita símbolos y ceros a la izquierda.
export function canonCarro(s: string): string {
  const t = String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^([A-Z]*)0*(\d+)$/.exec(t);
  return m ? m[1] + String(parseInt(m[2], 10)) : t;
}

function canonNombre(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}

type MovParse = {
  fecha: string | null;
  descripcion: string;
  monto: number;
  saldo: number | null;
  numeroCarro: string | null;
  nombre: string | null;
};

function extraerCarro(desc: string, empresa: string | null): string | null {
  if (empresa === "GOLD") {
    const m = /\bG\s*-?\s*0*(\d{1,3})\b/i.exec(desc);
    return m ? "G" + parseInt(m[1], 10) : null;
  }
  // Autolujo / Kowua: número junto a una palabra clave
  const m = /\b(?:carro|cuota|veh[ií]culo|unidad|#)\s*#?\s*0*(\d{1,3})\b/i.exec(desc);
  return m ? String(parseInt(m[1], 10)) : null;
}

function extraerNombre(desc: string): string | null {
  const m = /TRANSFERENCIA DE\s+(.+)/i.exec(desc) || /DEP[OÓ]SITO DE\s+(.+)/i.exec(desc);
  if (!m) return null;
  // corta antes del # de carro o de un paréntesis
  let n = m[1].split(/\s+(?:carro|cuota|veh[ií]culo|pago|seguro|\(|G\s?-?\d)/i)[0];
  n = n.replace(/\s+[A-Z]?\d.*$/i, "").trim(); // quita colas tipo "G02", "G 14"
  return n.length >= 5 ? n : null;
}

/** Parsea el PDF del extracto en movimientos estructurados. */
export async function parseExtracto(
  buffer: Buffer,
  empresaCodigo: string,
): Promise<{
  titular: string;
  movimientos: MovParse[];
}> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });

  const titular = (/Titular:\s*([^\n]+)/i.exec(text)?.[1] ?? "").trim();

  const start = text.indexOf("Últimos movimientos");
  const body = start >= 0 ? text.slice(start) : text;

  const movimientos: MovParse[] = [];
  const re = /(\d{1,2}-[a-zA-Záéíóú]{3,}-\d{4})([\s\S]*?)(?=\d{1,2}-[a-zA-Záéíóú]{3,}-\d{4}|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const fecha = parseFecha(m[1]);
    const chunk = m[2];
    const amounts = [...chunk.matchAll(/\$([\d.,]+)/g)].map((a) => parseFloat(a[1].replace(/,/g, "")));
    if (amounts.length < 1 || !fecha) continue;
    const monto = amounts[0];
    const saldo = amounts.length > 1 ? amounts[amounts.length - 1] : null;
    const desc = chunk.replace(/\$[\d.,]+/g, "").replace(/\s+/g, " ").trim();
    if (!desc) continue;
    movimientos.push({
      fecha, descripcion: desc, monto, saldo,
      numeroCarro: extraerCarro(desc, empresaCodigo),
      nombre: extraerNombre(desc),
    });
  }
  return { titular, movimientos };
}

export type ResultadoConciliacion = {
  ok: boolean;
  error?: string;
  aviso?: string;
  empresa: string | null;
  total: number;
  aplicados: number;
  parciales: number;
  revisar: number;
  montoAplicado: number;
  detalle: {
    fecha: string | null;
    descripcion: string;
    monto: number;
    carro: string | null;
    via: "carro" | "nombre" | null;
    estado: string;
  }[];
};

const VACIO: ResultadoConciliacion = {
  ok: false, empresa: null, total: 0, aplicados: 0, parciales: 0, revisar: 0, montoAplicado: 0, detalle: [],
};

/** Procesa el PDF completo: parsea, concilia y persiste. */
export async function procesarExtractoPDF(
  buffer: Buffer,
  cargadoPor: string,
  empresaId: string,
): Promise<ResultadoConciliacion> {
  if (!empresaId) {
    return { ...VACIO, error: "Elige la empresa de este extracto." };
  }
  const sb = createServerSupabase();

  const emp = await sb.from("empresas").select("id, codigo, nombre").eq("id", empresaId).maybeSingle();
  const empresa = emp.data as { id: string; codigo: string; nombre: string } | null;
  if (!empresa) return { ...VACIO, error: "Esa empresa no existe." };

  const { titular, movimientos } = await parseExtracto(buffer, empresa.codigo);
  if (movimientos.length === 0) {
    return { ...VACIO, empresa: empresa.codigo, error: "No encontré movimientos en el PDF. ¿Es el de “Últimos movimientos” de Banco General?" };
  }

  // Contratos activos de la empresa con su carro, cliente y letra
  const { data: contratos } = await sb
    .from("contratos")
    .select("id, letra_diaria, vehiculo:vehiculos!inner(numero, empresa_id), cliente:clientes(nombre)")
    .eq("estado", "activo")
    .eq("vehiculo.empresa_id", empresaId);

  const porCarro = new Map<string, { contratoId: string; letra: number }>();
  const porNombre = new Map<string, { contratoId: string; letra: number }>();
  for (const c of (contratos ?? []) as unknown as {
    id: string; letra_diaria: number;
    vehiculo: { numero: string }; cliente: { nombre: string } | null;
  }[]) {
    porCarro.set(canonCarro(c.vehiculo.numero), { contratoId: c.id, letra: Number(c.letra_diaria) });
    if (c.cliente?.nombre) porNombre.set(canonNombre(c.cliente.nombre), { contratoId: c.id, letra: Number(c.letra_diaria) });
  }

  const { data: cuenta } = await sb
    .from("cuentas_bancarias")
    .select("id")
    .eq("empresa_id", empresa.id)
    .ilike("tipo", "AHORROS")
    .limit(1)
    .maybeSingle();

  let aviso: string | undefined;
  if (titular) {
    const tU = titular.toUpperCase();
    const delPdf = tU.includes("GOLD")
      ? "GOLD"
      : tU.includes("KOWUA")
        ? "KOWUA"
        : /LUJO|AUTO/.test(tU)
          ? "AUTOLUJO"
          : null;
    if (delPdf && delPdf !== empresa.codigo) {
      aviso = `El PDF parece de ${delPdf} (titular “${titular}”) y tú elegiste ${empresa.codigo}. Concilié contra los carros de ${empresa.codigo}.`;
    }
  }

  // Cabecera del extracto
  const fechaExtracto = movimientos.find((m) => m.fecha)?.fecha ?? hoyPanama();
  const { data: extracto } = await sb
    .from("extractos_bancarios")
    .insert({
      empresa_id: empresa.id,
      cuenta_bancaria_id: (cuenta as { id: string } | null)?.id ?? null,
      banco: "Banco General",
      fecha: fechaExtracto,
      cargado_por: cargadoPor,
    })
    .select("id").single();
  const extractoId = extracto!.id as string;

  const res: ResultadoConciliacion = {
    ok: true, aviso, empresa: empresa.codigo, total: movimientos.length,
    aplicados: 0, parciales: 0, revisar: 0, montoAplicado: 0, detalle: [],
  };

  for (const mov of movimientos) {
    let match: { contratoId: string; letra: number } | undefined;
    let via: "carro" | "nombre" | null = null;
    const carroKey = mov.numeroCarro ? canonCarro(mov.numeroCarro) : "";
    if (carroKey && porCarro.has(carroKey)) { match = porCarro.get(carroKey); via = "carro"; }
    else if (mov.nombre) {
      const nombreKey = canonNombre(mov.nombre);
      // match por nombre exacto o por inclusión (nombre del banco contiene el del cliente o viceversa)
      for (const [k, v] of porNombre) {
        if (k === nombreKey || k.includes(nombreKey) || nombreKey.includes(k)) { match = v; via = "nombre"; break; }
      }
    }

    let estado = "revisar";
    let pagoId: string | null = null;

    if (match) {
      // dedup: ¿hay un comprobante pendiente/manual del mismo contrato por monto similar?
      const { data: pend } = await sb
        .from("pagos").select("id, monto")
        .eq("contrato_id", match.contratoId)
        .in("estado_conciliacion", ["pendiente", "manual"]);
      const existente = (pend ?? []).find((p) => Math.abs(Number(p.monto) - mov.monto) < 0.5);
      if (existente) {
        await sb.from("pagos").update({ estado_conciliacion: "conciliado" }).eq("id", existente.id);
        pagoId = existente.id;
      } else {
        // El extracto solo trae fecha, no hora → se asume post-corte (sin descuento).
        const fechaMov = mov.fecha ?? hoyPanama();
        const pagadoAt = instantePanama(fechaMov, 19, 1).toISOString();
        const { data: nuevo } = await sb.from("pagos").insert({
          contrato_id: match.contratoId, fecha: fechaMov, pagado_at: pagadoAt, monto: mov.monto,
          banco: "Banco General", numero_carro: mov.numeroCarro,
          estado_conciliacion: "conciliado", origen: "extracto",
          notas: `Conciliado por extracto (${via}). Sin hora en extracto → asumido después de las 7 p.m.`,
        }).select("id").single();
        pagoId = nuevo?.id ?? null;
      }
      estado = mov.monto + 0.01 < match.letra ? "parcial" : "aplicado";
      if (estado === "parcial") res.parciales++; else res.aplicados++;
      res.montoAplicado += mov.monto;
    } else {
      res.revisar++;
    }

    await sb.from("movimientos_extracto").insert({
      extracto_id: extractoId, fecha: mov.fecha, monto: mov.monto,
      descripcion: mov.descripcion, numero_carro: mov.numeroCarro,
      nombre_detectado: mov.nombre, contrato_id: match?.contratoId ?? null,
      conciliado: !!match, pago_id: pagoId, estado,
    });

    res.detalle.push({ fecha: mov.fecha, descripcion: mov.descripcion, monto: mov.monto, carro: mov.numeroCarro, via, estado });
  }

  return res;
}
