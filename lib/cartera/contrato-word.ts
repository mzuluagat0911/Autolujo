import { AlignmentType, Document, Packer, PageBreak, Paragraph, TextRun } from "docx";

const FUENTE = "Times New Roman";

const CLAUSULA =
  /^(NOTA(?:\s+\d+)?|(?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[EÉ]PTIMA|OCTAVA|NOVENA|D[EÉ]CIMA|VIG[EÉ]SIMA|TRIG[EÉ]SIMA|CUATRIG[EÉ]SIMA|CUATROG[EÉ]SIMA|QUICUAG[EÉ]SIMA)(?:\s+(?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[EÉ]PTIMA|OCTAVA|NOVENA))?)\s*:\s*(.*)$/i;

function normalizar(texto: string): string {
  return texto
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/HYPERLINK\s+"[^"]*"\s*\\h\s*/gi, "")
    .replace(/\f/g, "\n[[PAGE]]\n")
    .replace(/^\s*PAGE\s*2\s*$/gim, "[[PAGE]]");
}

function limpiarLinea(linea: string): string {
  return linea.replace(/[ \t]+/g, " ").trim();
}

function esFirma(linea: string): boolean {
  const guiones = (linea.match(/_/g) ?? []).length;
  return guiones >= 8 && linea.replace(/[_\s]/g, "").length < 16;
}

function run(text: string, extra?: { bold?: boolean; italics?: boolean; size?: number }): TextRun {
  return new TextRun({
    text,
    font: FUENTE,
    size: extra?.size ?? 24,
    bold: extra?.bold,
    italics: extra?.italics,
  });
}

function parrafo(
  children: TextRun[],
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType],
  spacing?: { before?: number; after?: number },
): Paragraph {
  return new Paragraph({
    children,
    alignment,
    spacing: { before: spacing?.before ?? 0, after: spacing?.after ?? 120, line: 276 },
  });
}

function paginasDe(texto: string): string[][] {
  return normalizar(texto)
    .split("[[PAGE]]")
    .map((pagina) => pagina.split("\n").map(limpiarLinea).filter(Boolean))
    .filter((lineas) => lineas.length > 0);
}

export async function armarDocxContrato(texto: string): Promise<Buffer> {
  const children: Paragraph[] = [];
  const paginas = paginasDe(texto);

  paginas.forEach((lineas, indice) => {
    if (indice > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    let enCuerpo = indice > 0;
    let firmaRestante = 0;

    lineas.forEach((linea, i) => {
      if (!enCuerpo && /^Entre los suscritos/i.test(linea)) enCuerpo = true;

      if (indice === 0 && i === 0) {
        children.push(parrafo([run(linea, { bold: true, size: 28 })], AlignmentType.CENTER, { after: 280 }));
        return;
      }

      if (esFirma(linea)) {
        firmaRestante = 4;
        children.push(parrafo([run(linea)], AlignmentType.CENTER, { before: 220, after: 40 }));
        return;
      }
      if (firmaRestante > 0 && linea.length < 60 && !linea.includes(".")) {
        firmaRestante -= 1;
        const rol = /ARRENDATARIO|ARRENDADOR|TESTIGO|FIRMADO/i.test(linea);
        children.push(parrafo([run(linea, { bold: rol })], AlignmentType.CENTER, { after: 40 }));
        return;
      }
      firmaRestante = 0;

      if (!enCuerpo) {
        const campo = linea.match(/^([^:]{2,42}):\s*(.*)$/);
        if (campo) {
          const valor = campo[2].trim();
          children.push(
            parrafo(
              valor ? [run(`${campo[1]}: `, { bold: true }), run(valor)] : [run(`${campo[1]}:`, { bold: true })],
              AlignmentType.LEFT,
              { after: 60 },
            ),
          );
          return;
        }
        children.push(parrafo([run(linea)], AlignmentType.LEFT, { after: 40 }));
        return;
      }

      const clausula = linea.match(CLAUSULA);
      if (clausula) {
        const encabezado = `${clausula[1].replace(/\s+/g, " ").trim()}:`;
        const resto = clausula[2].trim();
        if (!resto || linea.length < 110) {
          children.push(parrafo([run(linea.replace(/\s+:/, ":"), { bold: true })], AlignmentType.LEFT, { before: 240, after: 80 }));
          return;
        }
        children.push(
          parrafo(
            [run(`${encabezado} `, { bold: true }), run(resto)],
            AlignmentType.JUSTIFIED,
            { before: 200, after: 140 },
          ),
        );
        return;
      }

      const cita = /^[“"]/.test(linea);
      const corto = linea.length < 90 && !/[.]$/.test(linea);
      children.push(
        parrafo(
          [run(linea, { italics: cita, bold: cita })],
          cita ? AlignmentType.CENTER : corto ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
          { after: corto ? 60 : 140 },
        ),
      );
    });
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FUENTE, size: 24 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
