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

const PREGUNTA_CONCRETA =
  /\?|cu[aá]nto|precio|letra|abono|requisit|cita|disponible|autom[aá]tic|manual|d[oó]nde|horario|a[nñ]os?|chiriqu|chitr[eé]|david|menor|familiar|plataforma|licencia|kia|hyundai|soluto|i-?10|picanto|sed[aá]n/i;

/** Primer contacto sin una pregunta concreta. «Hola» y «quiero carro» reciben la oferta. */
export function esSaludoDeClienteNuevo(
  historial: { direccion: "in" | "out"; texto: string }[],
): boolean {
  if (historial.some((m) => m.direccion === "out")) return false;
  const textos = historial
    .filter((m) => m.direccion === "in")
    .map((m) => m.texto.replace(/^🎤\s*/, "").trim())
    .filter(Boolean);
  if (textos.length === 0 || textos.length > 3) return false;
  const junto = textos.join(" ");
  if (junto.length > 180 || PREGUNTA_CONCRETA.test(junto)) return false;
  return true;
}
