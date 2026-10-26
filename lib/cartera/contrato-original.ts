import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { enteroALetras, fechaContrato, plantillaDeContrato, type DatosContratoDoc, type PlantillaContrato } from "./contrato-documento";

/**
 * El Word que se descarga es el archivo del 22 oct 2026, con los datos del cliente
 * en los mismos huecos. En Descargas el nombre no coincide con la empresa:
 * contrato-autolujo.doc es Gold y contrato-gold.doc es Auto Lujo.
 */
const ARCHIVO: Record<PlantillaContrato, string> = {
  gold: "gold.docx",
  autolujo: "autolujo.docx",
  kowua: "kowua.docx",
  remate: "remate.docx",
};

const MUESTRA: Record<
  PlantillaContrato,
  {
    numero: string;
    nombre: string;
    cedula: string;
    placa: string;
    chasis: string;
    motor: string;
    carro: string;
    fecha: string;
    cuotas: string;
    cuotasNum: string;
    letraNota: string;
    letraNotaPalabras: string;
    letraDia: string;
    letraDiaPalabras: string;
    abonoFrase: string;
    panapass: string;
  }
> = {
  gold: {
    numero: "003014",
    nombre: "LUIS CARLOS ALVEO",
    cedula: "8-755-1707",
    placa: "ET8602",
    chasis: "MALB241CAVM434208",
    motor: "G4LASM630685",
    carro: "G18",
    fecha: "19 de septiembre de 2026",
    cuotas: "MIL DOSCIENTOS SETENTA Y CINCO",
    cuotasNum: "1275",
    letraNota: "38.00",
    letraNotaPalabras: "TREINTA Y OCHO",
    letraDia: "33.00",
    letraDiaPalabras: "TREINTA Y TRES",
    abonoFrase: "DOSCIENTOS CINCUENTA BALBOAS ($250)",
    panapass: "1300853",
  },
  autolujo: {
    numero: "003038",
    nombre: "ELIO GEOVANI MORAN SANCHEZ",
    cedula: "8-504-616",
    placa: "EL1512",
    chasis: "LJD0AA29AR0242454",
    motor: "G4LACP1034775",
    carro: "86",
    fecha: "30 de septiembre de 2026",
    cuotas: "MIL DOSCIENTOS SETENTA Y CINCO",
    cuotasNum: "1275",
    letraNota: "35.00",
    letraNotaPalabras: "TREINTA Y CINCO",
    letraDia: "30.00",
    letraDiaPalabras: "TREINTA",
    abonoFrase: "CIEN BALBOAS ($100)",
    panapass: "1147351",
  },
  kowua: {
    numero: "003044",
    nombre: "FRANCISCO OMAR GUARDIA MORALES",
    cedula: "8-738-1955",
    placa: "EK9356",
    chasis: "MALB241CARM211292",
    motor: "G4LAPM618592",
    carro: "175",
    fecha: "1 de octubre de 2026",
    cuotas: "MIL DOSCIENTOS SETENTA Y CINCO",
    cuotasNum: "1275",
    letraNota: "35.00",
    letraNotaPalabras: "TREINTA Y CINCO",
    letraDia: "30.00",
    letraDiaPalabras: "TREINTA",
    abonoFrase: "CIENTO CINCUENTA BALBOAS ($150)",
    panapass: "1145654",
  },
  remate: {
    numero: "003029",
    nombre: "RICHARD ANTONIO MEZA PEREZ",
    cedula: "BD294054",
    placa: "CN9033",
    chasis: "MALA741CAKM327714",
    motor: "G4LAJM941921",
    carro: "35",
    fecha: "25 de septiembre de 2026",
    cuotas: "TRESCIENTOS SESENTA Y CINCO",
    cuotasNum: "365",
    letraNota: "30.00",
    letraNotaPalabras: "TREINTA",
    letraDia: "25.00",
    letraDiaPalabras: "VEINTICINCO",
    abonoFrase: "DOSCIENTOS BALBOAS ($200)",
    panapass: "954032",
  },
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

type Parrafo = {
  xml: string;
  start: number;
  end: number;
  deleted?: boolean;
  insertAfter?: string[];
};

function dec(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textoDe(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => dec(m[1])).join("");
}

function mapTextos(xml: string, fn: (texto: string) => string): string {
  return xml.replace(/<w:t(\b[^>]*)>([\s\S]*?)<\/w:t>/g, (full, attrs: string, body: string) => {
    const actual = dec(body);
    const nuevo = fn(actual);
    if (nuevo === actual) return full;
    let a = attrs;
    if ((nuevo.startsWith(" ") || nuevo.endsWith(" ")) && !a.includes("xml:space")) {
      a += ' xml:space="preserve"';
    }
    return `<w:t${a}>${esc(nuevo)}</w:t>`;
  });
}

/** Cambia un texto dentro de cada recuadro, sin tocar la letra ni la negrita de alrededor. */
function reemplazarToken(xml: string, viejo: string, nuevo: string): string {
  if (!viejo || viejo === nuevo) return xml;
  return mapTextos(xml, (t) => {
    if (!t.includes(viejo)) return t;
    let out = "";
    let i = 0;
    while (i < t.length) {
      const at = t.indexOf(viejo, i);
      if (at < 0) {
        out += t.slice(i);
        break;
      }
      if (t[at - 1] === "$") {
        out += t.slice(i, at + viejo.length);
        i = at + viejo.length;
        continue;
      }
      out += t.slice(i, at) + nuevo;
      i = at + viejo.length;
    }
    return out;
  });
}

function ponerTrasEtiqueta(xml: string, etiqueta: RegExp, valor: string): string {
  const parts = [...xml.matchAll(/<w:t(\b[^>]*)>([\s\S]*?)<\/w:t>/g)];
  for (let i = 0; i < parts.length; i++) {
    const t = dec(parts[i][2]);
    if (!etiqueta.test(t.trim())) continue;
    const resto = t.trim().replace(etiqueta, "").trim();
    if (!resto) {
      for (let j = i + 1; j < parts.length; j++) {
        if (!dec(parts[j][2]).trim()) continue;
        const previo = parts[j][0];
        const at = xml.indexOf(previo);
        if (at < 0) return xml;
        const reemplazo = `<w:t${parts[j][1]}>${esc(valor)}</w:t>`;
        return xml.slice(0, at) + reemplazo + xml.slice(at + previo.length);
      }
      return xml;
    }
    const marca = parts[i][0];
    const at = xml.indexOf(marca);
    if (at < 0) return xml;
    const corte = t.search(etiqueta);
    const hallado = t.match(etiqueta);
    if (corte < 0 || !hallado) return xml;
    const nuevo = t.slice(0, corte + hallado[0].length) + valor;
    return xml.slice(0, at) + `<w:t${parts[i][1]}>${esc(nuevo)}</w:t>` + xml.slice(at + marca.length);
  }
  return xml;
}

function ponerReferencia(xml: string, n: number, valor: string): string {
  let vioNumero = false;
  let vioValor = false;
  return mapTextos(xml, (t) => {
    if (!t.trim()) return t;
    if (!vioNumero && /^\d+\s*$/.test(t.trim())) {
      vioNumero = true;
      return t.replace(/\d+/, String(n));
    }
    if (vioNumero && !vioValor) {
      vioValor = true;
      return valor;
    }
    if (!vioNumero && /^\d+\s+\S/.test(t.trim())) {
      vioNumero = true;
      vioValor = true;
      return `${n} ${valor}`;
    }
    return t;
  });
}

function fechaEnDias(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} días del mes de ${MESES[m - 1]} del ${y}`;
}

function diasDeMuestra(fecha: string): string | null {
  const m = fecha.match(/^(\d+)\s+de\s+(\S+)\s+de\s+(\d{4})$/i);
  if (!m) return null;
  return `${m[1]} días del mes de ${m[2]} del ${m[3]}`;
}

function monto(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

function referenciasDe(texto: string | null): string[] {
  if (!texto) return [];
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+\.\s*/, "").replace(/\s*—\s*/g, "-"));
}

function editarParrafos(xml: string, fn: (lista: Parrafo[]) => void): string {
  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const lista: Parrafo[] = [...xml.matchAll(re)].map((m) => ({
    xml: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  fn(lista);
  let out = "";
  let cursor = 0;
  for (const p of lista) {
    out += xml.slice(cursor, p.start);
    if (!p.deleted) out += p.xml;
    for (const extra of p.insertAfter ?? []) out += extra;
    cursor = p.end;
  }
  return out + xml.slice(cursor);
}

function resaltarPasos(xml: string): string {
  return xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) => {
    const m = run.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
    if (!m) return run;
    const t = dec(m[1]).trim();
    if (t !== "Paso 1:" && t !== "Paso 2:") return run;
    if (run.includes("w:highlight")) return run;
    if (run.includes("</w:rPr>")) return run.replace("</w:rPr>", '<w:highlight w:val="yellow"/></w:rPr>');
    return run.replace(/(<w:r\b[^>]*>)/, '$1<w:rPr><w:highlight w:val="yellow"/></w:rPr>');
  });
}

function rellenar(xml: string, d: DatosContratoDoc, cual: PlantillaContrato): string {
  const m = MUESTRA[cual];
  const nombre = d.nombre.trim().toUpperCase();
  const cedula = (d.cedula || "—").trim();
  const dir = [d.provincia, d.direccion].filter(Boolean).join(". ") || "—";
  const dias = d.diasDomingos > 0 ? d.diasDomingos : 3;
  const cuotaDom = d.cuotaDomingo > 0 ? d.cuotaDomingo : 30;
  const jornada = d.cobraDomingo && !(d.cuotaDomingo > 0.009) ? "L-D" : "L-S";
  const letraLista = Math.round((d.letraDiaria + (d.descuentoPuntual || 0)) * 100) / 100;
  const refs = referenciasDe(d.referencias);
  const numero = d.numeroContrato?.trim()
    ? /^\d+$/.test(d.numeroContrato.trim())
      ? d.numeroContrato.trim().padStart(6, "0")
      : d.numeroContrato.trim()
    : null;
  const fechaNueva = fechaContrato(d.fechaInicio);
  const diasNuevos = fechaEnDias(d.fechaInicio);
  const diasViejos = diasDeMuestra(m.fecha);

  let out = editarParrafos(xml, (lista) => {
    const iRef = lista.findIndex((p) => /Referencias Familiares/i.test(textoDe(p.xml)));
    const iDir = lista.findIndex((p, i) => i > iRef && /Direcci[oó]n:/i.test(textoDe(p.xml)));
    const huecos: number[] = [];
    if (iRef >= 0 && iDir > iRef) {
      for (let i = iRef + 1; i < iDir; i++) {
        if (/^\d+\s+\S/.test(textoDe(lista[i].xml).trim())) huecos.push(i);
      }
    }
    const usar = refs.length ? refs : ["—"];
    for (let i = 0; i < usar.length && i < huecos.length; i++) {
      lista[huecos[i]].xml = ponerReferencia(lista[huecos[i]].xml, i + 1, usar[i]);
    }
    if (usar.length > huecos.length && huecos.length) {
      const base = lista[huecos[huecos.length - 1]].xml;
      lista[huecos[huecos.length - 1]].insertAfter = usar
        .slice(huecos.length)
        .map((valor, k) => ponerReferencia(base, huecos.length + k + 1, valor));
    }
    for (let i = usar.length; i < huecos.length; i++) lista[huecos[i]].deleted = true;

    for (const p of lista) {
      if (p.deleted) continue;
      const texto = textoDe(p.xml);
      if (/^Primeros \d+/.test(texto.trim())) {
        p.xml = mapTextos(p.xml, (t) =>
          /^Primeros \d+/.test(t.trim()) ? `Primeros ${dias} domingos: $${monto(cuotaDom)}` : t,
        );
      }
      if (texto.includes("Letra por dia")) {
        p.xml = ponerTrasEtiqueta(p.xml, /^Letra por dia:\s*$/i, d.letraDiaria.toFixed(2));
        p.xml = mapTextos(p.xml, (t) => (/^\s*L-[SD]\s*$/.test(t) ? ` ${jornada}` : t));
        p.xml = ponerTrasEtiqueta(p.xml, /^Carro:\s*$/i, d.carro);
      }
      p.xml = ponerTrasEtiqueta(p.xml, /^Celular:\s*$/i, d.celular || "—");
      p.xml = ponerTrasEtiqueta(p.xml, /^Direcci[oó]n:\s*$/i, dir);
      p.xml = ponerTrasEtiqueta(p.xml, /^Afiliaci[oó]n Inicial:\s*$/i, `B/${monto(d.abono)}`);
      p.xml = ponerTrasEtiqueta(p.xml, /^Marca:\s*$/i, d.marca);
      p.xml = ponerTrasEtiqueta(p.xml, /^Tipo:\s*$/i, d.tipo);
      p.xml = ponerTrasEtiqueta(p.xml, /^Modelo:\s*$/i, d.modelo);
      p.xml = ponerTrasEtiqueta(p.xml, /^A[nñ]o:\s*$/i, d.anio);
      p.xml = ponerTrasEtiqueta(p.xml, /^Color:\s*$/i, d.color);
      if (numero && texto.includes("CONTRATO DE ARRENDAMIENTO")) {
        p.xml = reemplazarToken(p.xml, m.numero, numero);
      }
      if (texto.includes("PANAPASS")) {
        p.xml = reemplazarToken(p.xml, m.panapass, (d.panapass || "").trim());
      }
    }
  });

  out = reemplazarToken(out, m.abonoFrase, `${enteroALetras(Math.round(d.abono))} BALBOAS ($${monto(d.abono)})`);
  out = reemplazarToken(out, `# ${m.carro}`, `# ${d.carro}`);
  out = reemplazarToken(out, `${m.letraNotaPalabras} BALBOAS`, "%%LETRA_NOTA%%");
  out = reemplazarToken(out, `(${m.letraNota})`, "%%LETRA_NOTA_N%%");
  out = reemplazarToken(out, `${m.letraDiaPalabras} BALBOAS`, "%%LETRA_DIA%%");
  out = reemplazarToken(out, `(${m.letraDia})`, "%%LETRA_DIA_N%%");
  out = reemplazarToken(out, "%%LETRA_NOTA%%", `${enteroALetras(Math.round(letraLista))} BALBOAS`);
  out = reemplazarToken(out, "%%LETRA_NOTA_N%%", `(${letraLista.toFixed(2)})`);
  out = reemplazarToken(out, "%%LETRA_DIA%%", `${enteroALetras(Math.round(d.letraDiaria))} BALBOAS`);
  out = reemplazarToken(out, "%%LETRA_DIA_N%%", `(${d.letraDiaria.toFixed(2)})`);
  const descuento = Math.round((d.descuentoPuntual || 0) * 100) / 100;
  out = reemplazarToken(out, "CINCO DOLARES ($5.00)", `${enteroALetras(Math.round(descuento))} DOLARES ($${descuento.toFixed(2)})`);
  if (d.numCuotas != null && d.numCuotas > 0) {
    out = reemplazarToken(out, m.cuotas, enteroALetras(d.numCuotas));
    out = reemplazarToken(out, `(${m.cuotasNum})`, `(${d.numCuotas})`);
  }
  out = reemplazarToken(out, m.nombre, nombre);
  out = reemplazarToken(out, m.cedula, cedula);
  out = reemplazarToken(out, m.placa, d.placa);
  out = reemplazarToken(out, m.chasis, d.chasis);
  out = reemplazarToken(out, m.motor, d.motor);
  out = reemplazarToken(out, m.fecha, fechaNueva);
  if (diasViejos) out = reemplazarToken(out, diasViejos, diasNuevos);
  const emision = d.fechaEmision || d.fechaInicio;
  if (fechaEnDias(emision) !== diasNuevos) {
    out = editarParrafos(out, (lista) => {
      for (const p of lista) {
        if (textoDe(p.xml).includes("Para constancia de aceptación")) {
          p.xml = reemplazarToken(p.xml, diasNuevos, fechaEnDias(emision));
        }
      }
    });
  }
  if (d.genero === "f") {
    out = reemplazarToken(out, "varón", "mujer");
    out = reemplazarToken(out, "panameño", "panameña");
  }
  return resaltarPasos(out);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlDeParrafo(p: string): string {
  const jc = p.match(/<w:jc\b[^>]*w:val="([^"]+)"/)?.[1] ?? "";
  const align = jc === "center" ? "center" : jc === "right" ? "right" : jc === "both" ? "justify" : "left";
  const ind = p.match(/<w:ind\b[^>]*\/?>/)?.[0] ?? "";
  const left = Number(ind.match(/w:left="(\d+)"/)?.[1] ?? 0);
  const sangria = Number(ind.match(/w:first-line="(-?\d+)"/)?.[1] ?? 0);
  const antes = Number(p.match(/<w:spacing\b[^>]*w:before="(\d+)"/)?.[1] ?? 0);
  const despues = Number(p.match(/<w:spacing\b[^>]*w:after="(\d+)"/)?.[1] ?? 0);
  const runs = [...p.matchAll(/<w:r\b[^>]*\/>|<w:r\b[^>]*>[\s\S]*?<\/w:r>/g)];
  let inner = "";
  let corte = false;
  for (const run of runs) {
    const xml = run[0];
    const rpr = xml.match(/<w:rPr[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
    const bold = /<w:b\b/.test(rpr) && !/<w:b\b[^>]*w:val="(?:false|0|off)"/.test(rpr);
    const sz = Number(rpr.match(/<w:sz\b[^>]*w:val="(\d+)"/)?.[1] ?? 0);
    const amarillo = /<w:highlight\b[^>]*w:val="yellow"/.test(rpr);
    const estilo = [
      bold ? "font-weight:700" : "",
      sz ? `font-size:${sz / 2}pt` : "",
      amarillo ? "background:#ffff00" : "",
    ].filter(Boolean).join(";");
    let chunk = "";
    for (const b of xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b([^>]*?)\/>|<w:tab\b[^>]*?\/>/g)) {
      if (b[0].startsWith("<w:br")) {
        if (/type="page"/.test(b[2] ?? "")) corte = true;
        else chunk += "<br>";
      } else if (b[0].startsWith("<w:tab")) {
        chunk += "&emsp;";
      } else {
        chunk += escHtml(dec(b[1] ?? ""));
      }
    }
    if (!chunk) continue;
    inner += estilo ? `<span style="${estilo}">${chunk}</span>` : chunk;
  }
  const estiloP = [
    `text-align:${align}`,
    `margin:${Math.round(antes / 15)}px 0 ${Math.round(despues / 15)}px`,
    left > 0 ? `padding-left:${Math.round(left / 15)}px` : "",
    sangria ? `text-indent:${Math.round(sangria / 15)}px` : "",
  ].filter(Boolean).join(";");
  const bloque = `<p style="${estiloP}">${inner || "&nbsp;"}</p>`;
  return corte ? `<hr class="corte">${bloque}` : bloque;
}

/** El mismo Word, en HTML, para verlo dentro de la plataforma. */
export function htmlDeDocxContrato(docx: Buffer): string {
  const xml = strFromU8(unzipSync(new Uint8Array(docx))["word/document.xml"]);
  return [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => htmlDeParrafo(m[0])).join("");
}

export async function armarDocxDesdeOriginal(d: DatosContratoDoc): Promise<Buffer> {
  const cual = plantillaDeContrato(d.empresaCodigo, d.numCuotas);
  const ruta = join(process.cwd(), "lib/cartera/contratos/originales", ARCHIVO[cual]);
  const crudo = new Uint8Array(readFileSync(ruta));
  const piezas = unzipSync(crudo);
  const xml = strFromU8(piezas["word/document.xml"]);
  piezas["word/document.xml"] = strToU8(rellenar(xml, d, cual));
  return Buffer.from(zipSync(piezas));
}
