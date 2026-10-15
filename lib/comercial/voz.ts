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

/** Lo que sale a WhatsApp. Lucía no se presenta como sistema ni repite al cliente. */
export function mensajeNaturalLucia(mensaje: string, ultimoCliente?: string | null): string {
  const texto = mensaje.replace(/\s+/g, " ").trim();
  if (!texto) return "¿Qué carro está buscando?";
  if (ultimoCliente && esEco(texto, ultimoCliente)) return SIGUE;
  if (admiteMaquina(texto)) return QUIEN;
  if (anunciaTraspaso(texto) || suenaARecepcion(texto)) return SIGUE;
  return texto;
}
