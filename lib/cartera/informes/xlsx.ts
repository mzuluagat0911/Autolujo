// Arma INFORMES.xlsx con la misma estructura de pestañas del archivo de contabilidad.
// Colores y bordes copian el Excel de referencia (amarillo / verde / grises / naranja).

import ExcelJS from "exceljs";
import { diaSemana, finMes } from "../fecha";
import type { DatosInformes, FilaRecaudo, MovimientoSede } from "./datos";

/** Paleta del INFORMES.xlsx de contabilidad. */
const COLOR = {
  amarillo: "FFFF00",
  verde: "92D050",
  gris: "D9D9D9",
  grisOscuro: "BFBFBF",
  naranja: "FCD5B4",
  rosa: "F2DCDB",
} as const;

type Borde = "thin" | "medium" | "none";

function money(cell: ExcelJS.Cell) {
  cell.numFmt = "#,##0.00";
}

function bold(row: ExcelJS.Row) {
  row.font = { bold: true };
}

function pintar(cell: ExcelJS.Cell, hex: string) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${hex}` },
  };
}

function fuente(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; size?: number; center?: boolean; wrap?: boolean; middle?: boolean } = {},
) {
  cell.font = { bold: Boolean(opts.bold), size: opts.size ?? 11, name: "Calibri" };
  if (opts.center || opts.wrap || opts.middle) {
    cell.alignment = {
      horizontal: opts.center ? "center" : undefined,
      vertical: opts.middle ? "middle" : undefined,
      wrapText: Boolean(opts.wrap),
    };
  }
}

function borde(
  cell: ExcelJS.Cell,
  sides: { l?: Borde; r?: Borde; t?: Borde; b?: Borde } | Borde,
) {
  const all = typeof sides === "string" ? sides : null;
  const l = all ?? (typeof sides === "object" ? sides.l : undefined) ?? "none";
  const r = all ?? (typeof sides === "object" ? sides.r : undefined) ?? "none";
  const t = all ?? (typeof sides === "object" ? sides.t : undefined) ?? "none";
  const b = all ?? (typeof sides === "object" ? sides.b : undefined) ?? "none";
  const side = (s: Borde) => (s === "none" ? undefined : { style: s, color: { argb: "FF000000" } });
  cell.border = { left: side(l), right: side(r), top: side(t), bottom: side(b) };
}

function pintarRango(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  hex: string,
  opts: { bold?: boolean; center?: boolean; wrap?: boolean; middle?: boolean; borde?: Borde } = {},
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      pintar(cell, hex);
      fuente(cell, opts);
      if (opts.borde) borde(cell, opts.borde);
    }
  }
}

function caja(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  estilo: Borde = "thin",
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      borde(cell, {
        l: c === c1 ? estilo : "thin",
        r: c === c2 ? estilo : "thin",
        t: r === r1 ? estilo : "thin",
        b: r === r2 ? estilo : "thin",
      });
    }
  }
}

function fechaLargaEs(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const meses = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
  ];
  return `${d} DE ${meses[(m ?? 1) - 1]} DE ${y}`;
}

/** Las 5 semanas fijas del mes (como en el Excel de referencia). */
function semanasFijas(mesIni: string): { label: string; desde: string; hasta: string }[] {
  const ym = mesIni.slice(0, 8);
  const ultimo = Number(finMes(mesIni).slice(8, 10));
  const cortes = [
    [1, 6],
    [7, 13],
    [14, 20],
    [21, 27],
    [28, ultimo],
  ] as const;
  return cortes.map(([a, b]) => ({
    label: `DEL ${a} AL ${b}`,
    desde: `${ym}${String(a).padStart(2, "0")}`,
    hasta: `${ym}${String(Math.min(b, ultimo)).padStart(2, "0")}`,
  }));
}

function contarMov(
  movs: MovimientoSede[],
  tipo: "entrega" | "devolucion",
  desde: string,
  hasta: string,
  tope: string,
  dow: number | null,
  sede: "PANAMA" | "CHORRERA" | null,
): number {
  let n = 0;
  const lim = hasta < tope ? hasta : tope;
  for (const m of movs) {
    if (m.tipo !== tipo) continue;
    if (m.fecha < desde || m.fecha > lim) continue;
    if (dow != null && diaSemana(m.fecha) !== dow) continue;
    if (sede && m.sede !== sede) continue;
    if (!sede && tipo === "entrega") continue;
    n += 1;
  }
  return n;
}

function hojaRecaudo(wb: ExcelJS.Workbook, filas: FilaRecaudo[]) {
  const ws = wb.addWorksheet("RECAUDO");
  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = "RECAUDO DIARIO Y QUE SIRVA PARA MENSUAL TAMBIEN";
  bold(ws.getRow(1));
  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = "DETALLES DE PAGO";
  ws.mergeCells("H2:I2");
  ws.getCell("H2").value = "FORMA DE PAGO";
  ws.mergeCells("J2:J3");
  ws.getCell("J2").value = "TOTAL EMPRESA";
  [
    "EMPRESAS",
    "CUENTAS",
    "ABONOS Y GASTOS",
    "ACUERDOS DE PAGOS",
    "MANTENIMIENTOS",
    "PANAPASS Y MULTAS POR PAGAR TARDE",
    "OTRAS (EXCESO KM, SALIDAS, EXTENSIONES, MENOR EDAD)",
    "EFECTIVO",
    "BANCO GENERAL",
  ].forEach((h, i) => {
    ws.getCell(3, i + 1).value = h;
  });
  bold(ws.getRow(3));

  filas.forEach((f, i) => {
    const r = 4 + i;
    ws.getCell(r, 1).value = f.etiqueta;
    const vals = [
      f.cuentas,
      f.abonos,
      f.acuerdos,
      f.mantenimientos,
      f.panapassMultas,
      f.otras,
      f.efectivo,
      f.banco,
    ];
    vals.forEach((v, k) => {
      ws.getCell(r, 2 + k).value = Math.abs(v) > 0.009 ? v : null;
      money(ws.getCell(r, 2 + k));
    });
    ws.getCell(r, 10).value = { formula: `+H${r}+I${r}` };
    money(ws.getCell(r, 10));
  });

  const total = 4 + filas.length;
  ws.getCell(total, 1).value = "TOTAL";
  bold(ws.getRow(total));
  for (let c = 2; c <= 10; c++) {
    const col = String.fromCharCode(64 + c);
    ws.getCell(total, c).value = { formula: `SUM(${col}4:${col}${total - 1})` };
    money(ws.getCell(total, c));
  }

  // Estilos como el Excel de referencia
  pintar(ws.getCell("A1"), COLOR.amarillo);
  fuente(ws.getCell("A1"), { bold: true, center: true });
  borde(ws.getCell("A1"), "medium");
  pintarRango(ws, 2, 1, 2, 7, COLOR.verde, { bold: true, center: true, middle: true });
  pintarRango(ws, 2, 8, 2, 9, COLOR.verde, { bold: true, center: true, middle: true });
  pintar(ws.getCell("J2"), COLOR.verde);
  fuente(ws.getCell("J2"), { bold: true, center: true, middle: true });
  pintarRango(ws, 3, 1, 3, 9, COLOR.gris, { center: true, wrap: true, middle: true });
  ws.getRow(3).height = 76;
  caja(ws, 2, 1, total, 10, "medium");
  for (let r = 4; r <= total; r++) {
    for (let c = 1; c <= 10; c++) borde(ws.getCell(r, c), "thin");
  }
  for (let c = 1; c <= 10; c++) {
    borde(ws.getCell(total, c), "medium");
    fuente(ws.getCell(total, c), { bold: true, center: c === 1 });
  }
  ws.getColumn(1).width = 23;
  ws.getColumn(2).width = 13.5;
  ws.getColumn(3).width = 17.5;
  ws.getColumn(4).width = 20;
  ws.getColumn(5).width = 16.5;
  ws.getColumn(6).width = 11.5;
  ws.getColumn(7).width = 13;
  ws.getColumn(8).width = 12;
  ws.getColumn(9).width = 15.5;
  ws.getColumn(10).width = 16.5;
}

function hojaImproductivos(wb: ExcelJS.Workbook, datos: DatosInformes) {
  const ws = wb.addWorksheet("IMPRODUCTIVOS");
  ["FECHA", "CARRO", "VALOR CUOTA", "CONDICION", "AÑO", "DIAS"].forEach((h, i) => {
    ws.getCell(1, i + 1).value = h;
  });
  bold(ws.getRow(1));

  datos.improductivos.forEach((f, i) => {
    const r = 2 + i;
    ws.getCell(r, 1).value = new Date(`${f.fecha}T12:00:00Z`);
    ws.getCell(r, 1).numFmt = "yyyy-mm-dd";
    ws.getCell(r, 2).value = /^\d+$/.test(f.carro) ? Number(f.carro) : f.carro;
    ws.getCell(r, 3).value = f.valorCuota || null;
    money(ws.getCell(r, 3));
    ws.getCell(r, 4).value = f.condicion;
    ws.getCell(r, 5).value = f.anio;
    ws.getCell(r, 6).value = f.dias;
  });

  const porCond = new Map<string, { valor: number; dias: number }>();
  for (const f of datos.improductivos) {
    const cur = porCond.get(f.condicion) ?? { valor: 0, dias: 0 };
    cur.valor += f.valorCuota;
    cur.dias += f.dias;
    porCond.set(f.condicion, cur);
  }
  const orden = ["ALMACENAMIENTO", "CHAPISTERIA", "MECANICA", "X ENTREGAR", "ALISTAMIENTO"];
  ws.getCell(2, 9).value = "ITEMS";
  ws.getCell(2, 10).value = "VALOR";
  ws.getCell(2, 11).value = "DIAS";
  bold(ws.getRow(2));
  orden.forEach((cond, i) => {
    const r = 3 + i;
    const v = porCond.get(cond) ?? { valor: 0, dias: 0 };
    ws.getCell(r, 9).value = cond;
    ws.getCell(r, 10).value = Math.round(v.valor * 100) / 100;
    money(ws.getCell(r, 10));
    ws.getCell(r, 11).value = v.dias;
  });
  ws.getCell(8, 10).value = { formula: "SUM(J3:J7)" };
  ws.getCell(8, 11).value = { formula: "SUM(K3:K7)" };
  money(ws.getCell(8, 10));

  ws.getCell(10, 9).value = "Resumen mensual";

  const porCarro = new Map<string, { dias: number; valor: number }>();
  for (const f of datos.improductivos) {
    const cur = porCarro.get(f.carro) ?? { dias: 0, valor: 0 };
    cur.dias += f.dias;
    cur.valor += f.valorCuota;
    porCarro.set(f.carro, cur);
  }
  const ranking = [...porCarro.entries()].sort(
    (a, b) => b[1].dias - a[1].dias || b[1].valor - a[1].valor,
  );
  ws.getCell(17, 9).value = "Carro";
  ws.getCell(17, 10).value = "Suma de DIAS";
  ws.getCell(17, 11).value = "Suma de VALOR IMPRODUCTIVO";
  bold(ws.getRow(17));
  ranking.slice(0, 13).forEach(([carro, v], i) => {
    const r = 18 + i;
    ws.getCell(r, 9).value = /^\d+$/.test(carro) ? Number(carro) : carro;
    ws.getCell(r, 10).value = v.dias;
    ws.getCell(r, 11).value = Math.round(v.valor * 100) / 100;
    money(ws.getCell(r, 11));
  });
  // Misma celda TOTAL del Excel de referencia.
  ws.mergeCells("I31:J31");
  ws.getCell(31, 9).value = "TOTAL";
  const lastRank = 17 + Math.min(ranking.length, 13);
  if (ranking.length) {
    ws.getCell(31, 11).value = { formula: `SUM(K18:K${lastRank})` };
    money(ws.getCell(31, 11));
  }

  ws.getCell(19, 1).value =
    "este se envia por dia, pero debemos tener la informacion por mes resumida";
  ws.getCell(37, 1).value = "Comparativo meses anteriores";
  ws.getCell(41, 1).value = "IMPRODUCTIVOS SON LOS CARROS QUE NO GENERAN LETRAS";

  // Cuadro resumen (derecha)
  pintarRango(ws, 2, 9, 2, 11, COLOR.grisOscuro, { bold: true, center: true });
  for (let r = 3; r <= 7; r++) {
    pintar(ws.getCell(r, 10), COLOR.gris);
    borde(ws.getCell(r, 9), "thin");
    borde(ws.getCell(r, 10), "thin");
    borde(ws.getCell(r, 11), "thin");
  }
  pintar(ws.getCell(8, 10), COLOR.verde);
  pintar(ws.getCell(8, 11), COLOR.verde);
  fuente(ws.getCell(8, 10), { bold: true });
  fuente(ws.getCell(8, 11), { bold: true });
  borde(ws.getCell(8, 10), "thin");
  borde(ws.getCell(8, 11), "thin");
  pintarRango(ws, 17, 9, 17, 11, COLOR.amarillo, { bold: true, center: true });
  pintar(ws.getCell(31, 9), COLOR.verde);
  pintar(ws.getCell(31, 11), COLOR.verde);
  fuente(ws.getCell(31, 9), { bold: true });
  fuente(ws.getCell(31, 11), { bold: true });
  borde(ws.getCell(31, 9), "medium");
  borde(ws.getCell(31, 11), "medium");
  pintarRango(ws, 41, 1, 41, 4, COLOR.amarillo, { bold: true });
  caja(ws, 1, 1, Math.max(datos.improductivos.length + 1, 2), 6, "thin");
  ws.getColumn(1).width = 13;
  ws.getColumn(2).width = 13;
  ws.getColumn(3).width = 13;
  ws.getColumn(4).width = 17;
  ws.getColumn(9).width = 18;
  ws.getColumn(10).width = 13;
  ws.getColumn(11).width = 26;
}

function hojaEntregasDevoluciones(wb: ExcelJS.Workbook, datos: DatosInformes) {
  const ws = wb.addWorksheet("DEVOLUCIONES Y ENTREGAS");
  const semanas = semanasFijas(datos.mesIni);
  const dows = [1, 2, 3, 4, 5, 6, 0];
  const tope = datos.hasta;

  ws.getCell("A1").value = datos.mesNombre;
  ws.mergeCells("B1:Q1");
  ws.getCell("B1").value = "CARROS ENTREGADOS POR DIA";
  bold(ws.getRow(1));

  ws.getCell("A2").value = "SEMANA";
  ws.mergeCells("B2:C2");
  ws.getCell("B2").value = "TOTAL";
  ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"].forEach((d, i) => {
    const col = 4 + i * 2;
    ws.mergeCells(2, col, 2, col + 1);
    ws.getCell(2, col).value = d;
  });

  ws.getCell("A3").value = "SEDE";
  ws.getCell("B3").value = "PANAMA";
  ws.getCell("C3").value = "CHORRERA";
  for (let i = 0; i < 7; i++) {
    const col = 4 + i * 2;
    ws.getCell(3, col).value = "PANAMA";
    ws.getCell(3, col + 1).value = "CHORRERA";
  }
  bold(ws.getRow(3));

  semanas.forEach((sem, i) => {
    const r = 4 + i;
    ws.getCell(r, 1).value = sem.label;
    dows.forEach((dow, k) => {
      const col = 4 + k * 2;
      const p = contarMov(datos.movimientos, "entrega", sem.desde, sem.hasta, tope, dow, "PANAMA");
      const c = contarMov(datos.movimientos, "entrega", sem.desde, sem.hasta, tope, dow, "CHORRERA");
      if (p) ws.getCell(r, col).value = p;
      if (c) ws.getCell(r, col + 1).value = c;
    });
    // TOTAL Panamá / Chorrera = suma de cada día (D+F+H+J+L+N+P) / (E+G+…)
    ws.getCell(r, 2).value = { formula: `D${r}+F${r}+H${r}+J${r}+L${r}+N${r}+P${r}` };
    ws.getCell(r, 3).value = { formula: `E${r}+G${r}+I${r}+K${r}+M${r}+O${r}+Q${r}` };
  });

  ws.getCell(9, 1).value = "TOTAL";
  bold(ws.getRow(9));
  ws.getCell(9, 2).value = { formula: "SUM(B4:B8)" };
  ws.getCell(9, 3).value = { formula: "SUM(C4:C8)" };

  ws.mergeCells("B10:C10");
  ws.getCell(10, 2).value = { formula: "B9+C9" };
  // Totales por columna día (como referencia; fórmulas simplificadas correctas)
  for (let k = 0; k < 7; k++) {
    const colP = 4 + k * 2;
    const colC = colP + 1;
    const letraP = String.fromCharCode(64 + colP);
    const letraC = String.fromCharCode(64 + colC);
    ws.getCell(10, colP).value = { formula: `${letraP}4+${letraP}5+${letraP}6+${letraP}7+${letraP}8` };
    ws.getCell(10, colC).value = { formula: `${letraC}4+${letraC}5+${letraC}6+${letraC}7+${letraC}8` };
  }
  for (let k = 0; k < 7; k++) {
    const colP = 4 + k * 2;
    const letraP = String.fromCharCode(64 + colP);
    ws.getCell(11, colP).value = { formula: `+${letraP}10/B9` };
    ws.getCell(11, colP).numFmt = "0%";
  }

  ws.mergeCells("A14:D15");
  ws.getCell(14, 1).value = "INFORME ENTREGA DE VEHICULOS POR MES";
  bold(ws.getRow(14));

  ws.getCell(16, 1).value = "PERIODO";
  ws.getCell(16, 2).value = "PANAMA";
  ws.getCell(16, 3).value = "CHORRERA";
  ws.getCell(16, 4).value = "TOTAL ACUMULADO";
  bold(ws.getRow(16));
  datos.historicoMeses.forEach((m, i) => {
    const r = 17 + i;
    const dia = Number(m.corte27.slice(8, 10));
    ws.getCell(r, 1).value = `1 AL ${dia} DE ${m.mesNombre}`;
    ws.getCell(r, 2).value = m.entregasPanama || null;
    ws.getCell(r, 3).value = m.entregasChorrera || null;
    ws.getCell(r, 4).value = { formula: `B${r}+C${r}` };
  });

  ws.mergeCells("A24:I24");
  ws.getCell(24, 1).value = "INFORME DEVOLUCIONES DE VEHICULOS POR SEMANA";
  bold(ws.getRow(24));
  ["SEMANA", "TOTAL", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"].forEach(
    (h, i) => {
      ws.getCell(25, i + 1).value = h;
    },
  );
  bold(ws.getRow(25));

  semanas.forEach((sem, i) => {
    const r = 26 + i;
    ws.getCell(r, 1).value = `${datos.mesNombre} ${sem.label}`;
    dows.forEach((dow, k) => {
      const n = contarMov(datos.movimientos, "devolucion", sem.desde, sem.hasta, tope, dow, null);
      if (n) ws.getCell(r, 3 + k).value = n;
    });
    ws.getCell(r, 2).value = { formula: `C${r}+D${r}+E${r}+F${r}+G${r}+H${r}+I${r}` };
  });

  ws.getCell(31, 1).value = "TOTAL";
  bold(ws.getRow(31));
  ws.getCell(31, 2).value = { formula: "SUM(B26:B30)" };
  for (let c = 3; c <= 9; c++) {
    const col = String.fromCharCode(64 + c);
    ws.getCell(32, c).value = {
      formula: `+${col}26+${col}27+${col}28+${col}29+${col}30`,
    };
    ws.getCell(33, c).value = { formula: `+${col}32/B31` };
    ws.getCell(33, c).numFmt = "0.0%";
  }

  ws.mergeCells("A36:B36");
  ws.getCell(36, 1).value = "INFORME DEVOLUCIONES DE VEHICULOS POR MES";
  bold(ws.getRow(36));
  ws.getCell(37, 1).value = "SEMANAS";
  ws.getCell(37, 2).value = "TOTAL CARROS";
  bold(ws.getRow(37));
  datos.historicoMeses.forEach((m, i) => {
    const r = 38 + i;
    const dia = Number(m.corte27.slice(8, 10));
    ws.getCell(r, 1).value = `DEL 1 AL ${dia} DE ${m.mesNombre}`;
    ws.getCell(r, 2).value = m.devoluciones || null;
  });

  // Estilos cuadros entregas / devoluciones
  ws.getRow(1).height = 26;
  pintarRango(ws, 1, 1, 1, 17, COLOR.grisOscuro, { bold: true, center: true, middle: true });
  pintarRango(ws, 2, 1, 3, 17, COLOR.gris, { bold: true, center: true, middle: true });
  caja(ws, 1, 1, 11, 17, "medium");
  pintar(ws.getCell(10, 2), COLOR.amarillo);
  fuente(ws.getCell(10, 2), { bold: true, center: true });
  pintarRango(ws, 14, 1, 15, 4, COLOR.amarillo, { bold: true, center: true, middle: true });
  pintar(ws.getCell(16, 2), COLOR.naranja);
  pintar(ws.getCell(16, 3), COLOR.naranja);
  fuente(ws.getCell(16, 1), { bold: true });
  fuente(ws.getCell(16, 2), { bold: true, center: true });
  fuente(ws.getCell(16, 3), { bold: true, center: true });
  fuente(ws.getCell(16, 4), { bold: true });
  caja(ws, 16, 1, 16 + Math.max(datos.historicoMeses.length, 1), 4, "thin");
  pintarRango(ws, 24, 1, 24, 9, COLOR.amarillo, { bold: true, center: true });
  pintarRango(ws, 25, 1, 25, 9, COLOR.grisOscuro, { bold: true, center: true });
  pintar(ws.getCell(25, 9), COLOR.rosa);
  pintarRango(ws, 31, 1, 31, 2, COLOR.naranja, { bold: true });
  caja(ws, 24, 1, 33, 9, "medium");
  pintarRango(ws, 36, 1, 36, 2, COLOR.amarillo, { bold: true });
  fuente(ws.getCell(37, 1), { bold: true });
  fuente(ws.getCell(37, 2), { bold: true });
  caja(ws, 36, 1, 37 + Math.max(datos.historicoMeses.length, 1), 2, "thin");
  ws.getColumn(1).width = 27;
  for (let c = 2; c <= 17; c++) ws.getColumn(c).width = 13;
}

function hojaNoPagos(wb: ExcelJS.Workbook, datos: DatosInformes) {
  const ws = wb.addWorksheet("NO PAGOS");
  ["CARRO", "CLIENTE", "CUOTA DIARIA", "DEUDA CUOTA", "DEUDA ACUERDOS", "OTRAS MULTAS"].forEach(
    (h, i) => {
      ws.getCell(1, i + 1).value = h;
    },
  );
  bold(ws.getRow(1));

  datos.noPagos.forEach((f, i) => {
    const r = 2 + i;
    ws.getCell(r, 1).value = /^\d+$/.test(f.carro) ? Number(f.carro) : f.carro;
    ws.getCell(r, 2).value = f.cliente;
    ws.getCell(r, 3).value = f.cuotaDiaria || null;
    money(ws.getCell(r, 3));
    ws.getCell(r, 4).value = f.deudaCuota || null;
    money(ws.getCell(r, 4));
    ws.getCell(r, 5).value = f.deudaAcuerdos || null;
    money(ws.getCell(r, 5));
    ws.getCell(r, 6).value = f.otrasMultas || null;
    money(ws.getCell(r, 6));
  });

  const n = datos.noPagos.length;
  const totR = Math.max(n + 2, 3);
  ws.getCell(totR, 3).value = "TOTAL DEUDA NO PAGOS";
  if (n > 0) {
    ws.getCell(totR, 5).value = { formula: `SUM(D2:F${n + 1})` };
    money(ws.getCell(totR, 5));
  }

  const notaR = totR + 4;
  ws.getCell(notaR, 1).value =
    "Y tambien podamos tener el dato de los clientes que deben mas de 3 dias";

  const graves = datos.noPagos.filter(
    (f) => f.cuotaDiaria > 0 && f.deudaCuota >= f.cuotaDiaria * 3 - 0.009,
  );
  const hdr = notaR + 2;
  ["CARRO", "CLIENTE", "CUOTA DIARIA", "DEUDA CUOTA", "DEUDA ACUERDOS", "OTRAS MULTAS"].forEach(
    (h, i) => {
      ws.getCell(hdr, i + 1).value = h;
    },
  );
  bold(ws.getRow(hdr));
  graves.forEach((f, i) => {
    const r = hdr + 1 + i;
    ws.getCell(r, 1).value = /^\d+$/.test(f.carro) ? Number(f.carro) : f.carro;
    ws.getCell(r, 2).value = f.cliente;
    ws.getCell(r, 3).value = f.cuotaDiaria || null;
    money(ws.getCell(r, 3));
    ws.getCell(r, 4).value = f.deudaCuota || null;
    money(ws.getCell(r, 4));
    ws.getCell(r, 5).value = f.deudaAcuerdos || null;
    money(ws.getCell(r, 5));
    ws.getCell(r, 6).value = f.otrasMultas || null;
    money(ws.getCell(r, 6));
  });

  pintarRango(ws, 1, 1, 1, 6, COLOR.grisOscuro, { bold: true, center: true });
  caja(ws, 1, 1, Math.max(n + 1, 2), 6, "thin");
  fuente(ws.getCell(totR, 3), { bold: true });
  pintarRango(ws, hdr, 1, hdr, 6, COLOR.grisOscuro, { bold: true, center: true });
  if (graves.length) caja(ws, hdr, 1, hdr + graves.length, 6, "thin");
  ws.getColumn(1).width = 13;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 13.5;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 14;
}

function hojaMeta(wb: ExcelJS.Workbook, datos: DatosInformes) {
  const ws = wb.addWorksheet("META MENSUAL");
  [
    "Fecha",
    "Dias_laborados",
    "Meta real",
    "Meta diaria",
    "Acumulado_Real",
    "Acumulado_Ideal",
    "%Meta_real",
    "%Meta_ideal",
    "Diferencia_Meta",
    "%Diferencia_Meta",
    "FLOTA X MES",
  ].forEach((h, i) => {
    ws.getCell(1, i + 1).value = h;
  });
  bold(ws.getRow(1));

  const m = datos.meta;
  const diasDiv = m.diasMes || datos.diasMesCalendario || 26;

  ws.getCell(2, 1).value = new Date(`${m.mes}T12:00:00Z`);
  ws.getCell(2, 1).numFmt = "yyyy-mm-dd";
  ws.getCell(2, 2).value = m.diasLaborados;
  ws.getCell(2, 3).value = m.meta100;
  money(ws.getCell(2, 3));
  ws.getCell(2, 4).value = m.meta100 != null ? { formula: `C2/${diasDiv}` } : null;
  money(ws.getCell(2, 4));
  ws.getCell(2, 5).value = m.acumuladoReal;
  money(ws.getCell(2, 5));
  ws.getCell(2, 6).value = { formula: "(D2*B2)" };
  money(ws.getCell(2, 6));
  ws.getCell(2, 7).value = m.meta100 ? { formula: "E2/C2" } : null;
  ws.getCell(2, 7).numFmt = "0.00%";
  ws.getCell(2, 8).value = m.meta100 ? { formula: "(D2*B2)/C2" } : null;
  ws.getCell(2, 8).numFmt = "0.00%";
  ws.getCell(2, 9).value = { formula: "E2-F2" };
  money(ws.getCell(2, 9));
  ws.getCell(2, 10).value = { formula: "G2-H2" };
  ws.getCell(2, 10).numFmt = "0.00%";
  ws.getCell(2, 11).value = m.flota;

  ws.getCell(3, 1).value = new Date(`${m.mes}T12:00:00Z`);
  ws.getCell(3, 1).numFmt = "yyyy-mm-dd";
  ws.getCell(3, 2).value = m.diasLaborados;
  ws.getCell(3, 3).value = m.meta95;
  money(ws.getCell(3, 3));
  ws.getCell(3, 4).value = m.meta95 != null ? { formula: `C3/${diasDiv}` } : null;
  money(ws.getCell(3, 4));
  ws.getCell(3, 5).value = { formula: "E2" };
  money(ws.getCell(3, 5));
  ws.getCell(3, 6).value = { formula: "(D3*B3)" };
  money(ws.getCell(3, 6));
  ws.getCell(3, 7).value = m.meta95 ? { formula: "E3/C3" } : null;
  ws.getCell(3, 7).numFmt = "0.00%";
  ws.getCell(3, 8).value = m.meta95 ? { formula: "(D3*B3)/C3" } : null;
  ws.getCell(3, 8).numFmt = "0.00%";
  ws.getCell(3, 9).value = { formula: "E3-F3" };
  money(ws.getCell(3, 9));
  ws.getCell(3, 10).value = { formula: "G3-H3" };
  ws.getCell(3, 10).numFmt = "0.00%";
  ws.getCell(3, 11).value = m.flota;

  ws.getCell(11, 1).value = "Debemos tener los valores al 100% y al 95% por mes";

  pintarRango(ws, 1, 1, 1, 11, COLOR.amarillo, { bold: true, center: true, wrap: true });
  caja(ws, 1, 1, 3, 11, "thin");
  for (let c = 1; c <= 11; c++) {
    ws.getColumn(c).width = c === 1 ? 13 : c === 5 || c === 6 ? 15 : 13;
  }
}

function hojaLetras(wb: ExcelJS.Workbook, datos: DatosInformes) {
  const ws = wb.addWorksheet("LETRAS REALES CARROS");
  const dias = datos.meta.diasMes || 26;

  type Bloque = { emp: "AL" | "KW" | "GOLD"; headerRow: number; start: number };
  const bloques: Bloque[] = [
    { emp: "AL", headerRow: 2, start: 3 },
    { emp: "KW", headerRow: 11, start: 12 },
    { emp: "GOLD", headerRow: 20, start: 21 },
  ];

  const refsTotal: string[] = [];
  for (const b of bloques) {
    ws.getCell(b.headerRow, 1).value = b.emp;
    ws.getCell(b.headerRow, 2).value = "LETRAS";
    ws.getCell(b.headerRow, 3).value = "CANTIDAD";
    ws.getCell(b.headerRow, 4).value = "POR CARRO";
    ws.getCell(b.headerRow, 5).value = "TOTAL MES";
    bold(ws.getRow(b.headerRow));
    const filas = datos.letras.filter((l) => l.empresa === b.emp);
    filas.forEach((f, i) => {
      const r = b.start + i;
      ws.getCell(r, 2).value = f.letra;
      ws.getCell(r, 3).value = f.cantidad;
      ws.getCell(r, 4).value = { formula: `+B${r}*C${r}` };
      money(ws.getCell(r, 4));
      ws.getCell(r, 5).value = { formula: `+D${r}*${dias}` };
      money(ws.getCell(r, 5));
      refsTotal.push(`E${r}`);
    });
  }

  ws.getCell(25, 3).value = "CARROS";
  ws.getCell(25, 4).value = "LETRA DIARIA";
  ws.getCell(25, 5).value = "TOTAL LETRAS";
  bold(ws.getRow(25));
  ws.getCell(26, 3).value = datos.letras.reduce((s, l) => s + l.cantidad, 0);
  if (refsTotal.length) {
    ws.getCell(26, 5).value = { formula: refsTotal.join("+") };
    money(ws.getCell(26, 5));
    ws.getCell(26, 4).value = { formula: `+E26/${dias}` };
    money(ws.getCell(26, 4));
  }
  ws.getCell(29, 2).value = "EJEMPLOS";

  for (const b of bloques) {
    pintarRango(ws, b.headerRow, 1, b.headerRow, 5, COLOR.amarillo, { bold: true, center: true });
    const filas = datos.letras.filter((l) => l.empresa === b.emp);
    if (filas.length) caja(ws, b.headerRow, 1, b.start + filas.length - 1, 5, "thin");
  }
  pintarRango(ws, 25, 3, 25, 5, COLOR.amarillo, { bold: true, center: true });
  caja(ws, 25, 3, 26, 5, "medium");
  fuente(ws.getCell(29, 2), { bold: true });
  for (let c = 1; c <= 5; c++) ws.getColumn(c).width = c >= 4 ? 16 : 13;
}

function hojaNoche(wb: ExcelJS.Workbook, datos: DatosInformes) {
  const ws = wb.addWorksheet("INFORME NOCHE");
  ws.mergeCells("A3:D3");
  ws.getCell("A3").value = fechaLargaEs(datos.noche.fecha);
  bold(ws.getRow(3));

  ws.getCell(5, 2).value = "EMPRESA";
  ws.getCell(5, 3).value = "CANTIDAD";
  ws.getCell(5, 4).value = "VALOR";
  bold(ws.getRow(5));

  const writeBloque = (
    titulo: string,
    filas: { empresa: string; cantidad: number; valor: number }[],
    start: number,
  ) => {
    filas.forEach((f, i) => {
      const r = start + i;
      if (i === 0) ws.getCell(r, 1).value = titulo;
      ws.getCell(r, 2).value = f.empresa;
      ws.getCell(r, 3).value = f.cantidad || null;
      ws.getCell(r, 4).value = f.valor || null;
      money(ws.getCell(r, 4));
    });
    const tot = start + 3;
    ws.getCell(tot, 1).value = "TOTAL";
    ws.getCell(tot, 3).value = { formula: `SUM(C${start}:C${start + 2})` };
    ws.getCell(tot, 4).value = { formula: `SUM(D${start}:D${start + 2})` };
    money(ws.getCell(tot, 4));
    bold(ws.getRow(tot));
  };

  writeBloque("NO PAGO", datos.noche.noPago, 6);
  writeBloque("AL DIA", datos.noche.alDia, 11);
  writeBloque("IMPRODUCTIVOS", datos.noche.improductivos, 16);

  ws.getCell(20, 1).value = "RECAUDO A ESTA HORA";
  ws.getCell(20, 2).value = "CUENTAS Y OTROS";
  datos.noche.recaudo.forEach((f, i) => {
    const r = 21 + i;
    ws.getCell(r, 2).value = f.empresa;
    ws.getCell(r, 3).value = f.cantidad || null;
    ws.getCell(r, 4).value = f.valor || null;
    money(ws.getCell(r, 4));
  });
  ws.getCell(24, 1).value = "TOTAL";
  ws.getCell(24, 3).value = { formula: "SUM(C21:C23)" };
  ws.getCell(24, 4).value = { formula: "SUM(D21:D23)" };
  money(ws.getCell(24, 4));
  bold(ws.getRow(24));

  ws.getCell(26, 2).value = "TOTAL RECAUDO";
  ws.getCell(26, 4).value = { formula: "D24" };
  money(ws.getCell(26, 4));
  ws.getCell(27, 2).value = "TOTAL CARROS";
  ws.getCell(27, 3).value = { formula: "C9+C14+C19+C24" };

  pintarRango(ws, 3, 1, 3, 4, COLOR.gris, { bold: true, center: true });
  pintarRango(ws, 5, 2, 5, 4, COLOR.gris, { bold: true, center: true });
  for (const r of [6, 11, 16, 20]) {
    pintar(ws.getCell(r, 1), COLOR.rosa);
    fuente(ws.getCell(r, 1), { bold: true });
  }
  for (const r of [9, 14, 19, 24]) {
    fuente(ws.getCell(r, 1), { bold: true });
    caja(ws, r, 1, r, 4, "thin");
  }
  pintar(ws.getCell(20, 2), COLOR.amarillo);
  fuente(ws.getCell(20, 2), { bold: true, center: true });
  pintarRango(ws, 26, 2, 26, 4, COLOR.amarillo, { bold: true });
  pintarRango(ws, 27, 2, 27, 3, COLOR.amarillo, { bold: true });
  caja(ws, 3, 1, 27, 4, "medium");
  ws.getColumn(1).width = 21;
  ws.getColumn(2).width = 14.5;
  ws.getColumn(3).width = 13;
  ws.getColumn(4).width = 13;
}

export async function libroInformes(datos: DatosInformes): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AutoLujo";
  wb.created = new Date();
  hojaRecaudo(wb, datos.recaudo);
  hojaImproductivos(wb, datos);
  hojaEntregasDevoluciones(wb, datos);
  hojaNoPagos(wb, datos);
  hojaMeta(wb, datos);
  hojaLetras(wb, datos);
  hojaNoche(wb, datos);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
