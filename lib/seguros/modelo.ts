// Un choque es un caso. La carpeta vive en vehiculo_eventos (origen seguros)
// para no pedir una tabla nueva. La hoja de vida no muestra esas filas.

import { diasEntre } from "@/lib/cartera/fecha";

export const ORIGEN_SEGUROS = "seguros";
export const TITULO_CASO = "Colisión";
export const TITULO_POLIZA = "Póliza";

export const SECCIONES = [
  { id: "reportado", label: "Recién reportado" },
  { id: "cita", label: "Cita en oficina" },
  { id: "audiencia", label: "Esperando audiencia" },
  { id: "resolucion", label: "Esperando resolución" },
  { id: "facturas", label: "Armar facturas" },
  { id: "seguimiento", label: "Seguimiento" },
  { id: "pagado", label: "Pagado" },
  { id: "no_procede", label: "No procede" },
] as const;

export type Seccion = (typeof SECCIONES)[number]["id"];

export const ASEGURADORAS = [
  { id: "fedpa", nombre: "Fedpa", telefono: "340-5400" },
  { id: "sura", nombre: "Sura", telefono: "800-8888" },
  { id: "optima", nombre: "Óptima", telefono: "269-5000" },
] as const;

export type AseguradoraId = (typeof ASEGURADORAS)[number]["id"] | "";

export const TELEFONO_TRANSITO = "104";

export const DOCUMENTOS = [
  { id: "foto_dano", label: "Fotos del daño", hint: "Pieza por pieza y de varios ángulos." },
  { id: "fud", label: "FUD", hint: "Cuando el otro carro acepta la culpa y el daño es leve." },
  { id: "parte", label: "Parte policivo", hint: "Placa, cédula, fecha del choque y de la audiencia." },
  { id: "resolucion", label: "Resolución de tránsito", hint: "Se retira después de la audiencia." },
  { id: "cedula", label: "Cédula", hint: "Copia de quien manejaba." },
  { id: "licencia", label: "Licencia", hint: "Copia de quien manejaba." },
  { id: "registro", label: "Registro vehicular", hint: "Sale de la ficha del carro." },
  { id: "foto_reparado", label: "Fotos del carro reparado", hint: "Cuando ya salió del taller." },
  { id: "cotizacion", label: "Cotización o facturas", hint: "Lo que se lleva a la aseguradora." },
  { id: "finiquito", label: "Finiquito", hint: "El monto que la aseguradora va a pagar." },
] as const;

export type DocTipo = (typeof DOCUMENTOS)[number]["id"];

export type Pieza = {
  id: string;
  pieza: string;
  condicion: "nueva" | "reparar";
  precio: number;
  /** Precio de la pieza con descuento. Vacío si el monto se escribió a mano. */
  precioPieza?: number;
  /** Mano de obra del listado. En Kia es la de Hyundai. */
  manoObra?: number;
  extra: boolean;
};

export type DocumentoCaso = {
  id: string;
  tipo: DocTipo;
  nombre: string;
  path: string;
};

export type Caso = {
  v: 1;
  seccion: Seccion;
  via: "fud" | "parte" | null;
  lugar: string;
  relato: string;
  aseguradora: AseguradoraId;
  numeroReclamo: string;
  numeroParte: string;
  fechaAudiencia: string;
  fechaAudiencia2: string;
  lugarAudiencia: string;
  conductor: string;
  cedulaConductor: string;
  placaCupo: string;
  asistencia: string;
  numeroTramite: string;
  ajustador: string;
  montoFiniquito: number | null;
  fechaPago: string;
  motivoNoProcede: string;
  observaciones: string;
  acuerdoFirmado: boolean;
  clienteId: string | null;
  clienteNombre: string;
  contratoId: string | null;
  piezas: Pieza[];
  documentos: DocumentoCaso[];
  avisoOficina: string | null;
  avisoAudiencia: string | null;
  /** Día en que entró a la sección actual. Vacío en casos viejos: se cuenta desde el choque. */
  seccionDesde: string;
  /** Lo abrió el chat de cartera. El carro sigue trabajando hasta que alguien lo confirme. */
  porConfirmar: boolean;
  conversacionId: string | null;
};

export type CasoFila = {
  id: string;
  vehiculoId: string;
  fecha: string;
  km: number | null;
  caso: Caso;
  numero: string;
  placa: string;
  marca: string;
  modelo: string;
  anio: number | null;
  empresa: string;
  estadoCarro: string;
};

export type Poliza = {
  id: string;
  vehiculoId: string;
  vence: string;
  aseguradora: AseguradoraId;
  numero: string;
  path: string | null;
  numeroCarro: string;
  placa: string;
  empresa: string;
};

