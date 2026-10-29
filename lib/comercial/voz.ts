import { pideAsesorHumano } from "./lead";
import { esClicDeAnuncio } from "./bienvenida";
import { esSaludoCorto, mensajeSaludoConCita } from "./cita-pedido";
import { fechaMencionada, preguntaSiAbreFeriado, textoFeriado } from "./feriados";

const SIGUE = "Cuénteme qué carro le llama más y le dejo la visita en la sede que le quede.";

const QUIEN = "Soy Lucía, de Auto Lujo. ¿Qué carro está buscando?";

function plano(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function anunciaTraspaso(texto: string): boolean {
  return /compa[nñ]er[oa]|lo paso con|le paso con|le transfier|enseguida le escriben|un humano|un agente|asistente virtual/i.test(
    texto,
  );
}

function admiteMaquina(texto: string): boolean {
  return /inteligencia artificial|\buna ia\b|\bun bot\b|\brobot\b|asistente virtual|soy un agente|soy una agente/i.test(
    texto,
  );
}

function suenaARecepcion(texto: string): boolean {
  return /en que (le |te )?puedo ayudar|como (le |te )?puedo ayudar|como te puedo ayudar/i.test(plano(texto));
}

function esEco(mensaje: string, cliente: string): boolean {
  const a = plano(mensaje);
  const b = plano(cliente);
  if (!a || !b || b.length < 25) return false;
  return a === b || a.includes(b) || b.includes(a);
}

const KIA =
  "La letra de $25 es el Hyundai Grand i10 2020. El Kia Soluto empieza en 2024. ¿Cuál de los dos le llama más?";
const AUTOMATICO =
  "El automático se confirma en la visita, porque no siempre hay. ¿Cuál carro le llama más?";

/** Corrige el piso en la misma frase. $350 sigue siendo el techo, nunca el desde. */
function corrigePisoAbono(texto: string): string {
  if (!/abono/i.test(texto)) return texto;
  const antes = texto;
  let out = texto.replace(/desde\s*\$?\s*350\b/gi, "desde $99.99");
  if (!/\b202[0-7]\b/.test(out)) {
    out = out.replace(/(abono[^.\n]{0,40}?)desde\s*\$?\s*100\b/gi, "$1desde $99.99");
  }
  if (out === antes || out.includes("?")) return out;
  return `${out} Las letras van desde $25. ¿Qué carro le llama más?`;
}

function kiaFueraDeCatalogo(texto: string): boolean {
  return texto.split(/(?<=[.?!])\s+/).some((frase) => {
    const q = plano(frase);
    if (!/\bkia\b|\bsoluto\b/.test(q)) return false;
    const anioViejo = /\b2020\b|\b2021\b|\b2022\b|\b2023\b/.test(q);
    const letra25 = /\$\s*25\b|\bdesde 25\b/.test(q);
    if (!anioViejo && !letra25) return false;
    if (/hyundai/.test(q) && /soluto desde 2024|kia soluto desde 2024/.test(q) && !letra25) return false;
    return true;
  });
}

function cotizaAutomatico(texto: string): boolean {
  const q = plano(texto);
  if (!/automatic/.test(q)) return false;
  if (/se confirma en la visita/.test(q) && !/\$/.test(texto)) return false;
  return /\$|\btenemos\b|\blo tenemos\b|\bdisponible\b|\babono\b|\bletra\b|\b\d{2}\b/.test(q);
}

/** El automático 2027 del Grand i10 es $35. $33 es el manual. */
export function corrigeLetraI10(texto: string): string {
  const partes = texto.split(/(\.\s+|,\s+y\s+)/i);
  const hayI10 = /grand i10|\bi ?10\b|\bi10\b/.test(plano(texto));
  return partes
    .map((parte, i) => {
      if (i % 2 === 1) return parte;
      const p = plano(parte);
      const esI10 = /grand i10|\bi ?10\b|\bi10\b/.test(p) || hayI10;
      const auto = /automatic/.test(p);
      const manual = /manual/.test(p);
      if (!esI10 || !/2027/.test(p) || !auto) return parte;
      if (manual) return parte.replace(/(autom[aá]tic[oa][^$]{0,50})\$\s*33\b/gi, "$1$35");
      return parte.replace(/\$\s*33\b/g, "$35");
    })
    .join("");
}

const LLANTAS =
  "Las llantas las asume usted durante todo el contrato: el desgaste lo hace quien conduce. El carro se entrega con sus llantas. ¿Qué carro le interesa ver?";
const COLISION =
  "Si hay una colisión, avíseme de inmediato y el equipo le indica el paso. ¿Sigue con la visita para ver el carro?";
const RECIBO =
  "El recibo es de agua, luz, teléfono o cable. En la visita confirman de quién puede estar. ¿De qué lugar nos escribe?";
const CUPO =
  "Le aparto el sábado a las 9 a. m., o el domingo en Juan Díaz. El domingo solo abre allá. ¿Cuál le sirve?";
const PAGOS =
  "La letra es diaria. Si le queda mejor, puede adelantar la semana, la quincena o el mes. No manejamos pagos atrasados. ¿Qué carro le interesa?";
const REQUISITOS =
  "Para adquirir el carro necesita récord policivo, paz y salvo e historial de tránsito, un recibo de agua, luz, teléfono o cable, licencia panameña, cédula o carnet vigente, el abono y ser mayor de 25. ¿De qué lugar es usted?";
const REQUISITOS_Y_PAGOS =
  "Para adquirir el carro necesita récord policivo, paz y salvo e historial de tránsito, un recibo de agua, luz, teléfono o cable, licencia panameña, cédula o carnet vigente, el abono y ser mayor de 25. La letra es diaria; la semana, la quincena y el mes se pagan por adelantado, y no hay pagos atrasados. ¿De qué lugar es usted?";

function pideRequisitos(cliente: string): boolean {
  const c = plano(cliente);
  return /requisit|que necesito|que se necesita|para adquirir|que documentos|que piden|para sacar el carro/.test(c);
}

function respondeRequisitos(texto: string): boolean {
  const q = plano(texto);
  const marcas = [ /record policivo|paz y salvo/.test(q), /licencia/.test(q), /cedula|carnet/.test(q), /mayor de 25|25 anos/.test(q) ].filter(Boolean).length;
  return marcas >= 2;
}

function explicaPago(texto: string): boolean {
  const q = plano(texto);
  return /adelantad/.test(q) && /no manejamos pagos atrasad|no hay pagos atrasad|no contamos con pagos atrasad|sin pagos atrasad/.test(q);
}

function ofrecePagoMal(texto: string): boolean {
  const q = plano(texto);
  if (/facilidad de pago|pago mensual|pagos mensual|mensualidad/.test(q)) return !explicaPago(texto);
  if (/pagos atrasad|pago atrasad/.test(q) && !/no manejamos|no hay|no contamos|sin pagos/.test(q)) return true;
  return false;
}

function clientePideMensual(cliente: string): boolean {
  const c = plano(cliente);
  return /facilidad de pago|pago mensual|pagos mensual|mensualidad|pagos atrasad|pagar atrasad/.test(c);
}

const ZONA_FUERA =
  /\baguadulce\b|\bnat[aá]\b|\bchitr[eé]\b|\bchiriqu[ií]\b|\bdavid\b|\bsantiago\b|\blas tablas\b|\bbocas\b/i;
const ZONA_VISITA =
  /\bveracruz\b|\barraij[aá]n\b|\bchorrera\b|\bjuan diaz\b|\bpanam[aá]\b|\bsan miguelito\b|\btocumen\b|\bpacora\b|\bchepo\b|\bcol[oó]n\b|\br[ií]o hato\b|\bcoronado\b|\bcapira\b|\bbetania\b|\bchanis\b|\balbrook\b|\bhoward\b|\bburunga\b/i;
const SIN_COBERTURA =
  "Lamentablemente por el momento no tenemos cobertura en esa zona. Guardamos su contacto y, apenas ampliemos la zona, le avisamos. Gracias por su interés.";
const MENOR =
  "Para aplicar hay que tener 25 años cumplidos. Con menos de eso no podemos seguir el proceso. Cuando cumpla 25, aquí quedo para agendarle la visita.";
const ENGANCHE_80 =
  "Ese aviso de $80 es para que venga a ver los carros. El resto del abono se financia, y en la sede le explican cómo queda. ¿Qué carro le llama más?";
const TELEFONO =
  "Claro. El teléfono de la asesora en Panamá es 6878-4560. La puede llamar, y también la esperan en la sede. ¿Qué carro le interesa ver?";
export const MENSAJE_ASESOR =
  "Claro. El teléfono de la asesora en Panamá es 6878-4560. Un compañero le escribe por aquí.";
const RETIRO = "Entendido. Aquí quedo por si más adelante quiere ver el carro. Que le vaya bien.";
const USADOS =
  "Sí, hay usados de poco kilometraje, de 2026 y 2027, y según el anuncio también puede haber cero kilómetros. ¿Cuál año le llama más?";
const CATALOGO =
  "Según disponibilidad hay Hyundai Grand i10 y Kia Soluto. En la visita le muestran lo que hay. ¿Cuál le llama más?";
const VISITA_CERCA =
  "Claro, de ahí sí puede venir a la sede. ¿Le queda mejor La Chorrera o Juan Díaz?";
const FOTO_CARRO =
  "La vi. Ese carro se confirma en la visita. Del i10 2020 la letra es $25; del 2024, $30. ¿Cuál le llama más?";
const DOCS_CHAT =
  "Sí, mándelos por aquí y el equipo los revisa. Igual lo esperamos en la cita con los originales.";
const INCLUYE =
  "En la letra van los feriados a media cuenta, el mantenimiento de esa fila y el día de cumpleaños si el año lo trae. El seguro se explica en la visita. ¿Qué año le interesa?";
const ABONO_FLEX =
  "El abono de la tabla es el de esa fila. Uno mayor o partido se conversa en la visita; no le armo otra letra por aquí. ¿Le agendo para verlo?";
const RIO =
  "Rio no lo tenemos. El Kia que manejamos es el Soluto, desde 2024. ¿Le llama más ese o el Grand i10?";
const GRACIAS =
  "Cuando quiera me escribe y le dejo la visita. Que le vaya bien.";
const MANANA_HORAS =
  "Por la mañana le dejo las 8, las 9 o las 10. ¿Cuál le sirve?";
const TARDE_HORAS =
  "Por la tarde le dejo la 1, las 2 o las 3. ¿Cuál le sirve?";

const FILAS_LETRA: { anio: number; letra: number; cuotas: number; anios: string }[] = [
  { anio: 2027, letra: 33, cuotas: 1275, anios: "unos 3 años y medio" },
  { anio: 2026, letra: 31, cuotas: 1275, anios: "unos 3 años y medio" },
  { anio: 2025, letra: 30, cuotas: 1275, anios: "unos 3 años y medio" },
  { anio: 2024, letra: 30, cuotas: 1275, anios: "unos 3 años y medio" },
  { anio: 2023, letra: 30, cuotas: 1095, anios: "unos 3 años" },
  { anio: 2022, letra: 27, cuotas: 915, anios: "unos 2 años y medio" },
  { anio: 2020, letra: 25, cuotas: 730, anios: "unos 2 años" },
];

type OpcionesVoz = {
  hayCita?: boolean;
  hayHistorial?: boolean;
  citaFecha?: string | null;
  citaHora?: string | null;
  citaSede?: string | null;
  hoy?: string;
  ahora?: string;
};

function filaDe(texto: string): (typeof FILAS_LETRA)[number] | null {
  const anio = texto.match(/\b(202[0-7])\b/);
  if (!anio) return null;
  return FILAS_LETRA.find((f) => f.anio === Number(anio[1])) ?? null;
}

function conCierreVisita(frase: string, hayCita: boolean): string {
  if (!hayCita) return frase;
  const limpio = frase
    .replace(/\s*¿Le agendo(?: la visita)?(?: para verlo)?\??/gi, "")
    .replace(/\s*¿Le dejo la visita[^?]*\??/gi, "")
    .replace(/\s*¿Sigue con la visita[^?]*\??/gi, "")
    .replace(/\s*¿A qué hora le queda(?: bien)?\??/gi, "")
    .replace(/\s*¿Qué día le queda(?: mejor)?\??/gi, "")
    .replace(/\s*¿Le queda mejor (?:Juan Díaz o La Chorrera|La Chorrera o Juan Díaz)\??/gi, "")
    .trim();
  return limpio || "¿Qué más quiere saber del carro?";
}

function cumpleVeinticincoPronto(cliente: string): boolean {
  const q = plano(cliente);
  return /voy a cumplir|ya casi|proximamente|este mes cumplo|cumplo 25|cumple 25/.test(q);
}

function edadMenor(cliente: string): boolean {
  if (cumpleVeinticincoPronto(cliente)) return false;
  const n = cliente.match(/\b(\d{2})\s*a[nñ]os\b/i);
  if (n) {
    const edad = Number(n[1]);
    if (edad >= 16 && edad < 25) return true;
  }
  return /menor de 25|menos de 25|no tengo 25|todavia no cumplo/i.test(plano(cliente));
}

function afirmaCobertura(texto: string): boolean {
  const q = plano(texto);
  return /tenemos cobertura|si hasta|hasta alla|hasta ahi|le agendo|puede pasar|le dejo la visita|le queda mejor/.test(q);
}

function niegaCobertura(texto: string): boolean {
  return /no tenemos cobertura|no contamos con cobertura|fuera de (zona|cobertura)|no llegamos (hasta|alla|ahi)/i.test(
    texto,
  );
}

function mantenimientoSegunAnio(texto: string, cliente: string): string | null {
  const junto = `${cliente} ${texto}`;
  if (!/mantenim/i.test(junto)) return null;
  if (!/todo el contrato|durante todo el contrato|todos los anos|siempre incluidos/i.test(plano(texto))) return null;
  const anio = junto.match(/\b(202[0-7])\b/);
  if (!anio) {
    return "El mantenimiento gratis depende del año: del 2024 al 2027 son 12, el 2023 son 6, y el 2022 y el 2020 no lo traen. ¿Qué año le interesa?";
  }
  const y = Number(anio[1]);
  if (y >= 2024) return "Ese año trae 12 mantenimientos, no durante todo el contrato. ¿Le interesa verlo en la sede?";
  if (y === 2023) return "El 2023 trae 6 mantenimientos, no durante todo el contrato. ¿Le interesa verlo?";
  return "Ese año no trae mantenimiento incluido. ¿Quiere que veamos un año que sí lo trae?";
}

function pideAniosContrato(cliente: string): boolean {
  const c = plano(cliente);
  return (
    /cuantos a[nñ]os|a[nñ]os (seria|dura|es|del) contrato|duracion del contrato|plazo del contrato|a que plazo|en cuantos a[nñ]os/.test(c)
    || (/contrato/.test(c) && /a[nñ]os/.test(c))
    || (/opcion a compra/.test(c) && /a[nñ]os|plazo|cuantos/.test(c))
  );
}

function pideQuincena(cliente: string): boolean {
  return /quincen|cada 15|quince dias|15 dias/.test(plano(cliente));
}

function pideUsados(cliente: string): boolean {
  return /usad[oa]s?|son nuevos|cero kilomet|0 km|kilometr/.test(plano(cliente));
}

function pideCatalogo(cliente: string): boolean {
  return /que carros|catalogo|modelos hay|carros hay|que vehicul|que tienen (disponible|en sede|de carros)/.test(
    plano(cliente),
  );
}

function aniosDelContrato(texto: string, cliente: string, hayCita: boolean): string | null {
  if (!pideAniosContrato(cliente)) return null;
  const t = plano(texto);
  if (/a[nñ]os/.test(t) && /\d{3,4}/.test(t)) return conCierreVisita(texto, hayCita);
  const m = texto.match(/(\d{3,4})\s*cuotas/i);
  const n = m ? Number(m[1]) : null;
  const filaTabla = filaDe(`${cliente} ${texto}`);
  const fila =
    n === 1095 ? { cuotas: 1095, anios: "unos 3 años" }
    : n === 915 ? { cuotas: 915, anios: "unos 2 años y medio" }
    : n === 730 ? { cuotas: 730, anios: "unos 2 años" }
    : n === 365 ? { cuotas: 365, anios: "1 año" }
    : filaTabla
      ? { cuotas: filaTabla.cuotas, anios: filaTabla.anios }
      : { cuotas: n && n > 200 ? n : 1275, anios: "unos 3 años y medio" };
  return conCierreVisita(
    `El contrato son ${fila.cuotas} cuotas diarias, ${fila.anios}. ¿Le agendo la visita para verlo?`,
    hayCita,
  );
}

function quincenaDelContrato(texto: string, cliente: string, hayCita: boolean): string | null {
  if (!pideQuincena(cliente)) return null;
  const fila = filaDe(`${cliente} ${texto}`);
  if (fila) {
    const quincena = fila.letra * 15;
    if (texto.includes(`$${quincena}`) || texto.includes(String(quincena))) {
      return conCierreVisita(texto, hayCita);
    }
    return conCierreVisita(
      `La quincena queda en $${quincena}, que es la letra de $${fila.letra} por 15 días. ¿Le agendo la visita para verlo?`,
      hayCita,
    );
  }
  if (/\$\s*\d+/.test(texto) && /quincen|15/.test(plano(texto))) return conCierreVisita(texto, hayCita);
  return conCierreVisita(
    "La quincena es la letra diaria por 15. Del i10 2020 son $375; del 2024, $450. ¿Qué año le interesa?",
    hayCita,
  );
}

function pideMandarDocs(cliente: string): boolean {
  const c = plano(cliente);
  return /mandar los documento|enviar los documento|adelantar(los)? documento|por (esta|aqui) (lin|via)|los documento x/.test(c);
}

function pideQueIncluye(cliente: string): boolean {
  const c = plano(cliente);
  return /que incluye|incluye (el )?seguro|\bel seguro\b|va (el )?seguro/.test(c);
}

function pideAbonoFlex(cliente: string): boolean {
  const c = plano(cliente);
  return /abono.+(cuota|semanal|partir|en pagos)|dar el abono|si (yo )?abono \d/.test(c);
}

function pideKiaRio(cliente: string): boolean {
  const c = plano(cliente);
  return /kia rio|\bdel rio\b/.test(c) && !/rio hato/.test(c);
}

function esAgradecimientoCierre(cliente: string): boolean {
  const c = plano(cliente);
  return /^(a ok |ok )?(listo )?(muchas )?gracias/.test(c) && c.length < 50;
}

function corrigeRespuestaComercial(texto: string, cliente: string, opts?: OpcionesVoz): string {
  const hayCita = Boolean(opts?.hayCita);
  const c = plano(cliente);
  const t = plano(texto);
  if (
    opts?.citaFecha
    && opts.hoy
    && opts.ahora
    && esSaludoCorto(cliente)
    && /cita (esta )?confirmad|lo esperamos|su cita/.test(t)
  ) {
    return mensajeSaludoConCita({
      fecha: opts.citaFecha,
      hora: opts.citaHora ?? "09:00",
      sede: opts.citaSede ?? "juan_diaz",
      hoy: opts.hoy,
      ahora: opts.ahora,
    });
  }
  if (pideAsesorHumano(cliente)) return MENSAJE_ASESOR;
  if (/\bno gracias\b|dejelo asi|ya no gracias/i.test(plano(cliente)) && /que dia|a que hora|le agendo|le queda mejor|cuenteme/i.test(t)) {
    return RETIRO;
  }
  if (edadMenor(cliente)) return MENOR;
  if (ZONA_FUERA.test(cliente) && afirmaCobertura(texto) && !niegaCobertura(texto)) {
    return SIN_COBERTURA;
  }
  if (ZONA_VISITA.test(cliente) && niegaCobertura(texto)) {
    return conCierreVisita(VISITA_CERCA, hayCita);
  }
  if (/\$?\s*80\b/.test(`${cliente} ${texto}`) && /no (lo |la |los )?tenemos|no contamos|no manejamos|no lo ofrecemos/i.test(texto)) {
    return ENGANCHE_80;
  }
  if (pideAsesorHumano(cliente) === false && /telefono|numero para llamar|un numero|deme un numero|su numero/.test(c) && !/6878/.test(texto)) {
    return TELEFONO;
  }
  const anios = aniosDelContrato(texto, cliente, hayCita);
  if (anios) return anios;
  const quincena = quincenaDelContrato(texto, cliente, hayCita);
  if (quincena) return quincena;
  if (pideUsados(cliente) && !/usad|kilometr|cero kilomet/.test(t)) {
    return conCierreVisita(USADOS, hayCita);
  }
  if (pideCatalogo(cliente) && !/hyundai|i10|soluto|disponib/.test(t)) {
    return conCierreVisita(CATALOGO, hayCita);
  }
  const mantenimiento = mantenimientoSegunAnio(texto, cliente);
  if (mantenimiento) return conCierreVisita(mantenimiento, hayCita);
  const faltaRequisitos = pideRequisitos(cliente) && !respondeRequisitos(texto);
  const malPago = ofrecePagoMal(texto) || (clientePideMensual(cliente) && !explicaPago(texto));
  if (faltaRequisitos && malPago) return conCierreVisita(REQUISITOS_Y_PAGOS, hayCita);
  if (faltaRequisitos) return conCierreVisita(REQUISITOS, hayCita);
  if (malPago) return conCierreVisita(PAGOS, hayCita);
  if (cotizaAutomatico(texto)) return conCierreVisita(AUTOMATICO, hayCita);
  if (kiaFueraDeCatalogo(texto)) return conCierreVisita(KIA, hayCita);
  if ((/llanta/.test(c) || /llanta/.test(t)) && !/asume usted|usted las paga|por su cuenta/.test(t)) {
    return conCierreVisita(LLANTAS, hayCita);
  }
  if (/colision|choque|siniestr|accidente/.test(c) && !/\bavis/.test(t)) return conCierreVisita(COLISION, hayCita);
  if (/recibo/.test(t) && /familiar/.test(t)) return conCierreVisita(RECIBO, hayCita);
  if (/cuando sepa|me avisa|cuando pueda|cuando tenga/.test(t)) return CUPO;
  if (/domingo/.test(c) && /chorrera/.test(t) && !/solo abre juan|solo juan diaz|domingo solo/.test(t)) {
    return conCierreVisita(`${texto} El domingo solo abre Juan Díaz.`, hayCita);
  }
  if (preguntaSiAbreFeriado(cliente) && !/feriado|juan diaz atiende/.test(t)) {
    const fecha = fechaMencionada(cliente, opts?.hoy ?? "") ?? opts?.hoy;
    return textoFeriado(fecha);
  }
  if (/por la manana|en la manana|de manana/.test(c) && /a que hora|en punto|a la media/.test(t) && !/\d/.test(c)) {
    return MANANA_HORAS;
  }
  if (/por la tarde|en la tarde|de tarde/.test(c) && /a que hora|en punto|a la media/.test(t) && !/\d/.test(c)) {
    return TARDE_HORAS;
  }
  if (/no (puedo|pude) ver (la )?foto|no puedo ver esa foto/.test(t)) return conCierreVisita(FOTO_CARRO, hayCita);
  if (pideMandarDocs(cliente) && /no[,.]|se (llevan|revisan) (directamente )?a la (sede|visita)|no (los )?mande/.test(t)) {
    return DOCS_CHAT;
  }
  if (pideQueIncluye(cliente) && !/feriados a media|media cuenta/.test(t)) {
    return conCierreVisita(INCLUYE, hayCita);
  }
  if (pideAbonoFlex(cliente) && /un solo pago|se entrega en un solo|no se (puede|parte)/.test(t)) {
    return conCierreVisita(ABONO_FLEX, hayCita);
  }
  if (pideKiaRio(cliente) && !/soluto/.test(t)) return conCierreVisita(RIO, hayCita);
  if (esAgradecimientoCierre(cliente) && /juan diaz o la chorrera|le agendo|que sede/.test(t)) {
    return GRACIAS;
  }
  if (hayCita && /le agendo|le dejo la visita|a que hora le queda|que dia le queda/.test(t) && clienteHablaDeTema(c)) {
    return conCierreVisita(texto, true);
  }
  return conCierreVisita(texto, hayCita);
}

function clienteHablaDeTema(c: string): boolean {
  return /usad|catalogo|carros|a[nñ]os|quincen|requisit|abono|letra|precio|como llegar|cobertura|agente|telefono|contrato|kilometr/.test(
    c,
  );
}

function quitaAdornos(texto: string): string {
  return texto.replace(/[❤♥♡#]+/g, "").replace(/\s+([,.!?])/g, "$1");
}

function conSaludo(texto: string, cliente: string): string {
  const m = cliente.trim().match(/^(buenos d[ií]as|buenas tardes|buenas noches|buen d[ií]a|hola)\b/i);
  if (!m) return texto;
  if (/^(buenos|buenas|hola|claro|perfecto|entendido)/i.test(texto.trim())) return texto;
  const crudo = m[1].toLowerCase();
  const saludo = crudo.startsWith("hola") ? "Hola." : `${crudo.charAt(0).toUpperCase()}${crudo.slice(1)}.`;
  return `${saludo} ${texto}`;
}

/** Lo que sale a WhatsApp. Lucía no se presenta como sistema ni repite al cliente. */
export function mensajeNaturalLucia(
  mensaje: string,
  ultimoCliente?: string | null,
  opts?: OpcionesVoz,
): string {
  const cliente = ultimoCliente ?? "";
  let texto = quitaAdornos(corrigeLetraI10(mensaje.replace(/\s+/g, " ").trim()));
  texto = corrigeRespuestaComercial(texto, cliente, opts);
  if (!texto) return "¿Qué carro está buscando?";
  if (cliente && esEco(texto, cliente)) texto = SIGUE;
  else if (admiteMaquina(texto)) texto = QUIEN;
  else if (anunciaTraspaso(texto) || suenaARecepcion(texto)) {
    texto = pideAsesorHumano(cliente) ? MENSAJE_ASESOR : SIGUE;
  }
  if (opts?.hayHistorial && esClicDeAnuncio(cliente) && /autolujo panam|tratamientodedatos/i.test(texto)) {
    texto = SIGUE;
  }
  return corrigePisoAbono(conSaludo(texto, cliente));
}
