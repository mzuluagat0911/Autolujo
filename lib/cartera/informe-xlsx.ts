import ExcelJS from "exceljs";
import {
  CONCEPTOS,
  HOJA_BASE,
  type FilaInforme,
  type MetaInforme,
  carrosDe,
  conductoresDe,
  fechasDe,
  pagoDe,
  totalDeudaDe,
} from "./informe-mes";

const BASE = `'${HOJA_BASE}'`;

function letraCol(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function fechaCelda(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function monto(n: number): number | null {
  return Math.abs(n) > 0.009 ? Math.round(n * 100) / 100 : null;
}

function rango(col: string, ultima: number): string {
  return `${BASE}!$${col}$2:$${col}$${ultima}`;
}

export async function libroInforme(filas: FilaInforme[], meta: MetaInforme, hasta: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AutoLujo";
  const ultima = Math.max(filas.length + 1, 2);
  hojaBase(wb, filas);
  hojaMeta(wb, meta, hasta, ultima, filas.reduce((s, f) => s + pagoDe(f), 0));
  hojaExtracto(wb, filas, ultima);
  hojaCalculo(wb, filas, ultima);
  hojaRecaudo(wb, filas, hasta, ultima);
  hojaPago(wb, filas, hasta, ultima);
  hojaDeuda(wb, filas, hasta, ultima);
  hojaDiscri(wb, filas, hasta, ultima);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function hojaBase(wb: ExcelJS.Workbook, filas: FilaInforme[]) {
  const ws = wb.addWorksheet(HOJA_BASE);
  const headers = [
    "Fecha",
    "# Carro",
    "Empresa",
    "Conductor",
    "KM",
    "Letras diarias",
    "PAGO",
    "DETALLES DEL PAGO",
    "General",
    "Efect",
    "Cuota",
    "Abono inicial financiado",
    "Gastos Administrativos",
    "Seguro menor de edad",
    "Multas X Pagar tarde $5",
    "Exceso Km",
    "Mantenimiento",
    "Acuerdo de pago reparaciones",
    "Panapass",
    "Otras",
    "TOTAL DEUDA",
    "Deuda Cuota 2023",
    "Deuda Abono inicial financiado",
    "Deuda Gastos Administrativos",
    "Deuda Seguro menor de edad",
    "Deuda Multas X Pagar tarde $5",
    "Deuda Exceso Km",
    "Deuda Mantenimiento",
    "Deuda Acuerdo reparaciones",
    "Deuda Panapass",
    "Deuda Otras",
    "Observaciones",
  ];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "AF1" };

  filas.forEach((fila, i) => {
    const r = i + 2;
    const row = ws.getRow(r);
    row.getCell(1).value = fechaCelda(fila.fecha);
    row.getCell(1).numFmt = "yyyy-mm-dd";
    row.getCell(2).value = /^\d+$/.test(fila.carro) ? Number(fila.carro) : fila.carro;
    row.getCell(3).value = fila.empresa;
    row.getCell(4).value = fila.conductor;
    row.getCell(6).value = monto(fila.letra);
    row.getCell(7).value = { formula: `SUM(I${r}:J${r})`, result: pagoDe(fila) };
    row.getCell(8).value = fila.detalle || null;
    row.getCell(9).value = monto(fila.general);
    row.getCell(10).value = monto(fila.efect);
    CONCEPTOS.forEach((concepto, k) => {
      row.getCell(11 + k).value = monto(fila.pagos[concepto]);
      row.getCell(22 + k).value = monto(fila.deudas[concepto]);
    });
    row.getCell(21).value = {
      formula: `SUM(V${r}:AE${r})-(SUM(K${r}:T${r}))+F${r}`,
      result: totalDeudaDe(fila),
    };
    for (const col of [6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]) {
      row.getCell(col).numFmt = "#,##0.00";
    }
  });
  ws.getColumn(1).width = 14;
  ws.getColumn(4).width = 36;
  ws.getColumn(8).width = 28;
  for (let c = 6; c <= 31; c++) ws.getColumn(c).width = 16;
}

function hojaMeta(wb: ExcelJS.Workbook, meta: MetaInforme, hasta: string, ultima: number, acumulado: number) {
  const ws = wb.addWorksheet("META");
  ws.addRow([
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
    "Nota",
  ]);
  ws.getRow(1).font = { bold: true };
  const pago = rango("G", ultima);
  const fechas = rango("A", ultima);
  const diaria = meta.diasMes > 0 && meta.meta ? meta.meta / meta.diasMes : 0;
  const ideal = diaria * meta.dias;
  ws.getCell("A2").value = fechaCelda(meta.mes);
  ws.getCell("A2").numFmt = "yyyy-mm-dd";
  ws.getCell("B2").value = meta.dias;
  ws.getCell("C2").value = meta.meta ?? null;
  ws.getCell("N2").value = hasta;
  ws.getCell("O2").value = meta.diasMes;
  ws.getCell("D2").value = {
    formula: `IF(OR(C2="",O2=0),"",C2/O2)`,
    result: meta.meta ? diaria : "",
  };
  ws.getCell("E2").value = {
    formula: `SUMIFS(${pago},${fechas},">="&A2,${fechas},"<="&DATE(${hasta.slice(0, 4)},${Number(hasta.slice(5, 7))},${Number(hasta.slice(8, 10))}))`,
    result: Math.round(acumulado * 100) / 100,
  };
  ws.getCell("F2").value = { formula: `IF(D2="","",D2*B2)`, result: meta.meta ? ideal : "" };
  ws.getCell("G2").value = { formula: `IF(OR(C2="",C2=0),"",E2/C2)`, result: "" };
  ws.getCell("H2").value = { formula: `IF(OR(C2="",C2=0),"",F2/C2)`, result: "" };
  ws.getCell("I2").value = { formula: `IF(C2="","",E2-F2)`, result: "" };
  ws.getCell("J2").value = { formula: `IF(OR(G2="",H2=""),"",G2-H2)`, result: "" };
  ws.getCell("K2").value = meta.flota;
  ws.getCell("L2").value = meta.nota || null;
  ws.getCell("M1").value = "Días del mes";
  ws.getCell("O1").value = "Días hábiles del mes";
  ws.getCell("N1").value = "Corte";
  for (const col of ["C", "D", "E", "F", "I"]) ws.getCell(`${col}2`).numFmt = "#,##0.00";
  for (const col of ["G", "H", "J"]) ws.getCell(`${col}2`).numFmt = "0.00%";
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 18;
  ws.getColumn(12).width = 42;
}

function sumifsConcepto(
  col: string,
  ultima: number,
  empresaCelda: string,
  carroCelda: string,
): string {
  return `SUMIFS(${rango(col, ultima)},${rango("C", ultima)},${empresaCelda},${rango("B", ultima)},${carroCelda})`;
}

function hojaExtracto(wb: ExcelJS.Workbook, filas: FilaInforme[], ultima: number) {
  const ws = wb.addWorksheet("EXTRACTO_CARRO");
  const headers = ["# Carro", "Empresa", "Conductor", ...CONCEPTOS, "TOTAL DEUDA"];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const carros = carrosDe(filas);
  // Columnas de INFORME: F letra, K-T pagos, V-AE deudas. Misma posición que CONCEPTOS.
  const colPago = CONCEPTOS.map((_, i) => letraCol(11 + i));
  const colDeuda = CONCEPTOS.map((_, i) => letraCol(22 + i));
  carros.forEach((carro, i) => {
    const r = i + 2;
    ws.getCell(r, 1).value = /^\d+$/.test(carro.carro) ? Number(carro.carro) : carro.carro;
    ws.getCell(r, 2).value = carro.empresa;
    ws.getCell(r, 3).value = carro.conductor;
    CONCEPTOS.forEach((concepto, k) => {
      const deuda = sumifsConcepto(colDeuda[k], ultima, `$B${r}`, `$A${r}`);
      const pago = sumifsConcepto(colPago[k], ultima, `$B${r}`, `$A${r}`);
      const letra =
        concepto === "Cuota" ? `+${sumifsConcepto("F", ultima, `$B${r}`, `$A${r}`)}` : "";
      ws.getCell(r, 4 + k).value = { formula: `${deuda}-${pago}${letra}` };
      ws.getCell(r, 4 + k).numFmt = "#,##0.00";
    });
    const fin = letraCol(3 + CONCEPTOS.length);
    ws.getCell(r, 4 + CONCEPTOS.length).value = { formula: `SUM(D${r}:${fin}${r})` };
    ws.getCell(r, 4 + CONCEPTOS.length).numFmt = "#,##0.00";
  });
  ws.getColumn(3).width = 36;
  ws.autoFilter = { from: "A1", to: `${letraCol(headers.length)}1` };
}

function hojaCalculo(wb: ExcelJS.Workbook, filas: FilaInforme[], ultima: number) {
  const ws = wb.addWorksheet("CALCULO_EXTRACTO");
  ws.getCell("A1").value = "Empresa";
  ws.getCell("B1").value = "(Todas)";
  ws.getCell("A2").value = "# Carro";
  ws.getCell("B2").value = "(Todas)";
  const headers = [
    "Etiquetas de fila",
    "Suma de Letras diarias",
    "Suma de Cuota",
    ...CONCEPTOS.slice(1).map((c) => `Suma de ${c}`),
    "Suma de Deuda Cuota 2023",
    ...CONCEPTOS.slice(1).map((c) => `Suma de Deuda ${c.replace("Acuerdo de pago reparaciones", "Acuerdo reparaciones")}`),
  ];
  // Encabezado en la fila 4, como la dinámica original.
  headers.forEach((h, i) => {
    ws.getCell(4, i + 1).value = h;
    ws.getCell(4, i + 1).font = { bold: true };
  });
  const nombres = conductoresDe(filas);
  const colPago = ["K", ...CONCEPTOS.slice(1).map((_, i) => letraCol(12 + i))];
  const colDeuda = CONCEPTOS.map((_, i) => letraCol(22 + i));
  nombres.forEach((nombre, i) => {
    const r = 5 + i;
    ws.getCell(r, 1).value = nombre;
    const suma = (col: string) =>
      `SUMIF(${rango("D", ultima)},A${r},${rango(col, ultima)})`;
    ws.getCell(r, 2).value = { formula: suma("F") };
    colPago.forEach((col, k) => {
      ws.getCell(r, 3 + k).value = { formula: suma(col) };
      ws.getCell(r, 3 + k).numFmt = "#,##0.00";
    });
    colDeuda.forEach((col, k) => {
      ws.getCell(r, 3 + colPago.length + k).value = { formula: suma(col) };
      ws.getCell(r, 3 + colPago.length + k).numFmt = "#,##0.00";
    });
    ws.getCell(r, 2).numFmt = "#,##0.00";
  });
  ws.getColumn(1).width = 36;
}

function hojaRecaudo(wb: ExcelJS.Workbook, filas: FilaInforme[], hasta: string, ultima: number) {
  const ws = wb.addWorksheet("TOTAL_RECAUDO");
  ws.getCell("A1").value = "Corte";
  ws.getCell("B1").value = fechaCelda(hasta);
  ws.getCell("B1").numFmt = "yyyy-mm-dd";
  ws.getCell("A3").value = "Suma de PAGO";
  const empresas = ["AUTOLUJO", "KW", "GOLD"];
  ws.getCell("A4").value = "Etiquetas de fila";
  empresas.forEach((e, i) => {
    ws.getCell(4, i + 2).value = e;
  });
  ws.getCell(4, 5).value = "Total general";
  ws.getRow(4).font = { bold: true };
  const fechas = fechasDe(filas);
  fechas.forEach((fecha, i) => {
    const r = 5 + i;
    ws.getCell(r, 1).value = fechaCelda(fecha);
    ws.getCell(r, 1).numFmt = "yyyy-mm-dd";
    empresas.forEach((empresa, k) => {
      ws.getCell(r, 2 + k).value = {
        formula: `SUMIFS(${rango("G", ultima)},${rango("A", ultima)},A${r},${rango("C", ultima)},${letraCol(2 + k)}$4)`,
      };
      ws.getCell(r, 2 + k).numFmt = "#,##0.00";
    });
    ws.getCell(r, 5).value = { formula: `SUM(B${r}:D${r})` };
    ws.getCell(r, 5).numFmt = "#,##0.00";
  });
  const total = 5 + fechas.length;
  ws.getCell(total, 1).value = "Total general";
  ws.getCell(total, 1).font = { bold: true };
  for (let c = 2; c <= 5; c++) {
    const col = letraCol(c);
    ws.getCell(total, c).value = fechas.length ? { formula: `SUM(${col}5:${col}${total - 1})` } : 0;
    ws.getCell(total, c).numFmt = "#,##0.00";
    ws.getCell(total, c).font = { bold: true };
  }
}

function hojaPago(wb: ExcelJS.Workbook, filas: FilaInforme[], hasta: string, ultima: number) {
  const ws = wb.addWorksheet("TOTAL_PAGO_RECAUDO");
  ws.getCell("A1").value = "Corte";
  ws.getCell("B1").value = fechaCelda(hasta);
  ws.getCell("B1").numFmt = "yyyy-mm-dd";
  ws.getCell("A2").value = "Empresa";
  ws.getCell("B2").value = "(Todas)";
  ws.getCell("A4").value = "Etiquetas de fila";
  ws.getCell("B4").value = "Suma de General";
  ws.getCell("C4").value = "Suma de Efect";
  ws.getCell("D4").value = "Suma de PAGO";
  ws.getRow(4).font = { bold: true };
  const fechas = fechasDe(filas);
  fechas.forEach((fecha, i) => {
    const r = 5 + i;
    ws.getCell(r, 1).value = fechaCelda(fecha);
    ws.getCell(r, 1).numFmt = "yyyy-mm-dd";
    ws.getCell(r, 2).value = { formula: `SUMIF(${rango("A", ultima)},A${r},${rango("I", ultima)})` };
    ws.getCell(r, 3).value = { formula: `SUMIF(${rango("A", ultima)},A${r},${rango("J", ultima)})` };
    ws.getCell(r, 4).value = { formula: `SUM(B${r}:C${r})` };
    for (const c of [2, 3, 4]) ws.getCell(r, c).numFmt = "#,##0.00";
  });
  const total = 5 + fechas.length;
  ws.getCell(total, 1).value = "Total general";
  ws.getCell(total, 1).font = { bold: true };
  for (let c = 2; c <= 4; c++) {
    const col = letraCol(c);
    ws.getCell(total, c).value = fechas.length ? { formula: `SUM(${col}5:${col}${total - 1})` } : 0;
    ws.getCell(total, c).numFmt = "#,##0.00";
  }
}

function hojaDeuda(wb: ExcelJS.Workbook, filas: FilaInforme[], hasta: string, ultima: number) {
  const ws = wb.addWorksheet("TOTAL_DEUDA");
  ws.getCell("A1").value = "Corte";
  ws.getCell("B1").value = fechaCelda(hasta);
  ws.getCell("B1").numFmt = "yyyy-mm-dd";
  ws.getCell("A2").value = "Empresa";
  ws.getCell("B2").value = "(Todas)";
  ws.getCell("A4").value = "Suma de TOTAL DEUDA";
  const carros = carrosDe(filas);
  carros.forEach((carro, i) => {
    const col = 2 + i;
    ws.getCell(3, col).value = carro.empresa;
    ws.getCell(4, col).value = /^\d+$/.test(carro.carro) ? Number(carro.carro) : carro.carro;
  });
  ws.getRow(4).font = { bold: true };
  const fechas = fechasDe(filas);
  fechas.forEach((fecha, i) => {
    const r = 5 + i;
    ws.getCell(r, 1).value = fechaCelda(fecha);
    ws.getCell(r, 1).numFmt = "yyyy-mm-dd";
    carros.forEach((_, k) => {
      const col = 2 + k;
      const letra = letraCol(col);
      ws.getCell(r, col).value = {
        formula: `SUMIFS(${rango("U", ultima)},${rango("A", ultima)},$A${r},${rango("C", ultima)},${letra}$3,${rango("B", ultima)},${letra}$4)`,
      };
      ws.getCell(r, col).numFmt = "#,##0.00";
    });
  });
  ws.getColumn(1).width = 22;
}

function hojaDiscri(wb: ExcelJS.Workbook, filas: FilaInforme[], hasta: string, ultima: number) {
  const ws = wb.addWorksheet("TOTAL_RECAUDO_DISCRI");
  ws.getCell("A1").value = "Empresa";
  ws.getCell("B1").value = "(Varios elementos)";
  ws.getCell("C1").value = "Corte";
  ws.getCell("D1").value = fechaCelda(hasta);
  ws.getCell("D1").numFmt = "yyyy-mm-dd";
  const headers = ["Etiquetas de fila", ...CONCEPTOS.map((c) => `Suma de ${c}`), "Suma de PAGO"];
  headers.forEach((h, i) => {
    ws.getCell(3, i + 1).value = h;
    ws.getCell(3, i + 1).font = { bold: true };
  });
  const fechas = fechasDe(filas);
  const colPago = CONCEPTOS.map((_, i) => letraCol(11 + i));
  fechas.forEach((fecha, i) => {
    const r = 4 + i;
    ws.getCell(r, 1).value = fechaCelda(fecha);
    ws.getCell(r, 1).numFmt = "yyyy-mm-dd";
    colPago.forEach((col, k) => {
      ws.getCell(r, 2 + k).value = {
        formula: `SUMIF(${rango("A", ultima)},A${r},${rango(col, ultima)})`,
      };
      ws.getCell(r, 2 + k).numFmt = "#,##0.00";
    });
    const pagoCol = 2 + CONCEPTOS.length;
    ws.getCell(r, pagoCol).value = { formula: `SUMIF(${rango("A", ultima)},A${r},${rango("G", ultima)})` };
    ws.getCell(r, pagoCol).numFmt = "#,##0.00";
  });
  const total = 4 + fechas.length;
  ws.getCell(total, 1).value = "Total general";
  ws.getCell(total, 1).font = { bold: true };
  for (let c = 2; c <= 2 + CONCEPTOS.length; c++) {
    const col = letraCol(c);
    ws.getCell(total, c).value = fechas.length ? { formula: `SUM(${col}4:${col}${total - 1})` } : 0;
    ws.getCell(total, c).numFmt = "#,##0.00";
    ws.getCell(total, c).font = { bold: true };
  }
}