export function etiquetaSeccion(id: string): string {
  return SECCIONES.find((s) => s.id === id)?.label ?? id;
}

export function nombreAseguradora(id: string): string {
  return ASEGURADORAS.find((a) => a.id === id)?.nombre ?? "";
}

export function telefonoAseguradora(id: string): string {
  return ASEGURADORAS.find((a) => a.id === id)?.telefono ?? "";
}

export function tonoSeccion(id: string): "good" | "warn" | "crit" | "neutral" | "azul" | "purpura" {
  if (id === "pagado") return "good";
  if (id === "no_procede") return "crit";
  if (id === "audiencia" || id === "resolucion") return "warn";
  if (id === "seguimiento" || id === "facturas") return "azul";
  if (id === "cita") return "purpura";
  return "neutral";
}

/** El parte pasa por audiencia. El FUD salta a las facturas. */
export function siguienteSeccion(caso: Pick<Caso, "seccion" | "via">): Seccion | null {
  const via = caso.via ?? "fud";
  const orden: Seccion[] =
    via === "parte"
      ? ["reportado", "cita", "audiencia", "resolucion", "facturas", "seguimiento", "pagado"]
      : ["reportado", "cita", "facturas", "seguimiento", "pagado"];
  const i = orden.indexOf(caso.seccion);
  if (i < 0 || i === orden.length - 1) return null;
  return orden[i + 1] ?? null;
}

export function queSigue(caso: Caso): string {
  if (caso.porConfirmar) {
    return "El cliente avisó un choque por WhatsApp. Lea el chat y confirme el choque o descártelo. Mientras tanto el carro sigue trabajando.";
  }
  if (caso.seccion === "reportado") {
    if (!caso.via) return "Elija si el otro aceptó la culpa (FUD) o hay que llamar a tránsito (parte).";
    if (caso.via === "fud") {
      const tel = telefonoAseguradora(caso.aseguradora);
      return tel
        ? `Pásele al cliente el teléfono de ${nombreAseguradora(caso.aseguradora)}: ${tel}.`
        : "Elija la aseguradora y pásele ese teléfono al cliente.";
    }
    return `El cliente llama a tránsito al ${TELEFONO_TRANSITO}. Nadie aceptó la culpa, hay lesionados, daño mecánico, grúa, o el otro carro es taxi o de empresa.`;
  }
  if (caso.seccion === "cita") {
    return "Cite al cliente a Juan Díaz el mismo día o, a más tardar, dos días después del choque. Ahí se toman las fotos y se recibe el FUD o el parte.";
  }
  if (caso.seccion === "audiencia") {
    return caso.fechaAudiencia
      ? "Avise al cliente y a Santiago dos o tres días antes de la audiencia."
      : "Anote la fecha y el lugar de la audiencia. El cliente tiene que ir.";
  }
  if (caso.seccion === "resolucion") {
    return "Cuando pase la audiencia, retire la resolución en el juzgado. Sin eso no se abre el reclamo.";
  }
  if (caso.seccion === "facturas") {
    return caso.via === "parte"
      ? "Cargue las piezas y el precio. Si es parte policivo, el cliente firma el acuerdo con esos montos."
      : "Cargue las piezas y el precio. Con FUD el cobro es a la aseguradora.";
  }
  if (caso.seccion === "seguimiento") {
    return caso.numeroReclamo
      ? "Siga el reclamo con ese número hasta que llegue el finiquito."
      : "Anote el número de reclamo que dio la aseguradora.";
  }
  if (caso.seccion === "pagado") return "La aseguradora pagó. El caso queda guardado para consultarlo.";
  return caso.motivoNoProcede
    ? "El reclamo no procede. El motivo queda en el caso."
    : "Anote por qué no procede.";
}

