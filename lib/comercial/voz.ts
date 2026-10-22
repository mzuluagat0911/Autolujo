const SIGUE = "¿Le queda mejor Juan Díaz o La Chorrera? Le dejo la visita y el equipo le cierra allá.";

const QUIEN = "Soy Lucía, de Auto Lujo. ¿Le queda mejor la visita en Juan Díaz o en La Chorrera?";

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

const RANGO_ABONO =
  "El abono va de $99.99 a $350, según el año. ¿Le queda mejor Juan Díaz o La Chorrera?";
const KIA =
  "La letra de $25 es el Hyundai Grand i10 2020. El Kia Soluto empieza en 2024. ¿Le queda mejor Juan Díaz o La Chorrera?";
const AUTOMATICO =
  "El automático se confirma en la visita, porque no siempre hay. ¿Le queda mejor Juan Díaz o La Chorrera?";

function pisoAbonoMal(texto: string): boolean {
  return /abono[^.\n]{0,60}desde\s*\$?\s*350\b/i.test(texto) || /desde\s*\$?\s*350\b[^.\n]{0,40}abono/i.test(texto);
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
  "Las llantas las asume usted durante todo el contrato: el desgaste lo hace quien conduce. El carro se entrega con sus llantas. ¿Le dejo la visita en Juan Díaz o en La Chorrera?";
const COLISION =
  "Si hay una colisión, avíseme de inmediato y el equipo le indica el paso. ¿Le dejo la visita en Juan Díaz o en La Chorrera?";
const RECIBO =
  "El recibo es de agua, luz, teléfono o cable. En la visita confirman de quién puede estar. ¿Le dejo la visita en Juan Díaz o en La Chorrera?";
const CUPO =
  "Le aparto el sábado a las 9 a. m., o el domingo en Juan Díaz. El domingo solo abre allá. ¿Cuál le sirve?";
const PAGOS =
  "La letra es diaria. Si le queda mejor, puede adelantar la semana, la quincena o el mes. No manejamos pagos atrasados. ¿Le queda mejor Juan Díaz o La Chorrera?";
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

function corrigeRespuestaComercial(texto: string, cliente: string): string {
  const c = plano(cliente);
  const t = plano(texto);
  const faltaRequisitos = pideRequisitos(cliente) && !respondeRequisitos(texto);
  const malPago = ofrecePagoMal(texto) || (clientePideMensual(cliente) && !explicaPago(texto));
  if (faltaRequisitos && malPago) return REQUISITOS_Y_PAGOS;
  if (faltaRequisitos) return REQUISITOS;
  if (malPago) return PAGOS;
  if (cotizaAutomatico(texto)) return AUTOMATICO;
  if (kiaFueraDeCatalogo(texto)) return KIA;
  if (pisoAbonoMal(texto)) return RANGO_ABONO;
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

/** Lo que sale a WhatsApp. Lucía no se presenta como sistema ni repite al cliente. */
export function mensajeNaturalLucia(mensaje: string, ultimoCliente?: string | null): string {
  let texto = quitaAdornos(corrigeLetraI10(mensaje.replace(/\s+/g, " ").trim()));
  texto = corrigeRespuestaComercial(texto, ultimoCliente ?? "");
  if (!texto) return "¿Qué carro está buscando?";
  if (ultimoCliente && esEco(texto, ultimoCliente)) return SIGUE;
  if (admiteMaquina(texto)) return QUIEN;
  if (anunciaTraspaso(texto) || suenaARecepcion(texto)) return SIGUE;
  return texto;
}
