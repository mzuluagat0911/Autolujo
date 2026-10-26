import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Caso } from "./modelo";
import { totalPiezas } from "./modelo";
import type { RegistroCarro } from "./datos";
import { hojaAmarilla, tituloCotizacion, type Papeles } from "./portada";
import { plata } from "./tarifas";

const A4: [number, number] = [595.28, 841.89];
const AMARILLO = rgb(1, 0.898, 0.4);
const NEGRO = rgb(0, 0, 0);

export type ArchivoPaquete = { nombre: string; bytes: Uint8Array };

function limpio(s: string): string {
  return s.replace(/[^\u0000-\u00ff]/g, "").replace(/\s+/g, " ").trim();
}

function cortar(font: PDFFont, texto: string, size: number, max: number): string {
  let t = limpio(texto);
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -1);
  return t;
}

function lineas(font: PDFFont, texto: string, size: number, max: number, tope: number): string[] {
  const palabras = limpio(texto).split(" ").filter(Boolean);
  const out: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const siguiente = actual ? `${actual} ${palabra}` : palabra;
    if (actual && font.widthOfTextAtSize(siguiente, size) > max) {
      out.push(actual);
      actual = palabra;
    } else {
      actual = siguiente;
    }
  }
  if (actual) out.push(actual);
  return out.slice(0, tope);
}

function hojaAmarillaPdf(doc: PDFDocument, font: PDFFont, bold: PDFFont, input: Parameters<typeof hojaAmarilla>[0]): void {
  const hoja = hojaAmarilla(input);
  const page = doc.addPage(A4);
  page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: AMARILLO });
  const titulo = "RECLAMOS ASEGURADORA";
  const anchoTitulo = bold.widthOfTextAtSize(titulo, 14);
  page.drawText(titulo, { x: (A4[0] - anchoTitulo) / 2, y: 800, size: 14, font: bold, color: NEGRO });

  const x = 28;
  const ancho = A4[0] - 56;
  const alto = 22;
  let y = 768;
  const celdas = [
    { texto: "EMPRESA", ancho: 78, negrita: true },
    { texto: hoja.empresa, ancho: 70, negrita: false },
    { texto: "CARRO #", ancho: 70, negrita: true },
    { texto: hoja.numero, ancho: 70, negrita: false },
    { texto: "SEGURO", ancho: 70, negrita: true },
    { texto: hoja.seguro, ancho: ancho - 358, negrita: false },
  ];
  let cx = x;
  for (const celda of celdas) {
    dibujarCelda(page, bold, font, cx, y, celda.ancho, alto, celda.texto, celda.negrita);
    cx += celda.ancho;
  }
  y -= alto;

  const anchos = [150, 130, 190, ancho - 470];
  for (const fila of hoja.filas) {
    const valores = [fila.etiqueta, fila.valor, fila.documento, fila.marca];
    cx = x;
    for (let i = 0; i < valores.length; i++) {
      const w = anchos[i] ?? 0;
      if (w <= 0) continue;
      dibujarCelda(page, bold, font, cx, y, w, alto, valores[i] ?? "", i === 0 || i === 2);
      cx += w;
    }
    y -= alto;
  }

  y -= 8;
  page.drawText("OBSERVACIONES", { x, y, size: 9, font: bold, color: NEGRO });
  y -= 14;
  const obs = lineas(font, hoja.observaciones, 9, ancho, 4);
  for (const linea of obs.length ? obs : [" "]) {
    page.drawText(linea === " " ? "" : linea, { x, y, size: 9, font, color: NEGRO });
    y -= 12;
  }
  y -= 8;
  const danos = lineas(bold, hoja.danos || "DAÑOS.", 9, ancho, 8);
  for (const linea of danos) {
    page.drawText(linea, { x, y, size: 9, font: bold, color: NEGRO });
    y -= 12;
  }
}

function dibujarCelda(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  x: number,
  y: number,
  w: number,
  h: number,
  texto: string,
  negrita: boolean,
) {
  page.drawRectangle({
    x,
    y: y - 4,
    width: w,
    height: h,
    borderColor: NEGRO,
    borderWidth: 0.6,
    color: AMARILLO,
  });
  const usada = negrita ? bold : font;
  page.drawText(cortar(usada, texto, 8, w - 8), {
    x: x + 4,
    y: y + 2,
    size: 8,
    font: usada,
    color: NEGRO,
  });
}

function paginaBlanca(doc: PDFDocument, font: PDFFont, bold: PDFFont, titulo: string, lineasTexto: string[]) {
  const page = doc.addPage(A4);
  page.drawText(limpio(titulo), { x: 40, y: 800, size: 14, font: bold, color: NEGRO });
  let y = 770;
  for (const linea of lineasTexto) {
    if (y < 48) break;
    page.drawText(cortar(font, linea, 10, 515), { x: 40, y, size: 10, font, color: NEGRO });
    y -= 16;
  }
}

