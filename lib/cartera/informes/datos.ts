// Datos vivos para INFORMES.xlsx (misma estructura de pestañas).

import { createServerSupabase } from "@/lib/supabase/server";
import {
  diaSemana,
  diasHabilesEnRango,
  finMes,
  inicioMes,
  sumarDias,
} from "../fecha";
import {
  empresaInforme,
  fechaInformeCartera,
  partirPago,
  tramosDeEventos,
  type PagoInforme,
} from "../informe-mes";
import { metaCobranzaDeMes } from "../metas-cobranza";
import { etiquetaSucursal } from "../sucursal";

export type FilaRecaudo = {
  etiqueta: string;
  cuentas: number;
  abonos: number;
  acuerdos: number;
  mantenimientos: number;
  panapassMultas: number;
  otras: number;
  efectivo: number;
  banco: number;
};

export type FilaImproductivo = {
  fecha: string;
  carro: string;
  valorCuota: number;
  condicion: string;
  anio: number | null;
  dias: number;
};

export type FilaNoPago = {
  carro: string;
  cliente: string;
  cuotaDiaria: number;
  deudaCuota: number;
  deudaAcuerdos: number;
  otrasMultas: number;
};

export type FilaLetra = {
  empresa: "AL" | "KW" | "GOLD";
  letra: number;
  cantidad: number;
};

export type MovimientoSede = {
  fecha: string;
  tipo: "entrega" | "devolucion";
  sede: "PANAMA" | "CHORRERA" | null;
};

export type BloqueNoche = {
  empresa: "AL" | "KW" | "GOLD";
  cantidad: number;
  valor: number;
};

export type MesMovimiento = {
  mesIni: string;
  mesNombre: string;
  /** Día 27 del mes (corte del cuadro histórico), o fin de mes si es más corto. */
  corte27: string;
  entregasPanama: number;
  entregasChorrera: number;
  devoluciones: number;
};

export type DatosInformes = {
  desde: string;
  hasta: string;
  mesIni: string;
  mesFin: string;
  mesNombre: string;
  diasMesCalendario: number;
  recaudo: FilaRecaudo[];
  improductivos: FilaImproductivo[];
  movimientos: MovimientoSede[];
  historicoMeses: MesMovimiento[];
  noPagos: FilaNoPago[];
  meta: {
    mes: string;
    diasLaborados: number;
    diasMes: number;
    meta100: number | null;
    meta95: number | null;
    acumuladoReal: number;
    flota: number;
  };
  letras: FilaLetra[];
  noche: {
    fecha: string;
    noPago: BloqueNoche[];
    alDia: BloqueNoche[];
    improductivos: BloqueNoche[];
    recaudo: BloqueNoche[];
  };
};

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function lineas(raw: unknown): { tipo: string; aplicado: number }[] | null {
  if (!raw) return null;
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (Array.isArray(o)) return o as { tipo: string; aplicado: number }[];
  if (o && typeof o === "object" && Array.isArray((o as { asignaciones?: unknown }).asignaciones)) {
    return (o as { asignaciones: { tipo: string; aplicado: number }[] }).asignaciones;
  }
  return null;
}

async function paginas<T>(
  leer: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  const tam = 1000;
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await leer(desde, desde + tam - 1);
    if (error) throw new Error(error.message);
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < tam) break;
  }
  return out;
}

function filaRecaudoVacia(etiqueta: string): FilaRecaudo {
  return {
    etiqueta,
    cuentas: 0,
    abonos: 0,
    acuerdos: 0,
    mantenimientos: 0,
    panapassMultas: 0,
    otras: 0,
    efectivo: 0,
    banco: 0,
  };
}

function empresaRecaudo(codigo: string | null | undefined): "AUTOLUJO" | "KOWUA" | "GOLD" | null {
  const e = empresaInforme(codigo);
  if (e === "AUTOLUJO") return "AUTOLUJO";
  if (e === "KW") return "KOWUA";
  if (e === "GOLD") return "GOLD";
  return null;
}

function empresaCorta(codigo: string | null | undefined): "AL" | "KW" | "GOLD" | null {
  const e = empresaInforme(codigo);
  if (e === "AUTOLUJO") return "AL";
  if (e === "KW") return "KW";
  if (e === "GOLD") return "GOLD";
  return null;
}

