import { AlignmentType, Document, HighlightColor, Packer, PageBreak, Paragraph, TextRun } from "docx";

const FUENTE = "Calibri";
const CUERPO = 24;
const TITULO = 24;
const REFERENCIA = 20;
const PANAPASS = 36;

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

function run(
  text: string,
  extra?: { bold?: boolean; italics?: boolean; size?: number; highlight?: (typeof HighlightColor)[keyof typeof HighlightColor] },
): TextRun {
  return new TextRun({
    text,
    font: FUENTE,
    size: extra?.size ?? CUERPO,
    bold: extra?.bold,
    italics: extra?.italics,
    highlight: extra?.highlight,
  });
}

function parrafo(
  children: TextRun[],
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType],
  spacing?: { before?: number; after?: number; line?: number },
): Paragraph {
  return new Paragraph({
    children,
    alignment,
    spacing: {
      before: spacing?.before ?? 0,
      after: spacing?.after ?? 120,
      line: spacing?.line ?? 276,
    },
  });
}

function paginasDe(texto: string): string[][] {
  return normalizar(texto)
    .split("[[PAGE]]")
    .map((pagina) => pagina.split("\n").map(limpiarLinea).filter(Boolean))
    .filter((lineas) => lineas.length > 0);
}

function esReferencia(linea: string): boolean {
  return /^\d+\s+\S/.test(linea);
}

function esHojaDeContacto(linea: string, siguiente: string): boolean {
  if (/CONTACTO OFICINA|CUENTAS BANCARIAS PARA PAGOS|RECARGA DE PANAPASS|GANA BONOS POR TUS/i.test(linea)) {
    return true;
  }
  return /S\.A\.?$/i.test(linea) && /CONTACTO OFICINA/i.test(siguiente);
}

function runsDeLinea(linea: string): { runs: TextRun[]; antes?: number; despues?: number } | null {
  const panapass = linea.match(/^(N[°º.]?\s*RECARGA DE PANAPASS:\s*)(\S+)\s*$/i);
  if (panapass) {
    return {
      runs: [run(`${panapass[1]}${panapass[2]}`, { bold: true, size: PANAPASS, highlight: HighlightColor.YELLOW })],
      antes: 360,
      despues: 360,
    };
  }
  const paso = linea.match(/^(Paso\s+[12]\s*:)(.*)$/i);
  if (paso) {
    return {
      runs: [
        run(paso[1], { bold: true, highlight: HighlightColor.YELLOW }),
        run(paso[2]),
      ],
    };
  }
  const carro = linea.match(/^(.*\bCARRO\s*#\s*)(\S+)(.*)$/i);
  if (carro) {
    return {
      runs: [
        run(carro[1]),
        run(carro[2], { bold: true, highlight: HighlightColor.YELLOW }),
        run(carro[3]),
      ],
    };
  }
  return null;
}

export async function armarDocxContrato(texto: string): Promise<Buffer> {
  const children: Paragraph[] = [];
  const paginas = paginasDe(texto);
  let anexos = false;
  let hojaContacto = false;

  paginas.forEach((lineas, indice) => {
    if (indice > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    let enCuerpo = indice > 0;
    let firmaRestante = 0;

    lineas.forEach((linea, i) => {
      const siguiente = lineas.slice(i + 1).find(Boolean) ?? "";
      if (esHojaDeContacto(linea, siguiente)) hojaContacto = true;
      if (!enCuerpo && /^Entre los suscritos/i.test(linea)) enCuerpo = true;

      const alineacionFirma = anexos ? AlignmentType.LEFT : AlignmentType.CENTER;
      const alineacion = hojaContacto ? AlignmentType.CENTER : AlignmentType.LEFT;

      if (indice === 0 && i === 0) {
        children.push(parrafo([run(linea, { bold: true, size: TITULO })], AlignmentType.CENTER, { after: 280 }));
        return;
      }

      if (esFirma(linea)) {
        firmaRestante = 4;
        children.push(
          parrafo([run(linea)], hojaContacto ? AlignmentType.CENTER : alineacionFirma, { before: 220, after: 40 }),
        );
        return;
      }
      if (firmaRestante > 0 && linea.length < 80 && !linea.includes(".")) {
        firmaRestante -= 1;
        const rol = /ARRENDATARIO|ARRENDADOR|TESTIGO|FIRMADO/i.test(linea);
        children.push(
          parrafo([run(linea, { bold: rol })], hojaContacto ? AlignmentType.CENTER : alineacionFirma, { after: 40 }),
        );
        if (/^TESTIGO$/i.test(linea)) anexos = true;
        return;
      }
      firmaRestante = 0;

      const especial = runsDeLinea(linea);
      if (especial) {
        children.push(
          parrafo(especial.runs, AlignmentType.CENTER, {
            before: especial.antes ?? (hojaContacto ? 80 : 0),
            after: especial.despues ?? (hojaContacto ? 160 : 80),
            line: hojaContacto ? 360 : 276,
          }),
        );
        return;
      }

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
        children.push(
          parrafo([run(linea, esReferencia(linea) ? { size: REFERENCIA } : undefined)], AlignmentType.LEFT, { after: 40 }),
        );
        return;
      }

      const clausula = linea.match(CLAUSULA);
      if (clausula && !hojaContacto) {
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
          hojaContacto || cita ? AlignmentType.CENTER : corto ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
          { after: hojaContacto ? 160 : corto ? 60 : 140, line: hojaContacto ? 360 : 276 },
        ),
      );
    });
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FUENTE, size: CUERPO },
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
