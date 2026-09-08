// Conciliación por extracto bancario (Banco General).
// Acepta Excel de “Movimientos cuenta de ahorros” (formato operativo) o PDF
// de “Últimos movimientos”. Parsea → cruza → aplica solo cruce PERFECTO
// (ver lib/cartera/cruce.ts). El match por nombre solo sugiere.

import { unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";
import { createServerSupabase } from "@/lib/supabase/server";
import { hoyPanama, fechaContable, sumarDias } from "./fecha";
import { recalcularRecargo } from "./devengo";
import { aplicarPagoEnObligaciones } from "./aplicar-pago";
import { avisarPagoConciliado } from "./avisar-conciliacion";
import { destinoPorId } from "./salidas-interior";
import {
  canonCarro,
  canonReferencia,
  extraerCarro,
  extraerCarroCeldas,
  extraerNombre,
  extraerReferencia,
  decidirMovimiento,
  huellaMovimiento,
  type ContratoFlota,
  type PagoCandidato,
} from "./cruce";

const BUCKET = "comprobantes";

export type FormatoExtracto = "pdf" | "xlsx";

async function guardarArchivoExtracto(
  buffer: Buffer,
  empresaCodigo: string,
  fecha: string,
  formato: FormatoExtracto,
): Promise<string | null> {
  try {
    const sb = createServerSupabase();
    const ext = formato === "xlsx" ? "xlsx" : "pdf";
    const contentType =
      formato === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf";
    const path = `extractos/${empresaCodigo}/${fecha}-${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (error) {
      console.error("[extracto] no pude guardar el archivo:", error.message);
      return null;
    }
    return path;
  } catch (e) {
    console.error("[extracto] no pude guardar el archivo:", e);
    return null;
  }
}

/** Meses ES + EN (el Excel BG exporta `06-Aug-2026`; el PDF usa `6-sep-2026`). */
const MESES: Record<string, string> = {
  ene: "01", jan: "01",
  feb: "02",
  mar: "03",
  abr: "04", apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  ago: "08", aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dic: "12", dec: "12",
};

export function parseFechaExtracto(s: string): string | null {
  const m = /(\d{1,2})-([a-zA-Záéíóú]{3})[a-z]*-(\d{4})/i.exec(s.trim());
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase().slice(0, 3)];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[1].padStart(2, "0")}`;
}

function parseMoneyCell(s: string): number | null {
  const t = String(s ?? "").replace(/[$\s]/g, "").replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export { canonCarro, extraerCarro };

type MovParse = {
  fecha: string | null;
  descripcion: string;
  monto: number;
  saldo: number | null;
  numeroCarro: string | null;
  nombre: string | null;
  referencia: string | null;
};

function cellInlineText(cellXml: string): string {
  return [...cellXml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)]
    .map((m) => m[1])
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function celdasDeFila(rowXml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of rowXml.matchAll(/<c r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
    out[m[1]] = cellInlineText(m[2]);
  }
  return out;
}

/**
 * Excel JasperReports de Banco General:
 * “MOVIMIENTOS-CUENTA-DE-AHORROS-….xlsx”
 * Columnas: Fecha | Referencia | Ref1–4 | Transacción | Descripción | Débito | Crédito | Saldo.
 * Solo entran créditos (ingresos). Los débitos son traspasos internos.
 */
export function parseExtractoXlsx(
  buffer: Buffer,
  empresaCodigo: string,
): { titular: string; movimientos: MovParse[] } {
  const files = unzipSync(new Uint8Array(buffer));
  const sheetEntry =
    files["xl/worksheets/sheet1.xml"] ??
    Object.entries(files).find(([k]) => /xl\/worksheets\/sheet\d+\.xml$/i.test(k))?.[1];
  if (!sheetEntry) {
    throw new Error("El Excel no trae hoja de cálculo legible.");
  }
  const xml = new TextDecoder("utf-8").decode(sheetEntry);
  const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((m) => m[1]);

  let titular = "";
  let headerSeen = false;
  const movimientos: MovParse[] = [];

  for (const row of rows) {
    const c = celdasDeFila(row);
    const b = c.B ?? "";
    if (!titular) {
      const emp = /Empresa:\s*(.+)/i.exec(b);
      if (emp) titular = emp[1].trim();
    }
    if (!headerSeen) {
      if (b === "Fecha" && (c.D === "Referencia 1" || c.I === "Descripción" || c.K === "Crédito")) {
        headerSeen = true;
      }
      continue;
    }
    const fecha = parseFechaExtracto(b);
    if (!fecha) continue;
    const credito = parseMoneyCell(c.K ?? "");
    if (!(credito != null && credito > 0.009)) continue; // solo ingresos

    const desc = (c.I ?? "").trim();
    const ref1 = (c.D ?? "").trim();
    const ref2 = (c.E ?? "").trim();
    const saldo = parseMoneyCell(c.L ?? "");
    const memoUtil =
      ref2 && ref2.toUpperCase() !== "A TERCEROS" && !desc.toLowerCase().includes(ref2.toLowerCase())
        ? ref2
        : "";
    const descripcion = [desc, memoUtil].filter(Boolean).join(" · ").replace(/\s+/g, " ").trim()
      || ref1
      || "Movimiento";

    movimientos.push({
      fecha,
      descripcion,
      monto: credito,
      saldo,
      numeroCarro: extraerCarroCeldas(desc, ref2, empresaCodigo),
      nombre: extraerNombre(desc),
      referencia: canonReferencia(ref1) ?? extraerReferencia(descripcion),
    });
  }

  return { titular, movimientos };
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
    const fecha = parseFechaExtracto(m[1]);
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
      referencia: extraerReferencia(desc),
    });
  }
  return { titular, movimientos };
}

