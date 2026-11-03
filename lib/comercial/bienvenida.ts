export const MENSAJE_BIENVENIDA = [
  "¡Hola! Soy Lucía de AUTOLUJO PANAMÁ, especialistas en alquiler de vehículos con opción a compra para que cumpla el sueño de tener su propio carro 🚗✨.",
  "Contamos con sedes en Ciudad de Panamá y La Chorrera 📍",
  "",
  "Al continuar con la conversación, está aceptando nuestra política de privacidad, que puede encontrar en este link: https://bit.ly/tratamientodedatosautolujopanama",
  "",
  "Ya tenemos Hyundai Grand i10 desde 2020 y Kia Soluto desde 2024, hasta 2027, con:",
  "",
  "✅ Letra desde $25 diarios en el Hyundai Grand i10 2020, de lunes a sábado. Los primeros tres domingos se pagan y a partir de ahí son libres",
  "✅ Mantenimientos incluidos según el año",
  "✅ Feriados a media cuenta",
  "✅ Día de cumpleaños libre en los años que lo traen 🎉",
  "✅ Servicio de alquiler con opción a compra",
  "✅ No revisamos APC",
  "✅ Abono inicial de $99.99 a $350, según el año",
  "✅ El automático se confirma en la visita",
  "",
  "Con gusto le brindamos toda la información y le ayudamos con el proceso 🙌",
  "",
  "¿Le dejo la visita en Juan Díaz o en La Chorrera? El equipo le cierra allá el carro.",
].join("\n");

const SIGUE_SIN_BIENVENIDA =
  "Con gusto. Letras desde $25 y abonos desde $99.99, según el año. ¿Qué carro le llama más?";

function pareceBienvenida(salida: string): boolean {
  return (
    salida.includes("tratamientodedatosautolujopanama")
    || (/autolujo panam/i.test(salida) && /letra desde/i.test(salida))
  );
}

/** El clic del anuncio de Meta. Si ya hay chat, no es una pregunta nueva. */
export function esClicDeAnuncio(texto: string): boolean {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return /^(hola )?(quiero mas informacion|mas informacion|me interesa|enviar mensaje|learn more|more info)[.!]*$/.test(
    t,
  );
}

/** Si la bienvenida ya salió, un "quiero información" no la vuelve a mandar. */
export function sinBienvenidaRepetida(
  salida: string,
  historial: { direccion: "in" | "out"; texto: string }[],
): string {
  const yaHablo = historial.some((m) => m.direccion === "out");
  if (yaHablo && pareceBienvenida(salida)) return SIGUE_SIN_BIENVENIDA;
  return salida;
}

/** Primer contacto: Lucía todavía no habló. Ahí sale la bienvenida, aunque pregunten precio o un modelo. */
export function esSaludoDeClienteNuevo(
  historial: { direccion: "in" | "out"; texto: string }[],
): boolean {
  if (historial.some((m) => m.direccion === "out")) return false;
  return historial.some((m) => m.direccion === "in" && m.texto.replace(/^🎤\s*/, "").trim());
}