export function casoVacio(): Caso {
  return {
    v: 1,
    seccion: "reportado",
    via: null,
    lugar: "",
    relato: "",
    aseguradora: "",
    numeroReclamo: "",
    numeroParte: "",
    fechaAudiencia: "",
    fechaAudiencia2: "",
    lugarAudiencia: "",
    conductor: "",
    cedulaConductor: "",
    placaCupo: "",
    asistencia: "",
    numeroTramite: "",
    ajustador: "",
    montoFiniquito: null,
    fechaPago: "",
    motivoNoProcede: "",
    observaciones: "",
    acuerdoFirmado: false,
    clienteId: null,
    clienteNombre: "",
    contratoId: null,
    piezas: [],
    documentos: [],
    avisoOficina: null,
    avisoAudiencia: null,
    seccionDesde: "",
    porConfirmar: false,
    conversacionId: null,
  };
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function monto(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function piezaGuardada(p: Pieza): Pieza {
  const precioPieza = monto(p.precioPieza);
  const manoObra = monto(p.manoObra);
  return {
    id: p.id,
    pieza: p.pieza,
    condicion: p.condicion === "reparar" ? "reparar" : "nueva",
    precio: Number(p.precio) || 0,
    extra: Boolean(p.extra),
    ...(precioPieza != null ? { precioPieza } : {}),
    ...(manoObra != null ? { manoObra } : {}),
  };
}

export function parseCaso(raw: string | null | undefined): Caso | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<Caso>;
    if (j?.v !== 1) return null;
    const base = casoVacio();
    const seccion = SECCIONES.some((s) => s.id === j.seccion) ? (j.seccion as Seccion) : "reportado";
    const via = j.via === "fud" || j.via === "parte" ? j.via : null;
    const aseguradora = ASEGURADORAS.some((a) => a.id === j.aseguradora)
      ? (j.aseguradora as AseguradoraId)
      : "";
    return {
      ...base,
      ...j,
      v: 1,
      seccion,
      via,
      aseguradora,
      lugar: texto(j.lugar),
      relato: texto(j.relato),
      numeroReclamo: texto(j.numeroReclamo),
      numeroParte: texto(j.numeroParte),
      fechaAudiencia: texto(j.fechaAudiencia),
      fechaAudiencia2: texto(j.fechaAudiencia2),
      lugarAudiencia: texto(j.lugarAudiencia),
      conductor: texto(j.conductor),
      cedulaConductor: texto(j.cedulaConductor),
      placaCupo: texto(j.placaCupo),
      asistencia: texto(j.asistencia),
      numeroTramite: texto(j.numeroTramite),
      ajustador: texto(j.ajustador),
      fechaPago: texto(j.fechaPago),
      motivoNoProcede: texto(j.motivoNoProcede),
      observaciones: texto(j.observaciones),
      clienteNombre: texto(j.clienteNombre),
      montoFiniquito: typeof j.montoFiniquito === "number" ? j.montoFiniquito : null,
      acuerdoFirmado: Boolean(j.acuerdoFirmado),
      clienteId: j.clienteId ?? null,
      contratoId: j.contratoId ?? null,
      avisoOficina: j.avisoOficina ?? null,
      avisoAudiencia: j.avisoAudiencia ?? null,
      seccionDesde: texto(j.seccionDesde),
      porConfirmar: Boolean(j.porConfirmar),
      conversacionId: typeof j.conversacionId === "string" ? j.conversacionId : null,
      piezas: Array.isArray(j.piezas) ? j.piezas.filter((p) => p && p.pieza).map(piezaGuardada) : [],
      documentos: Array.isArray(j.documentos) ? j.documentos.filter((d) => d && d.path) : [],
    };
  } catch {
    return null;
  }
}

export function cerrado(seccion: Seccion): boolean {
  return seccion === "pagado" || seccion === "no_procede";
}

export function diasEnSeccion(fila: Pick<CasoFila, "fecha" | "caso">, hoy: string): number {
  return Math.max(0, diasEntre(fila.caso.seccionDesde || fila.fecha, hoy));
}

/** Días que puede quedarse un caso en cada sección antes de avisar. */
const PLAZO: Partial<Record<Seccion, number>> = {
  reportado: 1,
  cita: 2,
  resolucion: 10,
  facturas: 7,
  seguimiento: 15,
};

/** Por qué el caso está trabado, o null si va a tiempo. */
export function atraso(fila: Pick<CasoFila, "fecha" | "caso">, hoy: string): string | null {
  const { caso } = fila;
  if (cerrado(caso.seccion)) return null;
  if (caso.porConfirmar) return null;
  if (caso.seccion === "audiencia") {
    const ultima = caso.fechaAudiencia2 || caso.fechaAudiencia;
    if (ultima && ultima < hoy) return `La audiencia fue el ${fechaCorta(ultima)}: pase a esperar la resolución.`;
    if (!caso.fechaAudiencia && diasEnSeccion(fila, hoy) > 3) return "Sin fecha de audiencia: anótela.";
    return null;
  }
  const plazo = PLAZO[caso.seccion];
  const dias = diasEnSeccion(fila, hoy);
  if (plazo == null || dias <= plazo) return null;
  if (caso.seccion === "seguimiento") return `${dias} días en seguimiento sin finiquito: llame a la aseguradora.`;
  if (caso.seccion === "resolucion") return `${dias} días esperando la resolución: retírela en el juzgado.`;
  if (caso.seccion === "facturas") return `${dias} días armando facturas: complete y presente el reclamo.`;
  return `${dias} días en ${etiquetaSeccion(caso.seccion).toLowerCase()}.`;
}

export function totalPiezas(piezas: Pieza[]): number {
  return piezas.reduce((s, p) => s + (Number(p.precio) || 0), 0);
}

export function fechaCorta(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
