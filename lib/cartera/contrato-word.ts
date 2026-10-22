import { AlignmentType, BorderStyle, Document, HighlightColor, Packer, PageBreak, Paragraph, TextRun } from "docx";

const FUENTE = "Calibri";
/** Calibri 10. El Word mide en medios puntos. */
const CUERPO = 20;
const TITULO = 20;
const REFERENCIA = 20;
const PANAPASS = 20;

const CLAUSULA =
  /^(NOTA(?:\s+(?:\d+|PROMOCI[OÓ]N))?|PAR[AÁ]GRAFO|(?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[EÉ]PTIMA|OCTAVA|NOVENA|D[EÉ]CIMA|VIG[EÉ]SIMA|TRIG[EÉ]SIMA|CUATRIG[EÉ]SIMA|CUATROG[EÉ]SIMA|QUICUAG[EÉ]SIMA)(?:\s+(?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[EÉ]PTIMA|OCTAVA|NOVENA))?)\s*:\s*(.*)$/i;

function normalizar(texto: string): string {
  return texto
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/HYPERLINK\s+"[^"]*"\s*\\h\s*/gi, "")
    .replace(/\f/g, "\n[[PAGE]]\n")
    .replace(/^\s*PAGE\s*2\s*$/gim, "[[PAGE]]")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^·\s*/gm, "• ")
    .replace(/_{4,}\s+_{4,}/g, "________")
    .replace(/\bordialmente\b/gi, "Cordialmente")
    .replace(/\bDOCED\b/g, "DOCE");
}

function limpiarLinea(linea: string): string {
  return linea.replace(/[ \t]+/g, " ").trim();
}

function esLineaDeFirma(linea: string): boolean {
  const limpia = linea.replace(/\s/g, "");
  return limpia.length >= 8 && /^_+$/.test(limpia);
}

/** Oficio / hoja legal: 216 mm × 355 mm. */
const OFICIO_ANCHO = Math.round((216 / 25.4) * 1440);
const OFICIO_ALTO = Math.round((355 / 25.4) * 1440);

function rayaDeFirma(): Paragraph {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000", space: 1 },
    },
    indent: { right: 6200 },
    spacing: { before: 360, after: 20 },
    children: [new TextRun({ text: " ", font: FUENTE, size: CUERPO })],
  });
}

function esInicioAnexo(linea: string): boolean {
  return (
    /^Panam[aá],/i.test(linea) ||
    /^AUTORIZACI[OÓ]N PARA/i.test(linea) ||
    /^Fecha\s+_{2,}/i.test(linea) ||
    /^Fecha\s*$/i.test(linea)
  );
}

function esPazYSalvo(linea: string): boolean {
  return /^(Paz y salvo|No tener|No ser parte)/i.test(linea);
}