function sedeDeLugar(lugar: string | null | undefined): "PANAMA" | "CHORRERA" | null {
  const n = etiquetaSucursal(lugar);
  if (/chorrera/i.test(n)) return "CHORRERA";
  if (/juan|díaz|diaz|panam/i.test(n)) return "PANAMA";
  return null;
}

function condicionDe(etiqueta: string | null | undefined, estado: string | null | undefined): string | null {
  const e = (etiqueta ?? "").toUpperCase();
  if (e === "CHAPISTERIA") return "CHAPISTERIA";
  if (e === "MECANICA" || e === "COLISION" || e === "GRUA") return "MECANICA";
  if (e === "X ENTREGAR") return "X ENTREGAR";
  if (e === "ALISTAMIENTO") return "ALISTAMIENTO";
  if (e === "ALMACENAMIENTO" || e === "OTROS") return "ALMACENAMIENTO";
  const est = (estado ?? "").toLowerCase();
  if (est === "chapisteria") return "CHAPISTERIA";
  if (est === "mantenimiento" || est === "mecanica" || est === "colision" || est === "grua") return "MECANICA";
  if (est === "por_entregar") return "X ENTREGAR";
  if (est === "improductivo") return "ALMACENAMIENTO";
  return null;
}

function sumarPagoAFila(fila: FilaRecaudo, pago: PagoInforme) {
  const parte = partirPago(pago);
  fila.cuentas = r2(fila.cuentas + parte.pagos.Cuota);
  fila.abonos = r2(
    fila.abonos + parte.pagos["Abono inicial financiado"] + parte.pagos["Gastos Administrativos"],
  );
  fila.acuerdos = r2(fila.acuerdos + parte.pagos["Acuerdo de pago reparaciones"]);
  fila.mantenimientos = r2(fila.mantenimientos + parte.pagos.Mantenimiento);
  fila.panapassMultas = r2(
    fila.panapassMultas + parte.pagos.Panapass + parte.pagos["Multas X Pagar tarde $5"],
  );
  fila.otras = r2(
    fila.otras + parte.pagos["Exceso Km"] + parte.pagos["Seguro menor de edad"] + parte.pagos.Otras,
  );
  fila.efectivo = r2(fila.efectivo + parte.efect);
  fila.banco = r2(fila.banco + parte.general);
}

