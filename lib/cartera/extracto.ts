// Conciliación por extracto bancario (Banco General).
// Sube el PDF → parsea movimientos → cruza contra comprobantes pendientes.
// Solo aplica dinero con cruce PERFECTO (ver lib/cartera/cruce.ts).
// El match por nombre solo sugiere; no crea ni concilia un pago.

import { extractText, getDocumentProxy } from "unpdf";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, fechaContable, sumarDias } from "./fecha";
import { recalcularRecargo } from "./devengo";
import { aplicarPagoEnObligaciones } from "./aplicar-pago";
import {
  canonCarro,
  extraerCarro,
  extraerNombre,
  decidirMovimiento,
  type ContratoFlota,
  type PagoCandidato,
} from "./cruce";

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

export { canonCarro, extraerCarro };

type MovParse = {
  fecha: string | null;
  descripcion: string;
  monto: number;
  saldo: number | null;
  numeroCarro: string | null;
  nombre: string | null;
};

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
    via: "perfecto" | "carro" | "nombre" | null;
    estado: string;
    motivo: string | null;
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

  const { data: contratos } = await sb
    .from("contratos")
    .select("id, letra_diaria, vehiculo:vehiculos!inner(numero, empresa_id), cliente:clientes(nombre)")
    .eq("estado", "activo")
    .eq("vehiculo.empresa_id", empresaId);

  const flota: ContratoFlota[] = ((contratos ?? []) as unknown as {
    id: string; letra_diaria: number;
    vehiculo: { numero: string; empresa_id: string };
    cliente: { nombre: string } | null;
  }[]).map((c) => ({
    contratoId: c.id,
    letra: Number(c.letra_diaria),
    numero: c.vehiculo.numero,
    clienteNombre: c.cliente?.nombre ?? null,
    empresaId: c.vehiculo.empresa_id,
  }));
  const contratoIds = new Set(flota.map((c) => c.contratoId));

  const { data: cuenta } = await sb
    .from("cuentas_bancarias")
    .select("id, numero_cuenta")
    .eq("empresa_id", empresa.id)
    .ilike("tipo", "AHORROS")
    .limit(1)
    .maybeSingle();
  const cuentaRow = cuenta as { id: string; numero_cuenta: string | null } | null;

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
      aviso = `El PDF parece de ${delPdf} (titular “${titular}”) y tú elegiste ${empresa.codigo}. No mezclo flotas: revisa que sea la cuenta correcta.`;
    }
  }

  const fechaExtracto = movimientos.find((m) => m.fecha)?.fecha ?? hoyPanama();
  const { data: extracto } = await sb
    .from("extractos_bancarios")
    .insert({
      empresa_id: empresa.id,
      cuenta_bancaria_id: cuentaRow?.id ?? null,
      banco: "Banco General",
      fecha: fechaExtracto,
      cargado_por: cargadoPor,
    })
    .select("id").single();
  const extractoId = extracto!.id as string;

  const { data: pagosRaw } = await sb
    .from("pagos")
    .select("id, contrato_id, monto, pagado_at, numero_carro, cuenta_destino, origen, estado_conciliacion")
    .eq("estado_conciliacion", "pendiente")
    .eq("origen", "comprobante");

  const pendientes: PagoCandidato[] = ((pagosRaw ?? []) as {
    id: string;
    contrato_id: string | null;
    monto: number;
    pagado_at: string;
    numero_carro: string | null;
    cuenta_destino: string | null;
    origen: string | null;
  }[])
    .filter((p) => {
      if (p.contrato_id && contratoIds.has(p.contrato_id)) return true;
      if (p.numero_carro && flota.some((c) => canonCarro(c.numero) === canonCarro(p.numero_carro!))) return true;
      return false;
    })
    .map((p) => ({
      id: p.id,
      contratoId: p.contrato_id,
      empresaId,
      monto: Number(p.monto),
      pagadoAt: p.pagado_at,
      numeroCarro: p.numero_carro,
      cuentaDestino: p.cuenta_destino,
      origen: p.origen,
    }));

  const res: ResultadoConciliacion = {
    ok: true, aviso, empresa: empresa.codigo, total: movimientos.length,
    aplicados: 0, parciales: 0, revisar: 0, montoAplicado: 0, detalle: [],
  };

  const usados = new Set<string>();
  const porRecalcular = new Set<string>();
  const aplicarPagoIds: string[] = [];
  const fechasMov = new Set(movimientos.map((m) => m.fecha).filter((f): f is string => Boolean(f)));
  const ctxExtracto = { empresaId: empresa.id, numeroCuenta: cuentaRow?.numero_cuenta ?? null };

  for (const mov of movimientos) {
    const libres = pendientes.filter((p) => !usados.has(p.id));
    const veredicto = decidirMovimiento(mov, libres, flota, ctxExtracto);

    let estado = "revisar";
    let pagoId: string | null = null;
    let contratoId: string | null = null;
    let via: ResultadoConciliacion["detalle"][0]["via"] = null;
    let motivo: string | null = null;
    let conciliado = false;

    if (veredicto.tipo === "perfecto") {
      const { pago, contrato } = veredicto;
      usados.add(pago.id);
      contratoId = contrato.contratoId;
      via = "perfecto";
      const { error } = await sb
        .from("pagos")
        .update({
          estado_conciliacion: "conciliado",
          contrato_id: contrato.contratoId,
        })
        .eq("id", pago.id);
      if (error) {
        motivo = `Calzó, pero no pude marcar el pago: ${error.message}`;
        res.revisar++;
      } else {
        pagoId = pago.id;
        conciliado = true;
        estado = mov.monto + 0.01 < contrato.letra ? "parcial" : "aplicado";
        motivo = "Cruce perfecto: carro, monto, fecha y empresa.";
        if (estado === "parcial") res.parciales++; else res.aplicados++;
        res.montoAplicado += mov.monto;
        porRecalcular.add(`${contrato.contratoId}|${fechaContable(pago.pagadoAt)}`);
        aplicarPagoIds.push(pago.id);
      }
    } else if (veredicto.tipo === "ambiguo") {
      motivo = veredicto.motivo;
      res.revisar++;
    } else {
      motivo = veredicto.motivo;
      contratoId = veredicto.sugerido?.contratoId ?? null;
      via = veredicto.via;
      res.revisar++;
    }

    const fila: Record<string, unknown> = {
      extracto_id: extractoId,
      fecha: mov.fecha,
      monto: mov.monto,
      descripcion: mov.descripcion,
      numero_carro: mov.numeroCarro,
      nombre_detectado: mov.nombre,
      contrato_id: contratoId,
      conciliado,
      pago_id: pagoId,
      estado,
      motivo,
      via,
    };
    const { error: errMov } = await sb.from("movimientos_extracto").insert(fila);
    if (errMov && /motivo|via/i.test(errMov.message)) {
      // Migración 0013 aún no corrida: guardamos sin las columnas nuevas.
      delete fila.motivo;
      delete fila.via;
      await sb.from("movimientos_extracto").insert(fila);
    }

    res.detalle.push({
      fecha: mov.fecha,
      descripcion: mov.descripcion,
      monto: mov.monto,
      carro: mov.numeroCarro,
      via,
      estado,
      motivo,
    });
  }

  for (const clave of porRecalcular) {
    const [contratoId, fecha] = clave.split("|");
    try {
      await recalcularRecargo(contratoId, fecha);
    } catch (e) {
      console.error("[extracto] no pude recalcular el recargo de", clave, e);
    }
  }

  for (const id of aplicarPagoIds) {
    try {
      await aplicarPagoEnObligaciones(id);
    } catch (e) {
      console.error("[extracto] no pude aplicar el waterfall de", id, e);
    }
  }

  // Comprobantes de días que SÍ vinieron en este PDF y no calzaron: el recargo
  // diferido se revisa. Si la gracia venció, entra; si el pago era bueno y el
  // banco no lo trajo, el equipo lo ve en "por revisar".
  for (const p of pendientes) {
    if (usados.has(p.id) || !p.contratoId) continue;
    const dia = fechaContable(p.pagadoAt);
    const cubierto = fechasMov.has(dia) || fechasMov.has(sumarDias(dia, 1));
    if (!cubierto) continue;
    try {
      await recalcularRecargo(p.contratoId, dia);
    } catch (e) {
      console.error("[extracto] no pude recalcular recargo de pendiente", p.id, e);
    }
  }

  return res;
}