function cotizacion(doc: PDFDocument, font: PDFFont, bold: PDFFont, input: Parameters<typeof hojaAmarilla>[0]) {
  if (input.caso.piezas.length === 0) return;
  const page = doc.addPage(A4);
  const titulo = tituloCotizacion(input.marca, input.modelo);
  page.drawText(titulo, { x: 40, y: 800, size: 14, font: bold, color: NEGRO });
  page.drawText(limpio(`${input.numero}  ${input.placa}`), { x: 40, y: 780, size: 10, font, color: NEGRO });
  const cols = [40, 300, 380, 470];
  const cabezas = ["PIEZA", "CON DESCUENTO", "MANO DE OBRA", "TOTAL"];
  let y = 750;
  cabezas.forEach((c, i) => page.drawText(c, { x: cols[i] ?? 40, y, size: 8, font: bold, color: NEGRO }));
  y -= 8;
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.6, color: NEGRO });
  y -= 16;
  for (const p of input.caso.piezas) {
    if (y < 60) break;
    const pieza = typeof p.precioPieza === "number" ? plata(p.precioPieza) : "";
    const mano = typeof p.manoObra === "number" ? plata(p.manoObra) : "";
    page.drawText(cortar(font, p.pieza, 9, 250), { x: cols[0] ?? 40, y, size: 9, font, color: NEGRO });
    page.drawText(pieza, { x: cols[1] ?? 300, y, size: 9, font, color: NEGRO });
    page.drawText(mano, { x: cols[2] ?? 380, y, size: 9, font, color: NEGRO });
    page.drawText(plata(p.precio), { x: cols[3] ?? 470, y, size: 9, font, color: NEGRO });
    y -= 16;
  }
  y -= 8;
  page.drawText(`TOTAL  ${plata(totalPiezas(input.caso.piezas))}`, { x: 380, y, size: 11, font: bold, color: NEGRO });
}

function registro(doc: PDFDocument, font: PDFFont, bold: PDFFont, registroCarro: RegistroCarro | null) {
  if (!registroCarro) return;
  const pares: [string, string][] = [
    ["PLACA", registroCarro.placa],
    ["MARCA", registroCarro.marca],
    ["MODELO", registroCarro.modelo],
    ["AÑO", registroCarro.anio],
    ["COLOR", registroCarro.color],
    ["TIPO", registroCarro.tipo],
    ["CHASIS", registroCarro.chasis],
    ["MOTOR", registroCarro.motor],
  ];
  if (!pares.some(([, v]) => v.trim())) return;
  paginaBlanca(
    doc,
    font,
    bold,
    "REGISTRO VEHICULAR",
    pares.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`),
  );
}

async function anexar(doc: PDFDocument, font: PDFFont, archivo: ArchivoPaquete) {
  const b = archivo.bytes;
  const esPdf = b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  const esJpg = b.length >= 2 && b[0] === 0xff && b[1] === 0xd8;
  const esPng = b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  try {
    if (esPdf) {
      const otro = await PDFDocument.load(b, { ignoreEncryption: true });
      const pages = await doc.copyPages(otro, otro.getPageIndices());
      for (const p of pages) doc.addPage(p);
      return;
    }
    if (esJpg || esPng) {
      const img = esJpg ? await doc.embedJpg(b) : await doc.embedPng(b);
      const page = doc.addPage(A4);
      const maxW = A4[0] - 36;
      const maxH = A4[1] - 36;
      const escala = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * escala;
      const h = img.height * escala;
      page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
      return;
    }
  } catch {
    // El archivo sigue en el caso. Esta hoja avisa que no entró al PDF.
  }
  const page = doc.addPage(A4);
  page.drawText(cortar(font, `No se pudo adjuntar ${archivo.nombre}`, 12, 500), {
    x: 40,
    y: 780,
    size: 12,
    font,
    color: NEGRO,
  });
}

export async function armarPaquetePdf(input: {
  empresa: string;
  numero: string;
  placa: string;
  marca: string;
  modelo: string;
  fecha: string;
  caso: Caso;
  papeles: Papeles;
  registro: RegistroCarro | null;
  archivos: ArchivoPaquete[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  hojaAmarillaPdf(doc, font, bold, input);
  cotizacion(doc, font, bold, input);
  registro(doc, font, bold, input.registro);
  for (const archivo of input.archivos) await anexar(doc, font, archivo);
  return doc.save();
}
