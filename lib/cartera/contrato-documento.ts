import { readFileSync } from "node:fs";
import { join } from "node:path";
import { siglaEmpresa } from "./empresa";

export type PlantillaContrato = "gold" | "autolujo" | "kowua" | "remate";

const ARCHIVO: Record<PlantillaContrato, string> = {
  gold: "gold.txt",
  autolujo: "autolujo.txt",
  kowua: "kowua.txt",
  remate: "remate.txt",
};

/** Datos del ejemplo que hay que sustituir. El cuerpo legal se conserva. */
const ANCLA: Record<
  PlantillaContrato,
  {
    nombre: string;
    cedula: string;
    placa: string;
    chasis: string;
    motor: string;
    carro: string;
    fecha: string;
    cuotas: string;
    letraNota: string;
    letraPalabras: string;
  }
> = {
  gold: {
    nombre: "LUIS CARLOS ALVEO",
    cedula: "8-755-1707",
    placa: "ET8602",
    chasis: "MALB241CAVM434208",
    motor: "G4LASM630685",
    carro: "G18",
    fecha: "19 de septiembre de 2026",
    cuotas: "MIL DOSCIENTOS SETENTA Y CINCO",
    letraNota: "38.00",
    letraPalabras: "TREINTA Y OCHO",
  },
  autolujo: {
    nombre: "ELIO GEOVANI MORAN SANCHEZ",
    cedula: "8-504-616",
    placa: "EL1512",
    chasis: "LJD0AA29AR0242454",
    motor: "G4LACP1034775",
    carro: "86",
    fecha: "30 de septiembre de 2026",
    cuotas: "MIL DOSCIENTOS SETENTA Y CINCO",
    letraNota: "35.00",
    letraPalabras: "TREINTA Y CINCO",
  },
  kowua: {
    nombre: "FRANCISCO OMAR GUARDIA MORALES",
    cedula: "8-738-1955",
    placa: "EK9356",
    chasis: "MALB241CARM211292",
    motor: "G4LAPM618592",
    carro: "175",
    fecha: "1 de octubre de 2026",
    cuotas: "MIL DOSCIENTOS SETENTA Y CINCO",
    letraNota: "35.00",
    letraPalabras: "TREINTA Y CINCO",
  },
  remate: {
    nombre: "RICHARD ANTONIO MEZA PEREZ",
    cedula: "BD294054",
    placa: "CN9033",
    chasis: "MALA741CAKM327714",
    motor: "G4LAJM941921",
    carro: "35",
    fecha: "25 de septiembre de 2026",
    cuotas: "TRESCIENTOS SESENTA Y CINCO",
    letraNota: "30.00",
    letraPalabras: "TREINTA",
  },
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
  "DIECIOCHO", "DIECINUEVE",
];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

export type DatosContratoDoc = {
  empresaCodigo: string | null;
  numCuotas: number | null;
  nombre: string;
  cedula: string | null;
  celular: string | null;
  genero: string | null;
  direccion: string | null;
  provincia: string | null;
  referencias: string | null;
  fechaInicio: string;
  abono: number;
  diasDomingos: number;
  cuotaDomingo: number;
  letraDiaria: number;
  descuentoPuntual: number;
  cobraDomingo: boolean;
  carro: string;
  placa: string;
  marca: string;
  chasis: string;
  motor: string;
  tipo: string;
  modelo: string;
  anio: string;
  color: string;
  numeroContrato: string | null;
};

export function plantillaDeContrato(codigo: string | null, numCuotas: number | null): PlantillaContrato {
  const sigla = siglaEmpresa(codigo);
  if (sigla === "GD") return "gold";
  if (sigla === "KW") return "kowua";
  if (numCuotas != null && numCuotas > 0 && numCuotas <= 400) return "remate";
  return "autolujo";
}

export function fechaContrato(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

export function enteroALetras(n: number): string {
  const v = Math.round(n);
  if (v < 0 || v > 9999) return String(v);
  if (v === 0) return "CERO";
  if (v < 1000) return hasta999(v);
  const miles = Math.floor(v / 1000);
  const resto = v % 1000;
  const cabeza = miles === 1 ? "MIL" : `${hasta999(miles)} MIL`;
  return resto ? `${cabeza} ${hasta999(resto)}` : cabeza;
}

function hasta999(n: number): string {
  if (n === 100) return "CIEN";
  if (n < 100) return hasta99(n);
  const c = Math.floor(n / 100);
  const r = n % 100;
  return r ? `${CENTENAS[c]} ${hasta99(r)}` : CENTENAS[c];
}

function hasta99(n: number): string {
  if (n < 20) return UNIDADES[n];
  if (n < 30) {
    if (n === 20) return "VEINTE";
    if (n === 22) return "VEINTIDÓS";
    if (n === 23) return "VEINTITRÉS";
    if (n === 26) return "VEINTISÉIS";
    return `VEINTI${UNIDADES[n - 20]}`;
  }
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d];
}

function referenciasDeContrato(texto: string | null): string[] {
  if (!texto) return [];
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+\.\s*/, "").replace(/\s*—\s*/g, "-"));
}