function esRenglonDeFirma(linea: string): boolean {
  return /^(FIRMA|Firma|C[EÉ]DULA|NOMBRE|Nombre)\b/i.test(linea);
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
      after: spacing?.after ?? 60,
      line: spacing?.line ?? 240,
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
  let hojaContacto = false;
  let alInicio = true;
  let ultimaFueFecha = false;

  const salto = () => {
    if (alInicio) return;
    children.push(new Paragraph({ children: [new PageBreak()] }));
    alInicio = true;
    ultimaFueFecha = false;
  };
  const poner = (p: Paragraph) => {
    children.push(p);
    alInicio = false;
  };

  paginas.forEach((lineas, indice) => {
    if (indice > 0) salto();
    let enCuerpo = indice > 0;
    let firmaRestante = 0;

    lineas.forEach((linea, i) => {
      const siguiente = lineas.slice(i + 1).find(Boolean) ?? "";
      if (esHojaDeContacto(linea, siguiente)) {
        salto();
        hojaContacto = true;
      }
      if (/^PODER ESPECIAL$/i.test(linea) && !alInicio && !ultimaFueFecha) salto();
      if (esInicioAnexo(linea)) salto();
      if (!enCuerpo && /^Entre los suscritos/i.test(linea)) enCuerpo = true;

      if (indice === 0 && i === 0) {
        poner(parrafo([run(linea, { bold: true, size: TITULO })], AlignmentType.CENTER, { after: 200 }));
        return;
      }

      if (/^Panam[aá],/i.test(linea) || /^Fecha\s+_{2,}/i.test(linea) || /^Fecha\s*$/i.test(linea)) {
        ultimaFueFecha = true;
        poner(parrafo([run(linea, { bold: true, highlight: HighlightColor.YELLOW })], AlignmentType.LEFT, { before: 80, after: 80 }));
        return;
      }
      ultimaFueFecha = false;

      if (/^PODER ESPECIAL$/i.test(linea)) {
        poner(parrafo([run(linea, { bold: true, highlight: HighlightColor.YELLOW })], AlignmentType.LEFT, { before: 200, after: 160 }));
        return;
      }

      if (/^Cordialmente\b/i.test(linea)) {
        poner(parrafo([run("Cordialmente", { bold: true, highlight: HighlightColor.YELLOW })], AlignmentType.LEFT, { before: 200, after: 200 }));
        return;
      }

      if (/^NO TIENE$/i.test(linea)) {
        poner(parrafo([run(linea, { bold: true, highlight: HighlightColor.YELLOW })], AlignmentType.CENTER, { before: 80, after: 80 }));
        return;
      }

      if (esRenglonDeFirma(linea)) {
        const etiqueta = linea.replace(/_+/g, "").replace(/:+\s*$/, "").trim();
        poner(parrafo([run(`${etiqueta}  ______________________________`)], AlignmentType.LEFT, { before: 280, after: 40 }));
        return;
      }

      if (esLineaDeFirma(linea)) {
        firmaRestante = 4;
        poner(rayaDeFirma());
        return;
      }
      if (firmaRestante > 0 && linea.length < 80 && !linea.includes(".")) {
        firmaRestante -= 1;
        const rol = /ARRENDATARIO|ARRENDADOR|TESTIGO|FIRMADO|PODER ESPECIAL/i.test(linea);
        poner(
          new Paragraph({
            children: [run(linea, rol ? { bold: true, highlight: HighlightColor.YELLOW } : { bold: true })],
            spacing: { before: 0, after: 20, line: 240 },
          }),
        );
        return;
      }
      firmaRestante = 0;

      if (esPazYSalvo(linea)) {
        poner(
          new Paragraph({
            children: [run(`•  ${linea}`, { highlight: HighlightColor.YELLOW })],
            indent: { left: 420 },
            spacing: { before: 0, after: 0, line: 240 },
          }),
        );
        return;
      }

      if (linea.startsWith("• ")) {
        poner(
          new Paragraph({
            children: [run(linea)],
            indent: { left: 420 },
            spacing: { before: 0, after: 20, line: 240 },
          }),
        );
        return;
      }

      const especial = runsDeLinea(linea);
      if (especial) {
        poner(
          parrafo(especial.runs, AlignmentType.CENTER, {
            before: especial.antes ?? (hojaContacto ? 60 : 0),
            after: especial.despues ?? (hojaContacto ? 80 : 60),
            line: 240,
          }),
        );
        return;
      }

      if (!enCuerpo) {
        const campo = linea.match(/^([^:]{2,42}):\s*(.*)$/);
        if (campo) {
          const valor = campo[2].trim();
          poner(
            parrafo(
              valor ? [run(`${campo[1]}: `, { bold: true }), run(valor)] : [run(`${campo[1]}:`, { bold: true })],
              AlignmentType.LEFT,
              { after: 40 },
            ),
          );
          return;
        }
        poner(
          parrafo([run(linea, esReferencia(linea) ? { size: REFERENCIA } : undefined)], AlignmentType.LEFT, { after: 20 }),
        );
        return;
      }

      if (/^Señores$/i.test(linea)) {
        poner(parrafo([run(linea, { bold: true })], AlignmentType.LEFT, { before: 80, after: 20 }));
        return;
      }
      if (/S\.A\.?\s*$/i.test(linea) && linea.length < 70 && !linea.includes(",")) {
        poner(parrafo([run(linea, { bold: true, highlight: HighlightColor.YELLOW })], AlignmentType.LEFT, { before: 40, after: 20 }));
        return;
      }
      if (/^(La Ciudad|Ciudad)$/i.test(linea)) {
        poner(parrafo([run(linea)], AlignmentType.LEFT, { before: 0, after: 160 }));
        return;
      }

      const limite = linea.match(/^(NORTE|SUR|ESTE|OESTE):\s*(.*)$/i);
      if (limite && !hojaContacto) {
        const valor = limite[2].trim();
        poner(
          parrafo(
            valor ? [run(`${limite[1].toUpperCase()}: `, { bold: true }), run(valor)] : [run(`${limite[1].toUpperCase()}:`, { bold: true })],
            AlignmentType.LEFT,
            { before: 20, after: 20 },
          ),
        );
        return;
      }

      const clausula = linea.match(CLAUSULA);
      if (clausula && !hojaContacto) {
        const encabezado = `${clausula[1].replace(/\s+/g, " ").trim()}:`;
        const resto = clausula[2].trim();
        if (!resto || linea.length < 110) {
          poner(parrafo([run(linea.replace(/\s+:/, ":"), { bold: true })], AlignmentType.LEFT, { before: 160, after: 40 }));
          return;
        }
        poner(
          parrafo(
            [run(`${encabezado} `, { bold: true }), run(resto)],
            AlignmentType.JUSTIFIED,
            { before: 160, after: 40 },
          ),
        );
        return;
      }

      const cita = /^[“"]/.test(linea);
      const corto = linea.length < 90 && !/[.]$/.test(linea);
      poner(
        parrafo(
          [run(linea, { italics: cita, bold: cita })],
          hojaContacto || cita ? AlignmentType.CENTER : corto ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
          { after: hojaContacto ? 60 : 40, line: 240 },
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
            size: { width: OFICIO_ANCHO, height: OFICIO_ALTO },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