export async function cargarDatosInformes(desde: string, hasta: string): Promise<DatosInformes> {
  const sb = createServerSupabase();
  const mesIni = inicioMes(hasta);
  const mesFin = finMes(hasta);
  const mesNombre = MESES[Number(hasta.slice(5, 7)) - 1] ?? hasta.slice(0, 7);

  const tope = sumarDias(hasta, 1);
  const pagosRaw = await paginas<Record<string, unknown>>((a, b) =>
    sb
      .from("pagos")
      .select(
        "contrato_id, fecha, pagado_at, monto, metodo, notas, rubro, asignaciones, estado_conciliacion, contrato:contratos(estado, empresa:empresas(codigo), vehiculo:vehiculos(numero, anio, estado, empresa:empresas(codigo)), cliente:clientes(nombre), letra_diaria)",
      )
      .in("estado_conciliacion", ["conciliado", "manual"])
      .gte("fecha", desde)
      .lte("fecha", tope)
      .range(a, b),
  );

  const pagos: {
    pago: PagoInforme;
    empresa: ReturnType<typeof empresaRecaudo>;
    empresaCorta: ReturnType<typeof empresaCorta>;
    contratoEstado: string;
  }[] = [];

  for (const row of pagosRaw) {
    if (!row.contrato_id) continue;
    const pagadoAt = (row.pagado_at as string | null) ?? null;
    const pago: PagoInforme = {
      contratoId: String(row.contrato_id),
      fecha: fechaInformeCartera(pagadoAt, String(row.fecha).slice(0, 10)),
      pagadoAt,
      monto: Number(row.monto) || 0,
      metodo: (row.metodo as string | null) ?? null,
      notas: (row.notas as string | null) ?? null,
      rubro: (row.rubro as string | null) ?? null,
      asignaciones: lineas(row.asignaciones),
    };
    if (pago.fecha < desde || pago.fecha > hasta) continue;
    const con = uno(row.contrato as {
      estado?: string;
      empresa?: { codigo?: string } | { codigo?: string }[] | null;
      vehiculo?: { empresa?: { codigo?: string } | { codigo?: string }[] | null } | null;
    } | null);
    const emp =
      empresaRecaudo(uno(con?.empresa)?.codigo ?? uno(uno(con?.vehiculo)?.empresa)?.codigo ?? null);
    const corta =
      empresaCorta(uno(con?.empresa)?.codigo ?? uno(uno(con?.vehiculo)?.empresa)?.codigo ?? null);
    pagos.push({
      pago,
      empresa: emp,
      empresaCorta: corta,
      contratoEstado: String(con?.estado ?? "activo"),
    });
  }

  const porEmpresa = new Map<string, FilaRecaudo>([
    ["AUTOLUJO", filaRecaudoVacia("AUTOLUJO")],
    ["KOWUA", filaRecaudoVacia("KOWUA")],
    ["GOLD", filaRecaudoVacia("GOLD")],
  ]);
  const ex = new Map<string, FilaRecaudo>([
    ["EXCLIENTE AL", filaRecaudoVacia("EXCLIENTE AL")],
    ["EXCLIENTE KW", filaRecaudoVacia("EXCLIENTE KW")],
    ["EXCLIENTE GD", filaRecaudoVacia("EXCLIENTE GD")],
  ]);
  const recargos = filaRecaudoVacia("RECARGOS FINANCIEROS");

  for (const item of pagos) {
    const cerrado = item.contratoEstado !== "activo";
    if (cerrado && item.empresaCorta) {
      const clave =
        item.empresaCorta === "AL"
          ? "EXCLIENTE AL"
          : item.empresaCorta === "KW"
            ? "EXCLIENTE KW"
            : "EXCLIENTE GD";
      // En el Excel de contabilidad el ex cliente solo suma en acuerdos + forma de pago.
      const fila = ex.get(clave)!;
      const parte = partirPago(item.pago);
      fila.acuerdos = r2(fila.acuerdos + item.pago.monto);
      fila.efectivo = r2(fila.efectivo + parte.efect);
      fila.banco = r2(fila.banco + parte.general);
      continue;
    }
    // Rubro / concepto “recargo financiero” (si aparece) va a esa fila.
    const tipos = (item.pago.asignaciones ?? []).map((a) => a.tipo.toLowerCase());
    const esRecargoFin =
      /recargo\s*financ/i.test(item.pago.notas ?? "") ||
      /recargo\s*financ/i.test(item.pago.rubro ?? "") ||
      tipos.some((t) => /recargo_financ|financiero/.test(t));
    if (esRecargoFin) {
      sumarPagoAFila(recargos, item.pago);
      continue;
    }
    if (!item.empresa) continue;
    sumarPagoAFila(porEmpresa.get(item.empresa)!, item.pago);
  }

  const recaudo = [
    porEmpresa.get("AUTOLUJO")!,
    porEmpresa.get("KOWUA")!,
    porEmpresa.get("GOLD")!,
    recargos,
    ex.get("EXCLIENTE AL")!,
    ex.get("EXCLIENTE KW")!,
    ex.get("EXCLIENTE GD")!,
  ];

  // —— Improductivos día a día ——
  const vehs = await paginas<{
    id: string;
    numero: string;
    anio: number | null;
    estado: string;
    empresa: { codigo: string } | { codigo: string }[] | null;
    contratos: { id: string; estado: string; fecha_inicio: string | null; letra_diaria: number | null }[] | null;
  }>((a, b) =>
    sb
      .from("vehiculos")
      .select(
        "id, numero, anio, estado, empresa:empresas(codigo), contratos(id, estado, fecha_inicio, letra_diaria)",
      )
      .range(a, b),
  );

  const eventos = await paginas<{
    vehiculo_id: string;
    fecha: string;
    detalle: string;
    created_at: string;
  }>((a, b) =>
    sb
      .from("vehiculo_eventos")
      .select("vehiculo_id, fecha, detalle, created_at")
      .or(
        "detalle.like.pausa-productiva:%,detalle.like.inactivo:%,detalle.like.caso-archivado:%,detalle.eq.retorno-productivo,detalle.eq.inactivo-anulado",
      )
      .range(a, b),
  );
  const porVeh = new Map<string, { fecha: string; detalle: string; created_at?: string }[]>();
  for (const ev of eventos) {
    const lista = porVeh.get(ev.vehiculo_id) ?? [];
    lista.push({ fecha: ev.fecha, detalle: ev.detalle, created_at: ev.created_at });
    porVeh.set(ev.vehiculo_id, lista);
  }

  const improductivos: FilaImproductivo[] = [];
  for (const v of vehs) {
    const contratos = v.contratos ?? [];
    const activo = contratos.find((c) => c.estado === "activo");
    const elegido =
      activo ??
      [...contratos].sort((a, b) => String(b.fecha_inicio ?? "").localeCompare(String(a.fecha_inicio ?? "")))[0];
    if (!elegido) continue;
    const tramos = tramosDeEventos(porVeh.get(v.id) ?? [], v.estado, elegido.id);
    const letra = Number(elegido.letra_diaria) || 0;
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
      const tramo = tramos.find((t) => t.desde <= d && (!t.hasta || t.hasta > d));
      const cond = tramo
        ? condicionDe(tramo.etiqueta, null)
        : v.estado === "activo"
          ? null
          : condicionDe(null, v.estado);
      if (!cond) continue;
      improductivos.push({
        fecha: d,
        carro: String(v.numero ?? "").trim() || "—",
        valorCuota: letra,
        condicion: cond,
        anio: v.anio == null ? null : Number(v.anio),
        dias: 1,
      });
    }
  }
  improductivos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.carro.localeCompare(b.carro));

  // —— Entregas / devoluciones (mes actual + 3 meses atrás para el histórico) ——
  const histDesde = inicioMes(sumarDias(mesIni, -100));
  const histHasta = hasta < mesFin ? hasta : mesFin;
  const contratosMes = await paginas<{
    fecha_inicio: string;
    vehiculo_id: string;
  }>((a, b) =>
    sb
      .from("contratos")
      .select("fecha_inicio, vehiculo_id")
      .gte("fecha_inicio", histDesde)
      .lte("fecha_inicio", histHasta)
      .range(a, b),
  );
  const eventosMov = await paginas<{
    fecha: string;
    tipo: string;
    lugar: string | null;
    vehiculo_id: string;
    titulo: string | null;
  }>((a, b) =>
    sb
      .from("vehiculo_eventos")
      .select("fecha, tipo, lugar, vehiculo_id, titulo")
      .in("tipo", ["contrato", "devolucion"])
      .gte("fecha", histDesde)
      .lte("fecha", histHasta)
      .range(a, b),
  );
  const lugarEntrega = new Map<string, string | null>();
  const movimientos: MovimientoSede[] = [];
  for (const ev of eventosMov) {
    if (ev.tipo === "contrato" || /entrega/i.test(ev.titulo ?? "")) {
      lugarEntrega.set(`${ev.vehiculo_id}|${ev.fecha.slice(0, 10)}`, ev.lugar);
      continue;
    }
    if (ev.tipo === "devolucion" || /devol/i.test(ev.titulo ?? "")) {
      movimientos.push({
        fecha: ev.fecha.slice(0, 10),
        tipo: "devolucion",
        sede: sedeDeLugar(ev.lugar),
      });
    }
  }
  for (const c of contratosMes) {
    const fecha = String(c.fecha_inicio).slice(0, 10);
    if (fecha > histHasta) continue;
    movimientos.push({
      fecha,
      tipo: "entrega",
      sede: sedeDeLugar(lugarEntrega.get(`${c.vehiculo_id}|${fecha}`)),
    });
  }

  const historicoMeses: MesMovimiento[] = [];
  for (let i = 3; i >= 0; i--) {
    const y = Number(mesIni.slice(0, 4));
    const m = Number(mesIni.slice(5, 7)) - 1 - i;
    const dt = new Date(Date.UTC(y, m, 1));
    const mi = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const mf = finMes(mi);
    const corte27 = `${mi.slice(0, 8)}27`;
    const corte = corte27 <= mf ? corte27 : mf;
    const tope = mi === mesIni ? (hasta < corte ? hasta : corte) : corte;
    let ep = 0;
    let ec = 0;
    let dev = 0;
    for (const mov of movimientos) {
      if (mov.fecha < mi || mov.fecha > tope) continue;
      if (mov.tipo === "entrega") {
        if (mov.sede === "PANAMA") ep += 1;
        else if (mov.sede === "CHORRERA") ec += 1;
      } else {
        dev += 1;
      }
    }
    historicoMeses.push({
      mesIni: mi,
      mesNombre: MESES[Number(mi.slice(5, 7)) - 1] ?? mi,
      corte27: tope,
      entregasPanama: ep,
      entregasChorrera: ec,
      devoluciones: dev,
    });
  }

  // —— No pagos (corte = hasta) ——
  const activos = await paginas<{
    id: string;
    letra_diaria: number | null;
    cliente: { nombre: string } | { nombre: string }[] | null;
    vehiculo: { numero: string; estado: string } | { numero: string; estado: string }[] | null;
  }>((a, b) =>
    sb
      .from("contratos")
      .select("id, letra_diaria, cliente:clientes(nombre), vehiculo:vehiculos(numero, estado)")
      .eq("estado", "activo")
      .range(a, b),
  );
  const idsActivos = activos.map((c) => c.id);
  const saldoMap = new Map<string, number>();
  const acuerdoMap = new Map<string, number>();
  const multaMap = new Map<string, number>();
  for (let i = 0; i < idsActivos.length; i += 80) {
    const lote = idsActivos.slice(i, i + 80);
    const [saldos, acuerdos, multas] = await Promise.all([
      sb.from("vw_saldo_contrato").select("contrato_id, saldo_actual").in("contrato_id", lote),
      sb.from("acuerdos").select("contrato_id, saldo").eq("activo", true).in("contrato_id", lote),
      sb
        .from("cargos")
        .select("contrato_id, monto, tipo, concepto")
        .in("contrato_id", lote)
        .in("tipo", ["multa", "recargo", "otras"]),
    ]);
    for (const s of (saldos.data ?? []) as { contrato_id: string; saldo_actual: number }[]) {
      saldoMap.set(s.contrato_id, Number(s.saldo_actual) || 0);
    }
    for (const a of (acuerdos.data ?? []) as { contrato_id: string; saldo: number }[]) {
      acuerdoMap.set(a.contrato_id, r2((acuerdoMap.get(a.contrato_id) ?? 0) + (Number(a.saldo) || 0)));
    }
    for (const m of (multas.data ?? []) as {
      contrato_id: string;
      monto: number;
      tipo: string;
      concepto: string | null;
    }[]) {
      const et = `${m.tipo} ${m.concepto ?? ""}`.toLowerCase();
      if (!/multa|recargo|tarde|panapass|menor|exceso/.test(et)) continue;
      if (/acuerdo|abono|renta|letra|domingo/.test(et) && !/multa|recargo|tarde/.test(et)) continue;
      multaMap.set(m.contrato_id, r2((multaMap.get(m.contrato_id) ?? 0) + (Number(m.monto) || 0)));
    }
  }

  const pagosHoy = new Set(
    pagos.filter((p) => p.pago.fecha === hasta && p.contratoEstado === "activo").map((p) => p.pago.contratoId),
  );

  const noPagos: FilaNoPago[] = [];
  for (const c of activos) {
    const veh = uno(c.vehiculo);
    if (!veh || veh.estado !== "activo") continue;
    if (pagosHoy.has(c.id)) continue;
    const saldo = saldoMap.get(c.id) ?? 0;
    const acuerdos = acuerdoMap.get(c.id) ?? 0;
    const otras = multaMap.get(c.id) ?? 0;
    // Deuda de cuota ≈ saldo letra (saldo vista menos acuerdos abiertos), sin inventar.
    const deudaCuota = r2(Math.max(saldo - acuerdos, 0));
    if (deudaCuota <= 0.009 && acuerdos <= 0.009 && otras <= 0.009) continue;
    noPagos.push({
      carro: String(veh.numero ?? "").trim() || "—",
      cliente: String(uno(c.cliente)?.nombre ?? "").trim() || "—",
      cuotaDiaria: Number(c.letra_diaria) || 0,
      deudaCuota,
      deudaAcuerdos: acuerdos,
      otrasMultas: otras,
    });
  }
  noPagos.sort((a, b) => a.carro.localeCompare(b.carro, undefined, { numeric: true }));

  // —— Letras reales ——
  const letrasCorr = new Map<string, FilaLetra>();
  for (const v of vehs) {
    const emp = empresaCorta(uno(v.empresa)?.codigo ?? null);
    if (!emp) continue;
    const activoC = (v.contratos ?? []).find((c) => c.estado === "activo");
    if (!activoC || v.estado !== "activo") continue;
    const letra = Number(activoC.letra_diaria) || 0;
    if (letra <= 0) continue;
    const clave = `${emp}|${letra}`;
    const cur = letrasCorr.get(clave) ?? { empresa: emp, letra, cantidad: 0 };
    cur.cantidad += 1;
    letrasCorr.set(clave, cur);
  }
  const letras = [...letrasCorr.values()].sort(
    (a, b) => a.empresa.localeCompare(b.empresa) || a.letra - b.letra,
  );

  // —— Meta ——
  const metaRow = await metaCobranzaDeMes(hasta);
  const diasMes = diasHabilesEnRango(mesIni, mesFin);
  const diasLaborados = diasHabilesEnRango(mesIni, hasta);
  const acumuladoReal = r2(
    pagos.filter((p) => p.pago.fecha >= mesIni && p.pago.fecha <= hasta).reduce((s, p) => s + p.pago.monto, 0),
  );
  const flota = vehs.filter((v) => v.estado === "activo").length;
  const meta100 = metaRow?.meta100 ?? null;

  // —— Informe noche (corte = hasta) ——
  const nocheEmp: ("AL" | "KW" | "GOLD")[] = ["AL", "KW", "GOLD"];
  const noPagoN: Record<string, BloqueNoche> = Object.fromEntries(
    nocheEmp.map((e) => [e, { empresa: e, cantidad: 0, valor: 0 }]),
  );
  const alDiaN: Record<string, BloqueNoche> = Object.fromEntries(
    nocheEmp.map((e) => [e, { empresa: e, cantidad: 0, valor: 0 }]),
  );
  const improN: Record<string, BloqueNoche> = Object.fromEntries(
    nocheEmp.map((e) => [e, { empresa: e, cantidad: 0, valor: 0 }]),
  );
  const recaudoN: Record<string, BloqueNoche> = Object.fromEntries(
    nocheEmp.map((e) => [e, { empresa: e, cantidad: 0, valor: 0 }]),
  );

  for (const v of vehs) {
    const emp = empresaCorta(uno(v.empresa)?.codigo ?? null);
    if (!emp) continue;
    const activo = (v.contratos ?? []).find((c) => c.estado === "activo");
    const letra = Number(activo?.letra_diaria) || 0;
    const cond = condicionDe(null, v.estado);
    if (cond) {
      improN[emp].cantidad += 1;
      improN[emp].valor = r2(improN[emp].valor + letra);
      continue;
    }
    if (v.estado !== "activo" || !activo) continue;
    if (pagosHoy.has(activo.id)) {
      alDiaN[emp].cantidad += 1;
      alDiaN[emp].valor = r2(alDiaN[emp].valor + letra);
    } else {
      const deuda = Math.max((saldoMap.get(activo.id) ?? 0) - (acuerdoMap.get(activo.id) ?? 0), 0);
      if (deuda > 0.009 || letra > 0.009) {
        noPagoN[emp].cantidad += 1;
        noPagoN[emp].valor = r2(noPagoN[emp].valor + (deuda > 0.009 ? deuda : letra));
      } else {
        alDiaN[emp].cantidad += 1;
        alDiaN[emp].valor = r2(alDiaN[emp].valor + letra);
      }
    }
  }
  for (const p of pagos) {
    if (p.pago.fecha !== hasta || !p.empresaCorta || p.contratoEstado !== "activo") continue;
    recaudoN[p.empresaCorta].cantidad += 1;
    recaudoN[p.empresaCorta].valor = r2(recaudoN[p.empresaCorta].valor + p.pago.monto);
  }

  return {
    desde,
    hasta,
    mesIni,
    mesFin,
    mesNombre,
    diasMesCalendario: Number(mesFin.slice(8, 10)),
    recaudo,
    improductivos,
    movimientos,
    historicoMeses,
    noPagos,
    meta: {
      mes: mesIni,
      diasLaborados,
      diasMes,
      meta100,
      meta95: meta100 != null ? r2(meta100 * 0.95) : null,
      acumuladoReal,
      flota,
    },
    letras,
    noche: {
      fecha: hasta,
      noPago: nocheEmp.map((e) => noPagoN[e]),
      alDia: nocheEmp.map((e) => alDiaN[e]),
      improductivos: nocheEmp.map((e) => improN[e]),
      recaudo: nocheEmp.map((e) => recaudoN[e]),
    },
  };
}
