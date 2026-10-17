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

function corrigeAbono(texto: string): string {
  if (!/abono/i.test(texto) || !/\b350\b/.test(texto)) return texto;
  return texto.replace(/\$\s*350\b/g, "$100").replace(/\b350\b/g, "100");
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
  "Las llantas las asume usted durante todo el contrato. ¿Le dejo la visita en Juan Díaz o en La Chorrera?";
const COLISION =
  "Si hay una colisión, avíseme de inmediato y el equipo le indica el paso. ¿Le dejo la visita en Juan Díaz o en La Chorrera?";
const RECIBO =
  "El recibo es de agua, luz, teléfono o cable. En la visita confirman de quién puede estar. ¿Le dejo la visita en Juan Díaz o en La Chorrera?";
const CUPO =
  "Le aparto el sábado a las 9 a. m., o el domingo en Juan Díaz. El domingo solo abre allá. ¿Cuál le sirve?";

function corrigeRespuestaComercial(texto: string, cliente: string): string {
  const c = plano(cliente);
  const t = plano(texto);
  if (/llanta/.test(c) && !/asume usted|usted las paga|por su cuenta/.test(t)) return LLANTAS;
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
  let texto = quitaAdornos(corrigeAbono(corrigeLetraI10(mensaje.replace(/\s+/g, " ").trim())));
  texto = corrigeRespuestaComercial(texto, ultimoCliente ?? "");
  if (!texto) return "¿Qué carro está buscando?";
  if (ultimoCliente && esEco(texto, ultimoCliente)) return SIGUE;
  if (admiteMaquina(texto)) return QUIEN;
  if (anunciaTraspaso(texto) || suenaARecepcion(texto)) return SIGUE;
  return texto;
}
