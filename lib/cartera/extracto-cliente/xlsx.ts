// Extracto a cliente — misma estructura, colores y fórmulas del Excel de referencia.

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { MESES, type ExtractoClienteDatos } from "./datos";

type Borde = "thin" | "medium" | "none";

function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function pintar(cell: ExcelJS.Cell, hex: string) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: hex.startsWith("FF") ? hex : `FF${hex}` },
  };
}

function fuente(
  cell: ExcelJS.Cell,
  opts: {
    bold?: boolean;
    size?: number;
    name?: string;
    color?: string;
    align?: "left" | "center" | "right";
    valign?: "top" | "middle" | "bottom";
    wrap?: boolean;
  } = {},
) {
  cell.font = {
    bold: Boolean(opts.bold),
    size: opts.size ?? 11,
    name: opts.name ?? "Calibri",
    color: opts.color ? { argb: opts.color.startsWith("FF") ? opts.color : `FF${opts.color}` } : undefined,
  };
  cell.alignment = {
    horizontal: opts.align ?? "left",
    vertical: opts.valign ?? "top",
    wrapText: opts.wrap ?? true,
  };
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

/** Marco A2:F8 con borde medium por fuera y thin por dentro (como el original). */
function cajaFicha(ws: ExcelJS.Worksheet) {
  for (let r = 2; r <= 8; r++) {
    for (let c = 1; c <= 6; c++) {
      borde(ws.getCell(r, c), {
        l: c === 1 ? "medium" : "thin",
        r: c === 6 ? "medium" : "thin",
        t: r === 2 ? "medium" : "thin",
        b: r === 8 ? "medium" : "thin",
      });
    }
  }
}

function logoFile(): { buffer: Buffer; extension: "jpeg" | "png" } | null {
  const candidatos: { path: string; extension: "jpeg" | "png" }[] = [
    { path: path.join(process.cwd(), "lib/cartera/extracto-cliente/logo-ref.jpeg"), extension: "jpeg" },
    { path: path.join(process.cwd(), "public/logo.png"), extension: "png" },
  ];
  for (const c of candidatos) {
    try {
      if (fs.existsSync(c.path)) {
        return { buffer: fs.readFileSync(c.path), extension: c.extension };
      }
    } catch {
      /* sigue */
    }
  }
  return null;
}

/** Arma el .xlsx del extracto a cliente. */
export async function libroExtractoCliente(d: ExtractoClienteDatos): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AutoLujo";
  wb.created = new Date();

  const hojaNombre = `carro #${d.numero}`.slice(0, 31);
  const ws = wb.addWorksheet(hojaNombre, {
    views: [{ showGridLines: false }],
  });

  const anios = d.anios.length > 0 ? d.anios : [Number(d.generacion.slice(-4)) || new Date().getFullYear()];
  const nAnios = anios.length;
  const lastCol = Math.max(10, nAnios * 2); // A-J mínimo como el original

  // Anchos como el Excel de referencia.
  const anchos = [25.5, 18.16, 17.33, 13.33, 22.5, 16.66, 15.5, 14.16, 12.33, 8.83];
  for (let c = 1; c <= Math.max(lastCol, 13); c++) {
    ws.getColumn(c).width = anchos[c - 1] ?? 13;
  }

  ws.getRow(1).height = 74.45;
  for (let r = 2; r <= 12; r++) ws.getRow(r).height = 16.5;
  ws.getRow(9).height = 15.75;
  ws.getRow(13).height = 30.4;

  // —— Fila 1: fecha ——
  ws.mergeCells("A1:B1");
  const a1 = ws.getCell("A1");
  a1.value = `Fecha de generación:${d.generacion}`;
  fuente(a1, { size: 11, name: "Calibri", align: "left", valign: "top", wrap: true });
  ws.mergeCells("D1:E1");

  // —— Ficha A2:F8 ——
  ws.mergeCells("A2:F2");
  const a2 = ws.getCell("A2");
  a2.value = `EXTRACTO UNIDAD: ${d.numero}${d.placa ? ` - ${d.placa}` : ""}`;
  fuente(a2, { size: 11, name: "Calibri", align: "center", valign: "top", wrap: true });

  ws.getCell("A3").value = "Placa:";
  ws.mergeCells("B3:D3");
  ws.getCell("B3").value = d.placa ? `${d.placa} - #${d.numero}` : `#${d.numero}`;
  ws.getCell("E3").value = "Valor Cuota:";
  ws.getCell("F3").value = d.letra;
  fuente(ws.getCell("F3"), { size: 11, name: "Calibri", align: "right" });

  ws.getCell("A4").value = "Identificación:";
  ws.mergeCells("B4:D4");
  ws.getCell("B4").value = d.cedula || "—";
  fuente(ws.getCell("B4"), { size: 10, name: "Times New Roman" });
  ws.getCell("E4").value = "Cuotas Pactadas:";
  ws.getCell("F4").value = d.cuotasPactadas;
  ws.getCell("F4").numFmt = "0";
  fuente(ws.getCell("F4"), { size: 11, name: "Calibri", align: "right" });

  ws.getCell("A5").value = "Nombre:";
  ws.mergeCells("B5:D5");
  ws.getCell("B5").value = d.nombre;
  fuente(ws.getCell("B5"), { size: 10, name: "Times New Roman" });
  ws.getCell("E5").value = "Cuotas Pagadas:";
  // F5 se arma después con las columnas de cuotas por año

  ws.getCell("A6").value = "Teléfono";
  ws.mergeCells("B6:D6");
  ws.getCell("B6").value = d.telefono || "—";
  fuente(ws.getCell("B6"), { size: 10, name: "Times New Roman" });
  ws.getCell("E6").value = "Cuotas Adeudadas:";
  ws.getCell("F6").value = { formula: "F4-F5" };
  fuente(ws.getCell("F6"), { size: 11, name: "Calibri", align: "right" });

  ws.getCell("A7").value = "Inicio Crédito";
  if (d.fechaInicio) {
    const [yy, mm, dd] = d.fechaInicio.split("-").map(Number);
    ws.getCell("B7").value = new Date(Date.UTC(yy, mm - 1, dd, 12));
    ws.getCell("B7").numFmt = "dd/mm/yyyy";
  } else {
    ws.getCell("B7").value = "—";
  }
  fuente(ws.getCell("B7"), { size: 11, name: "Calibri" });
  ws.getCell("C7").value = "DIAS CREDITO";
  fuente(ws.getCell("C7"), { size: 11, name: "Calibri", align: "center" });
  ws.getCell("D7").value = d.diasCredito;
  fuente(ws.getCell("D7"), { size: 11, name: "Calibri", align: "right" });
  ws.getCell("E7").value = "Valor Mora:";
  ws.getCell("F7").value = `$US ${d.valorMora.toFixed(2).replace(".", ",")}`;
  fuente(ws.getCell("F7"), { size: 11, name: "Calibri", align: "right" });

  ws.getCell("A8").value = "Cuota inicial:";
  ws.getCell("B8").value = d.cuotaInicial;
  fuente(ws.getCell("B8"), { size: 11, name: "Calibri" });
  ws.mergeCells("B8:D8");
  ws.getCell("E8").value = "Cuotas Mora:";
  ws.getCell("F8").value = d.cuotasMora;
  fuente(ws.getCell("F8"), { size: 11, name: "Calibri", align: "right" });

  for (const addr of ["A3", "E3", "A4", "E4", "A5", "E5", "A6", "E6", "A7", "E7", "A8", "E8", "B3", "B4", "B5", "B6"]) {
    fuente(ws.getCell(addr), {
      size: addr.startsWith("B") && ["B4", "B5", "B6"].includes(addr) ? 10 : 11,
      name: addr.startsWith("B") && ["B4", "B5", "B6"].includes(addr) ? "Times New Roman" : "Calibri",
    });
  }

  cajaFicha(ws);
  // El merge A2:F2 deja el borde en la celda maestra; el original lleva medium en el marco.
  borde(ws.getCell("A2"), { l: "medium", r: "medium", t: "medium", b: "thin" });

  // Logo en G2:H8 (merge + imagen)
  ws.mergeCells("G2:H8");
  pintar(ws.getCell("G2"), "FFFFFFFF");
  const logo = logoFile();
  if (logo) {
    const imageId = wb.addImage({
      buffer: logo.buffer as unknown as ExcelJS.Buffer,
      extension: logo.extension,
    });
    // Ancla como el original: cerca de col F/G, fila 1.
    ws.addImage(imageId, {
      tl: { col: 5.02, row: 0.08 },
      ext: { width: 197, height: 137 },
    });
  }

  // SEGURO PAGA LA EMPRESA (rojo, como el original)
  ws.getCell("K4").value = "SEGURO PAGA LA EMPRESA";
  fuente(ws.getCell("K4"), { bold: true, size: 10, name: "Times New Roman" });
  for (const col of ["K", "L", "M"]) {
    pintar(ws.getCell(`${col}4`), "FFFF0000");
  }

  // Helpers amarillos (M6–M9) — mismos del original
  const moneyCols: string[] = [];
  const cuotaCols: string[] = [];
  for (let i = 0; i < nAnios; i++) {
    moneyCols.push(colLetter(1 + i * 2));
    cuotaCols.push(colLetter(2 + i * 2));
  }

  ws.getCell("F5").value = {
    formula: cuotaCols.map((c) => `${c}12`).join("+") || "0",
  };
  ws.getCell("F5").numFmt = "0.0";
  fuente(ws.getCell("F5"), { size: 11, name: "Calibri", align: "right" });

  ws.getCell("M6").value = { formula: "F3*F4" };
  pintar(ws.getCell("M6"), "FFFFFF00");
  fuente(ws.getCell("M6"), { size: 10, name: "Times New Roman" });

  ws.getCell("M7").value = {
    formula: moneyCols.map((c) => `${c}12`).join("+") || "0",
  };
  pintar(ws.getCell("M7"), "FFFFFF00");
  fuente(ws.getCell("M7"), { size: 10, name: "Times New Roman" });

  ws.getCell("M8").value = { formula: "M7-M6" };
  pintar(ws.getCell("M8"), "FFFFFF00");
  fuente(ws.getCell("M8"), { size: 10, name: "Times New Roman" });

  ws.getCell("M9").value = { formula: "M8/F3" };
  pintar(ws.getCell("M9"), "FFFFFF00");
  fuente(ws.getCell("M9"), { size: 10, name: "Times New Roman" });

  // —— Cuotas pagas por año ——
  const endYearCol = colLetter(nAnios * 2);
  ws.mergeCells(`A10:${endYearCol}10`);
  ws.getCell("A10").value = "Cuotas Pagas Por año";
  fuente(ws.getCell("A10"), { size: 11, name: "Calibri" });

  for (let i = 0; i < nAnios; i++) {
    const moneyCol = 1 + i * 2;
    const cuotaCol = 2 + i * 2;
    const year = anios[i];
    const pref = i === 0 || i === 1 ? "AÑO" : "Año";
    ws.getCell(11, moneyCol).value = `${pref} ${year}`;
    ws.getCell(11, cuotaCol).value = "Cuotas";
    fuente(ws.getCell(11, moneyCol), { size: 11, name: "Calibri" });
    fuente(ws.getCell(11, cuotaCol), { size: 11, name: "Calibri" });

    const mLetter = colLetter(moneyCol);
    const cLetter = colLetter(cuotaCol);
    // Total del año = suma de meses (columna de montos, filas 15-26)
    ws.getCell(12, moneyCol).value = { formula: `SUM(${cLetter}15:${cLetter}26)` };
    ws.getCell(12, moneyCol).numFmt = '"$"#,##0';
    fuente(ws.getCell(12, moneyCol), { size: 10, name: "Times New Roman" });

    ws.getCell(12, cuotaCol).value = { formula: `${mLetter}12/$F$3` };
    ws.getCell(12, cuotaCol).numFmt = "0.0";
    fuente(ws.getCell(12, cuotaCol), { size: 10, name: "Times New Roman" });

    // Encabezado de año sobre el detalle mensual
    ws.getCell(14, moneyCol).value = year;
    fuente(ws.getCell(14, moneyCol), { size: 10, name: "Times New Roman" });

    for (let m = 0; m < 12; m++) {
      const row = 15 + m;
      const ym = `${year}-${String(m + 1).padStart(2, "0")}`;
      const monto = d.pagosPorMes.get(ym) ?? 0;
      ws.getCell(row, moneyCol).value = MESES[m];
      fuente(ws.getCell(row, moneyCol), { size: 10, name: "Times New Roman" });
      if (monto > 0.009) {
        ws.getCell(row, cuotaCol).value = r2(monto);
        fuente(ws.getCell(row, cuotaCol), { size: 10, name: "Times New Roman" });
      }
    }

    // Suma al pie (como D27, F27, … del original)
    ws.getCell(27, cuotaCol).value = { formula: `SUM(${cLetter}15:${cLetter}26)` };
    fuente(ws.getCell(27, cuotaCol), { size: 10, name: "Times New Roman" });
  }

  ws.mergeCells(`A13:${endYearCol}13`);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