export function detectarFormatoExtracto(
  buffer: Buffer,
  nombreArchivo?: string | null,
): FormatoExtracto {
  const name = (nombreArchivo ?? "").toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".pdf")) return "pdf";
  // PK.. = zip/xlsx; %PDF = pdf
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return "xlsx";
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("utf8") === "%PDF") return "pdf";
  throw new Error("Formato no reconocido. Sube el Excel de movimientos o el PDF de Banco General.");
}

export async function parseExtractoArchivo(
  buffer: Buffer,
  empresaCodigo: string,
  formato: FormatoExtracto,
): Promise<{ titular: string; movimientos: MovParse[]; formato: FormatoExtracto }> {
  if (formato === "xlsx") {
    const r = parseExtractoXlsx(buffer, empresaCodigo);
    return { ...r, formato };
  }
  const r = await parseExtracto(buffer, empresaCodigo);
  return { ...r, formato };
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
  duplicados: number;
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
  ok: false, empresa: null, total: 0, aplicados: 0, parciales: 0, revisar: 0, duplicados: 0, montoAplicado: 0, detalle: [],
};

/** Procesa el extracto (Excel o PDF): parsea, concilia y persiste. */
export async function procesarExtracto(
  buffer: Buffer,
  cargadoPor: string,
  empresaId: string,
  nombreArchivo?: string | null,
): Promise<ResultadoConciliacion> {
  if (!empresaId) {
    return { ...VACIO, error: "Elige la empresa de este extracto." };
  }
  const sb = createServerSupabase();

  const emp = await sb.from("empresas").select("id, codigo, nombre").eq("id", empresaId).maybeSingle();
  const empresa = emp.data as { id: string; codigo: string; nombre: string } | null;
  if (!empresa) return { ...VACIO, error: "Esa empresa no existe." };

  let formato: FormatoExtracto;
  try {
    formato = detectarFormatoExtracto(buffer, nombreArchivo);
  } catch (e) {
    return { ...VACIO, empresa: empresa.codigo, error: e instanceof Error ? e.message : "Formato inválido." };
  }

  const { titular, movimientos } = await parseExtractoArchivo(buffer, empresa.codigo, formato);
  if (movimientos.length === 0) {
    return {
      ...VACIO,
      empresa: empresa.codigo,
      error:
        formato === "xlsx"
          ? "No encontré créditos en el Excel. ¿Es el de “Movimientos cuenta de ahorros” de Banco General?"
          : "No encontré movimientos en el PDF. ¿Es el de “Últimos movimientos” de Banco General?",
    };
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

  const { data: cuentas } = await sb
    .from("cuentas_bancarias")
    .select("id, numero_cuenta, tipo")
    .eq("empresa_id", empresa.id);
  const cuentasEmpresa = (cuentas ?? []) as { id: string; numero_cuenta: string | null; tipo: string | null }[];
  // Preferimos AHORROS para el FK del extracto; el match acepta cualquiera de la empresa.
  const cuentaRow =
    cuentasEmpresa.find((c) => /ahorro/i.test(c.tipo ?? "")) ?? cuentasEmpresa[0] ?? null;
  const numerosCuenta = cuentasEmpresa
    .map((c) => c.numero_cuenta)
    .filter((n): n is string => Boolean(n && n.trim()));

  let aviso: string | undefined;
  if (titular) {
    const tU = titular.toUpperCase();
    const delArchivo = tU.includes("GOLD")
      ? "GOLD"
      : tU.includes("KOWUA")
        ? "KOWUA"
        : /LUJO|AUTO/.test(tU)
          ? "AUTOLUJO"
          : null;
    if (delArchivo && delArchivo !== empresa.codigo) {
      aviso = `El archivo parece de ${delArchivo} (titular “${titular}”) y tú elegiste ${empresa.codigo}. No mezclo flotas: revisa que sea la cuenta correcta.`;
    }
  }

  const fechaExtracto = movimientos.find((m) => m.fecha)?.fecha ?? hoyPanama();
  const archivoUrl = await guardarArchivoExtracto(buffer, empresa.codigo, fechaExtracto, formato);
  const { data: extracto } = await sb
    .from("extractos_bancarios")
    .insert({
      empresa_id: empresa.id,
      cuenta_bancaria_id: cuentaRow?.id ?? null,
      banco: "Banco General",
      fecha: fechaExtracto,
      cargado_por: cargadoPor,
      archivo_url: archivoUrl,
    })
    .select("id").single();
  const extractoId = extracto!.id as string;

  let pagosQ = await sb
    .from("pagos")
    .select("id, contrato_id, monto, pagado_at, numero_carro, cuenta_destino, origen, estado_conciliacion, destino_interior, referencia")
    .eq("estado_conciliacion", "pendiente")
    .eq("origen", "comprobante");
  if (pagosQ.error && /destino_interior/i.test(pagosQ.error.message)) {
    pagosQ = (await sb
      .from("pagos")
      .select("id, contrato_id, monto, pagado_at, numero_carro, cuenta_destino, origen, estado_conciliacion, referencia")
      .eq("estado_conciliacion", "pendiente")
      .eq("origen", "comprobante")) as typeof pagosQ;
  }

  const pendientes: PagoCandidato[] = ((pagosQ.data ?? []) as {
    id: string;
    contrato_id: string | null;
    monto: number;
    pagado_at: string;
    numero_carro: string | null;
    cuenta_destino: string | null;
    origen: string | null;
    destino_interior?: string | null;
    referencia?: string | null;
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
      referencia: p.referencia ?? null,
      destinoInterior: p.destino_interior ?? null,
    }));

  const res: ResultadoConciliacion = {
    ok: true, aviso, empresa: empresa.codigo, total: movimientos.length,
    aplicados: 0, parciales: 0, revisar: 0, duplicados: 0, montoAplicado: 0, detalle: [],
  };

  // Movimientos ya vistos de esta empresa (misma huella → no re-encolar).
  const desde = sumarDias(hoyPanama(), -60);
  const { data: extractosPrev } = await sb
    .from("extractos_bancarios")
    .select("id")
    .eq("empresa_id", empresa.id)
    .gte("fecha", desde)
    .limit(200);
  const extractoIds = ((extractosPrev ?? []) as { id: string }[]).map((e) => e.id);
  const huellasVistas = new Set<string>();
  if (extractoIds.length > 0) {
    const { data: previosRaw } = await sb
      .from("movimientos_extracto")
      .select("fecha, monto, descripcion")
      .in("extracto_id", extractoIds);
    for (const row of (previosRaw ?? []) as {
      fecha: string | null;
      monto: number;
      descripcion: string | null;
    }[]) {
      huellasVistas.add(huellaMovimiento(row.fecha, Number(row.monto), row.descripcion ?? ""));
    }
  }

  const usados = new Set<string>();
  const porRecalcular = new Set<string>();
  const aplicarPagoIds: string[] = [];
  const fechasMov = new Set(movimientos.map((m) => m.fecha).filter((f): f is string => Boolean(f)));
  const ctxExtracto = {
    empresaId: empresa.id,
    numeroCuenta: cuentaRow?.numero_cuenta ?? null,
    numerosCuenta: numerosCuenta,
  };
  const huellasEnEsteArchivo = new Set<string>();

  for (const mov of movimientos) {
    const huella = huellaMovimiento(mov.fecha, mov.monto, mov.descripcion);
    if (huellasVistas.has(huella) || huellasEnEsteArchivo.has(huella)) {
      res.duplicados++;
      res.detalle.push({
        fecha: mov.fecha,
        descripcion: mov.descripcion,
        monto: mov.monto,
        carro: mov.numeroCarro,
        via: null,
        estado: "duplicado",
        motivo: "Ya estaba en un extracto anterior (o repetido en este archivo). No lo re-encolo.",
      });
      continue;
    }
    huellasEnEsteArchivo.add(huella);

    const libres = pendientes.filter((p) => !usados.has(p.id));
    const veredicto = decidirMovimiento(
      {
        monto: mov.monto,
        fecha: mov.fecha,
        numeroCarro: mov.numeroCarro,
        nombre: mov.nombre,
        referencia: mov.referencia,
      },
      libres,
      flota,
      ctxExtracto,
    );

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
        estado = pago.destinoInterior || mov.monto + 0.01 >= contrato.letra ? "aplicado" : "parcial";
        const destNom = pago.destinoInterior ? destinoPorId(pago.destinoInterior)?.nombre ?? pago.destinoInterior : null;
        motivo = destNom
          ? `Cruce perfecto de salida a ${destNom}: ancla (carro/ref), monto, fecha y empresa.`
          : "Cruce perfecto: ancla (carro y/o referencia exacta), monto, fecha y empresa.";
        if (estado === "parcial") res.parciales++; else res.aplicados++;
        res.montoAplicado += mov.monto;
        porRecalcular.add(`${contrato.contratoId}|${fechaContable(pago.pagadoAt)}`);
        aplicarPagoIds.push(pago.id);
      }
    } else if (veredicto.tipo === "ambiguo") {
      const ids = veredicto.pagos.map((p) => p.id).join(",");
      motivo = `${veredicto.motivo} [ids:${ids}]`;
      via = "carro";
      contratoId = null;
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
      referencia: mov.referencia,
      numero_carro: mov.numeroCarro,
      nombre_detectado: mov.nombre,
      contrato_id: contratoId,
      conciliado,
      pago_id: pagoId,
      estado,
      motivo,
      via,
    };
    const ins = await sb.from("movimientos_extracto").insert(fila).select("id").maybeSingle();
    let movId = (ins.data as { id: string } | null)?.id ?? null;
    if (ins.error && /motivo|via/i.test(ins.error.message)) {
      delete fila.motivo;
      delete fila.via;
      const retry = await sb.from("movimientos_extracto").insert(fila).select("id").maybeSingle();
      movId = (retry.data as { id: string } | null)?.id ?? null;
    } else if (ins.error) {
      console.error("[extracto] insert movimiento", ins.error.message);
    }

    if (pagoId && movId) {
      await sb.from("pagos").update({ movimiento_extracto_id: movId }).eq("id", pagoId);
    }

    // Para no re-detectar esta misma línea si el insert falló a medias, igual marcamos vista.
    huellasVistas.add(huella);

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
      const aplicado = await aplicarPagoEnObligaciones(id);
      try {
        await avisarPagoConciliado(id, aplicado);
      } catch (e) {
        console.error("[extracto] aviso WA", id, e);
      }
    } catch (e) {
      console.error("[extracto] no pude aplicar el waterfall de", id, e);
    }
  }

  // Comprobantes de días que SÍ vinieron en este archivo y no calzaron: el recargo
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

/** @deprecated Usar procesarExtracto. */
export async function procesarExtractoPDF(
  buffer: Buffer,
  cargadoPor: string,
  empresaId: string,
): Promise<ResultadoConciliacion> {
  return procesarExtracto(buffer, cargadoPor, empresaId, "extracto.pdf");
}
