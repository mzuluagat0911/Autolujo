import { nombreAseguradora, type Caso, type DocTipo } from "./modelo";

export type Papeles = {
  factura: boolean;
  cotizacion: boolean;
  cedulaLicencia: boolean;
  representante: boolean;
  registroVehiculo: boolean;
  informe: boolean;
  registroPublico: boolean;
  resolucion: boolean;
  fotoDano: boolean;
  fotoArreglo: boolean;
};

export type FilaHoja = {
  etiqueta: string;
  valor: string;
  documento: string;
  marca: string;
};

export type HojaAmarilla = {
  empresa: string;
  numero: string;
  seguro: string;
  filas: FilaHoja[];
  observaciones: string;
  danos: string;
};

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

export function fechaHoja(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const mes = MESES[(m ?? 0) - 1];
  if (!mes || !d || !y) return "";
  return `${d} ${mes} ${y}`;
}

export function empresaEnHoja(codigo: string): string {
  const u = codigo.trim().toUpperCase();
  if (u.includes("GOLD")) return "GOLD";
  if (u.includes("KOWUA") || u === "KW") return "KW";
  if (u.includes("AUTOLUJO") || u === "AL") return "AL";
  return codigo.trim();
}

export function tituloCotizacion(marca: string, modelo: string): string {
  const t = `${marca} ${modelo}`.toLowerCase();
  if (t.includes("kia") || t.includes("soluto")) return "COTIZACION KIA";
  return "COTIZACION HYUNDAI";
}

export function armarPapeles(input: {
  caso: Pick<Caso, "piezas">;
  tiene: (tipo: DocTipo) => boolean;
  copiaCliente: boolean;
  representante: boolean;
  registroPublico: boolean;
  registroVehiculo: boolean;
}): Papeles {
  const { tiene } = input;
  return {
    factura: tiene("cotizacion"),
    cotizacion: input.caso.piezas.length > 0 || tiene("cotizacion"),
    cedulaLicencia: tiene("cedula") || tiene("licencia") || input.copiaCliente,
    representante: input.representante,
    registroVehiculo: input.registroVehiculo,
    informe: tiene("fud") || tiene("parte"),
    registroPublico: input.registroPublico,
    resolucion: tiene("resolucion"),
    fotoDano: tiene("foto_dano"),
    fotoArreglo: tiene("foto_reparado"),
  };
}

/** Lo que le falta al paquete, en el orden en que se consigue. La resolución solo aplica con parte. */
export function faltantesPaquete(p: Papeles, via: Caso["via"]): string[] {
  const out: string[] = [];
  if (!p.fotoDano) out.push("Fotos del daño");
  if (!p.informe) out.push(via === "parte" ? "Parte policivo" : "FUD");
  if (via === "parte" && !p.resolucion) out.push("Resolución");
  if (!p.cedulaLicencia) out.push("Cédula y licencia");
  if (!p.registroVehiculo) out.push("Registro vehicular");
  if (!p.representante) out.push("Cédula del representante legal");
  if (!p.registroPublico) out.push("Registro público de la empresa");
  if (!p.cotizacion) out.push("Cotización");
  if (!p.fotoArreglo) out.push("Fotos del carro reparado");
  return out;
}

export function totalPapeles(via: Caso["via"]): number {
  return via === "parte" ? 9 : 8;
}

/** Solo los papeles que cambian en cada choque; los de la empresa y del cliente se dan por puestos. */
export function faltantesDelCaso(caso: Caso): string[] {
  const tiene = (tipo: DocTipo) => caso.documentos.some((d) => d.tipo === tipo);
  const papeles = armarPapeles({
    caso,
    tiene,
    copiaCliente: true,
    representante: true,
    registroPublico: true,
    registroVehiculo: true,
  });
  return faltantesPaquete(papeles, caso.via);
}

/** Si nadie escribió otro conductor, maneja el cliente del carro. */
export function conConductor(caso: Caso, cliente: { nombre: string; cedula: string } | null): Caso {
  if (!cliente) return caso;
  const otro = caso.conductor.trim() !== "" && caso.conductor.trim().toLowerCase() !== cliente.nombre.trim().toLowerCase();
  if (otro) return caso;
  return {
    ...caso,
    conductor: caso.conductor.trim() || cliente.nombre,
    cedulaConductor: caso.cedulaConductor.trim() || cliente.cedula,
  };
}

function si(ok: boolean): string {
  return ok ? "SÍ" : "";
}

export function textoDanos(piezas: { pieza: string }[]): string {
  const nombres = piezas.map((p) => p.pieza.trim()).filter(Boolean);
  if (nombres.length === 0) return "";
  return `DAÑOS. ${nombres.join(" ").replace(/\s+/g, " ").toUpperCase()}`;
}

export function hojaAmarilla(input: {
  empresa: string;
  numero: string;
  placa: string;
  marca: string;
  modelo: string;
  fecha: string;
  caso: Caso;
  papeles: Papeles;
}): HojaAmarilla {
  const c = input.caso;
  const p = input.papeles;
  const cotizacion = tituloCotizacion(input.marca, input.modelo);
  return {
    empresa: empresaEnHoja(input.empresa),
    numero: input.numero.trim(),
    seguro: nombreAseguradora(c.aseguradora).toUpperCase(),
    observaciones: c.observaciones.trim(),
    danos: textoDanos(c.piezas),
    filas: [
      { etiqueta: "PLACA PARTICULAR", valor: input.placa.trim(), documento: "FACTURA + DGI", marca: si(p.factura) },
      { etiqueta: "PLACA CUPO", valor: c.placaCupo.trim(), documento: cotizacion, marca: si(p.cotizacion) },
      { etiqueta: "CONDUCTOR", valor: c.conductor.trim(), documento: "CEDULA Y LICENCIA CONDUCTOR", marca: si(p.cedulaLicencia) },
      { etiqueta: "CEDULA", valor: c.cedulaConductor.trim(), documento: "COPIA CEDULA REPRES LEGAL", marca: si(p.representante) },
      { etiqueta: "ASISTENCIA COLISION", valor: c.asistencia.trim(), documento: "REGISTRO VEHICULAR", marca: si(p.registroVehiculo) },
      { etiqueta: "# PARTE POLICIAL", valor: c.numeroParte.trim(), documento: "INFORME ACCIDENTE", marca: si(p.informe) },
      { etiqueta: "FECHA COLISION", valor: fechaHoja(input.fecha), documento: "REGISTRO PUBLICO EMPRESA", marca: si(p.registroPublico) },
      { etiqueta: "FECHA AUDIENCIA #1", valor: fechaHoja(c.fechaAudiencia), documento: "RESOLUCION", marca: si(p.resolucion) },
      { etiqueta: "FECHA AUDIENCIA #2", valor: fechaHoja(c.fechaAudiencia2), documento: "FOTO DAÑO", marca: si(p.fotoDano) },
      { etiqueta: "LUGAR AUDIENCIA", valor: c.lugarAudiencia.trim(), documento: "FOTO ARREGLO", marca: si(p.fotoArreglo) },
      { etiqueta: "# TRAMITE", valor: (c.numeroTramite || c.numeroReclamo).trim(), documento: "", marca: "" },
      { etiqueta: "AJUSTADOR", valor: c.ajustador.trim(), documento: "", marca: "" },
    ],
  };
}
