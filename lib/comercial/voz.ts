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
const SIN_COBERTURA =
  "Lamentablemente por el momento no tenemos cobertura en esa zona. Guardamos su contacto y, apenas ampliemos la zona, le avisamos. Gracias por su interés.";
const MENOR =
  "Para aplicar hay que tener 25 años cumplidos. Con menos de eso no podemos seguir el proceso. Cuando cumpla 25, aquí quedo para agendarle la visita.";
const ENGANCHE_80 =
  "Ese aviso de $80 es para que venga a ver los carros. El resto del abono se financia, y en la sede le explican cómo queda. ¿Qué carro le llama más?";
const TELEFONO =
  "Claro. El teléfono de la asesora en Panamá es 6878-4560. La puede llamar, y también la esperan en la sede. ¿Qué carro le interesa ver?";
const RETIRO = "Entendido. Aquí quedo por si más adelante quiere ver el carro. Que le vaya bien.";

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

function corrigeRespuestaComercial(texto: string, cliente: string): string {
  const c = plano(cliente);
  const t = plano(texto);
  if (/\bno gracias\b|dejelo asi|ya no gracias/i.test(plano(cliente)) && /que dia|a que hora|le agendo|le queda mejor|cuenteme/i.test(t)) {
    return RETIRO;
  }
  if (edadMenor(cliente)) return MENOR;
  if (ZONA_FUERA.test(cliente) && afirmaCobertura(texto) && !/no tenemos cobertura|no contamos con cobertura/i.test(texto)) {
    return SIN_COBERTURA;
  }
  if (/\$?\s*80\b/.test(`${cliente} ${texto}`) && /no (lo |la |los )?tenemos|no contamos|no manejamos|no lo ofrecemos/i.test(texto)) {
    return ENGANCHE_80;
  }
  if (/telefono|que me llam|llameme|numero para llamar|un numero|deme un numero|su numero/.test(c) && !/6878/.test(texto)) {
    return TELEFONO;
  }
  const mantenimiento = mantenimientoSegunAnio(texto, cliente);
  if (mantenimiento) return mantenimiento;
  const faltaRequisitos = pideRequisitos(cliente) && !respondeRequisitos(texto);
  const malPago = ofrecePagoMal(texto) || (clientePideMensual(cliente) && !explicaPago(texto));
  if (faltaRequisitos && malPago) return REQUISITOS_Y_PAGOS;
  if (faltaRequisitos) return REQUISITOS;
  if (malPago) return PAGOS;
  if (cotizaAutomatico(texto)) return AUTOMATICO;
  if (kiaFueraDeCatalogo(texto)) return KIA;
  if ((/llanta/.test(c) || /llanta/.test(t)) && !/asume usted|usted las paga|por su cuenta/.test(t)) return LLANTAS;
  if (/colision|choque|siniestr|accidente/.test(c) && !/\bavis/.test(t)) return COLISION;
  if (/recibo/.test(t) && /familiar/.test(t)) return RECIBO;
  if (/cuando sepa|me avisa|cuando pueda|cuando tenga/.test(t)) return CUPO;
  if (/domingo/.test(c) && /chorrera/.test(t) && !/solo abre juan|solo juan diaz|domingo solo/.test(t)) {
    return `${texto} El domingo solo abre Juan Díaz.`;
  }
  return texto;
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
export function mensajeNaturalLucia(mensaje: string, ultimoCliente?: string | null): string {
  const cliente = ultimoCliente ?? "";
  let texto = quitaAdornos(corrigeLetraI10(mensaje.replace(/\s+/g, " ").trim()));
  texto = corrigeRespuestaComercial(texto, cliente);
  if (!texto) return "¿Qué carro está buscando?";
  if (cliente && esEco(texto, cliente)) texto = SIGUE;
  else if (admiteMaquina(texto)) texto = QUIEN;
  else if (anunciaTraspaso(texto) || suenaARecepcion(texto)) texto = SIGUE;
  return corrigePisoAbono(conSaludo(texto, cliente));
}