function encabezado(d: DatosContratoDoc, tituloOpcion: boolean): string {
  const refs = referenciasDeContrato(d.referencias);
  const dir = [d.provincia, d.direccion].filter(Boolean).join(". ");
  const abono = Number.isInteger(d.abono) ? String(d.abono) : d.abono.toFixed(2);
  const dias = d.diasDomingos > 0 ? d.diasDomingos : 3;
  const cuotaDom = d.cuotaDomingo > 0 ? d.cuotaDomingo : 30;
  const letra = d.letraDiaria.toFixed(2);
  const jornada = d.cobraDomingo ? "L-S" : "L-D";
  const base = tituloOpcion
    ? "CONTRATO DE ARRENDAMIENTO CON OPCION DE COMPRA"
    : "CONTRATO DE ARRENDAMIENTO";
  const titulo = d.numeroContrato ? `${base} ${d.numeroContrato}` : base;
  const lineasRef = refs.length
    ? refs.map((r, i) => `${i + 1} ${r}`).join("\n")
    : "1 —";
  return [
    titulo,
    "",
    `Fecha: ${fechaContrato(d.fechaInicio)}`,
    `Nombre del arrendatario: ${d.nombre.toUpperCase()}`,
    `Cédula: ${d.cedula || "—"}`,
    "Celular: " + (d.celular || "—"),
    "Referencias Familiares:",
    lineasRef,
    "",
    `Dirección: ${dir || "—"}`,
    `Afiliación Inicial: B/${abono} (NO REEMBOLSABLE)`,
    `Primeros ${dias} domingos: $${Number.isInteger(cuotaDom) ? cuotaDom : cuotaDom.toFixed(2)}`,
    `Letra por dia: ${letra} ${jornada}`,
    `Carro: ${d.carro}`,
    "",
  ].join("\n");
}

function bloqueVehiculo(d: DatosContratoDoc): string {
  return [
    `Placa Particular ${d.placa}`,
    "Certificado de Operación: NO APLICA",
    `Marca: ${d.marca}`,
    `No. Chasis: ${d.chasis}`,
    `No. Motor: ${d.motor}`,
    `Tipo: ${d.tipo}`,
    `Modelo: ${d.modelo}`,
    `Año: ${d.anio}`,
    `Color: ${d.color}`,
    "",
  ].join("\n");
}

function reemplazarCarro(texto: string, viejo: string, nuevo: string): string {
  if (!viejo || viejo === nuevo) return texto;
  const patrones = [
    `Carro: ${viejo}`,
    `CARRO # ${viejo}`,
    `CARRO #${viejo}`,
    `# Carro:${viejo}`,
    `# Carro: ${viejo}`,
  ];
  let out = texto;
  for (const p of patrones) out = out.split(p).join(p.replace(viejo, nuevo));
  return out;
}

export function armarTextoContrato(datos: DatosContratoDoc): string {
  const cual = plantillaDeContrato(datos.empresaCodigo, datos.numCuotas);
  const ancla = ANCLA[cual];
  const crudo = readFileSync(join(process.cwd(), "lib/cartera/contratos/plantillas", ARCHIVO[cual]), "utf8").replace(/\r/g, "");
  const corte = crudo.search(/Entre los suscritos/i);
  let cuerpo = corte >= 0 ? crudo.slice(corte) : crudo;
  const nombre = datos.nombre.trim().toUpperCase();
  const cedula = (datos.cedula || "—").trim();
  cuerpo = cuerpo.split(ancla.nombre).join(nombre);
  cuerpo = cuerpo.split(ancla.cedula).join(cedula);
  cuerpo = cuerpo.split(ancla.placa).join(datos.placa);
  cuerpo = cuerpo.split(ancla.chasis).join(datos.chasis);
  cuerpo = cuerpo.split(ancla.motor).join(datos.motor);
  cuerpo = reemplazarCarro(cuerpo, ancla.carro, datos.carro);
  cuerpo = cuerpo.split(ancla.fecha).join(fechaContrato(datos.fechaInicio));
  if (datos.numCuotas != null && datos.numCuotas > 0) {
    cuerpo = cuerpo.split(ancla.cuotas).join(enteroALetras(datos.numCuotas));
  }
  const letraLista = Math.round((datos.letraDiaria + (datos.descuentoPuntual || 0)) * 100) / 100;
  cuerpo = cuerpo.split(`${ancla.letraPalabras} BALBOAS (${ancla.letraNota})`).join(
    `${enteroALetras(Math.round(letraLista))} BALBOAS (${letraLista.toFixed(2)})`,
  );
  cuerpo = cuerpo.replace(/Placa[\s\S]*?(?=SEGUNDA:)/, `${bloqueVehiculo(datos)}\n`);
  if (datos.genero === "f") {
    cuerpo = cuerpo.replace("varón", "mujer");
    cuerpo = cuerpo.replace("mujer,  panameño", "mujer,  panameña");
  }
  return `${encabezado(datos, true)}\n${cuerpo.trim()}\n`;
}
