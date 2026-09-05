// Casos del guard de salida del agente. Sin red ni base de datos.
//   npm run probar
//
// Lo que se está protegiendo: que no salga una cifra que el sistema no calculó,
// y que un mensaje legítimo NO se bloquee (escalar silencia al agente, así que
// un falso positivo deja mudo a un cliente).

import { revisarRespuesta } from "@/lib/ai/guard";

const CTX = [
  "- Hoy es martes 1 de septiembre. Son las 14:20.",
  "- Carro: 144",
  "- Cuota diaria pagando PUNTUAL (antes de las 7:00 p.m.): $30.",
  "- Si paga después del corte se le suman $5 (pierde el descuento de ESE día).",
  "- Días atrasados sin pagar quedan a tarifa plena ($35 por día, no $30).",
  "- Hoy NO tiene ningún pago registrado todavía.",
  "- Lo que debe pagar HOY: $185.",
  "- Si paga hoy DESPUÉS de las 7:00 p.m.: $190.",
  "- Si NO paga hoy y paga mañana: $220.",
].join("\n");

type Caso = {
  nombre: string;
  mensaje: string;
  escala?: boolean;
  contexto?: string;
  /** null = debe pasar sin cambios. */
  espera: string | null;
};

const CASOS: Caso[] = [
  // --- Debe DEJAR PASAR (falsos positivos = cliente mudo) -------------------
  { nombre: "cifra exacta del contexto", mensaje: "Hoy te toca $185 para quedar al corriente.", espera: null },
  { nombre: "cifra con decimales equivalentes", mensaje: "Son $185.00 en total.", espera: null },
  { nombre: "cifra escrita en palabras de moneda", mensaje: "Serían 185 dólares hoy.", espera: null },
  { nombre: "dos cifras, ambas del contexto", mensaje: "Si pagas antes de las 7 son $185; después, $190.", espera: null },
  { nombre: "sin cifras", mensaje: "Claro, la cuenta es de Banco General a nombre de la empresa.", espera: null },
  { nombre: "niega tener el pago registrado", mensaje: "Todavía no me aparece ningún pago registrado hoy.", espera: null },
  { nombre: "pide la foto del comprobante", mensaje: "Para aplicarlo, mándame la foto del comprobante por aquí.", espera: null },
  { nombre: "confirma un hecho en presente", mensaje: "Te confirmo que hoy sí corre cuota.", espera: null },
  { nombre: "número que no es dinero", mensaje: "Tu carro es el 144 y el corte es a las 7:00 p.m.", espera: null },
  { nombre: "escalada legítima ya marcada", mensaje: "Déjame revisarlo y en un momento te escribo.", escala: true, espera: null },

  // --- Debe BLOQUEAR --------------------------------------------------------
  { nombre: "cifra inventada", mensaje: "Tu saldo es de $210.", espera: "cifra" },
  { nombre: "cifra inventada entre válidas", mensaje: "Son $185 hoy, o $200 si esperas a mañana.", espera: "cifra" },
  { nombre: "suma hecha por el modelo", mensaje: "Con los 3 días serían $555.", espera: "cifra" },
  { nombre: "da el comprobante por recibido", mensaje: "¡Recibí tu comprobante! Lo aplicamos enseguida.", espera: "frase" },
  { nombre: "declara al cliente al día", mensaje: "Listo, quedas al día con eso.", espera: "frase" },
  { nombre: "da el pago por aplicado", mensaje: "Ya lo registramos en el sistema.", espera: "frase" },
  { nombre: "revela que es IA", mensaje: "Soy un asistente virtual de Auto Lujo.", espera: "frase" },
  { nombre: "emoji de robot", mensaje: "Con gusto te ayudo 🤖", espera: "frase" },
  { nombre: "saldo cero sin respaldo", mensaje: "No debes nada por ahora.", espera: "saldo_cero" },
  { nombre: "mensaje vacío", mensaje: "   ", espera: "vacio" },

  // --- Evasiones que el corpus original no cubría ----------------------------
  { nombre: "gracias por enviarnos el comprobante", mensaje: "¡Gracias por enviarnos el comprobante!", espera: "frase" },
  { nombre: "recibimos tu transferencia", mensaje: "Recibimos tu transferencia, ya quedó.", espera: "frase" },
  { nombre: "el dinero ya entró", mensaje: "El dinero ya entró a la cuenta.", espera: "frase" },
  { nombre: "el pago ya cruzó", mensaje: "Tu pago ya cruzó con el banco.", espera: "frase" },
  { nombre: "dice que es ChatGPT", mensaje: "Soy ChatGPT, del equipo de Auto Lujo.", espera: "frase" },
  { nombre: "niega ser persona", mensaje: "No soy una persona, pero te ayudo igual.", espera: "frase" },
  { nombre: "dice que es un programa", mensaje: "Soy un programa del equipo de Auto Lujo.", espera: "frase" },
  { nombre: "cifra con B/.", mensaje: "Tu saldo es B/. 210.", espera: "cifra" },
  { nombre: "cifra con USD", mensaje: "Debes USD 210 hoy.", espera: "cifra" },
  { nombre: "cifra con $ al final", mensaje: "El total es 210$.", espera: "cifra" },
  { nombre: "paz y salvo sin $0", mensaje: "Quedas paz y salvo.", espera: "saldo_cero" },
  { nombre: "B/. válido del contexto", mensaje: "Hoy te toca B/. 185.", espera: null },

  // --- Debe ESCALAR pero dejar salir el mensaje ------------------------------
  { nombre: "promesa sin escalar", mensaje: "Déjame confirmarlo y en un momento te escribo por aquí.", espera: "promesa" },
  { nombre: "revisar con el equipo (sin 'te escribo')", mensaje: "Lo voy a revisar con el equipo.", espera: "promesa" },
  { nombre: "déjame revisarlo con el equipo", mensaje: "Déjame revisarlo con el equipo y te confirmo.", espera: "promesa" },
  { nombre: "presentarse del equipo NO escala", mensaje: "Soy Marcela, del equipo de Auto Lujo.", espera: null },
  { nombre: "promesa de usted (se lo confirmo)", mensaje: "El saldo se lo confirmo en un momento.", espera: "promesa" },

  // --- Contexto sin cifras (conversación sin contrato vinculado) -------------
  { nombre: "sin contrato: cualquier cifra es inventada", mensaje: "Debes $30.", contexto: "El cliente está vinculado al Carro 144.", espera: "cifra" },
  { nombre: "sin contrato: sin cifras, pasa", mensaje: "¿Me confirmas el número de tu carro?", contexto: "El cliente está vinculado al Carro 144.", espera: null },

  // --- Saldo cero legítimo ---------------------------------------------------
  { nombre: "saldo cero con respaldo", mensaje: "Estás al día, no debes nada 🙌", contexto: "- Lo que debe pagar HOY: $0.", espera: null },
];

let fallos = 0;
for (const c of CASOS) {
  const r = revisarRespuesta(
    { mensaje: c.mensaje, pasar_a_humano: c.escala ?? false, motivo: null },
    c.contexto ?? CTX,
  );
  const ok = r.intervino === c.espera;
  if (!ok) fallos++;
  const esperado = c.espera ?? "pasa";
  const obtenido = r.intervino ?? "pasa";
  console.log(`${ok ? "✅" : "❌"} ${c.nombre} — esperado: ${esperado}, obtenido: ${obtenido}`);
  if (!ok && r.detalle) console.log(`     ${r.detalle}`);
}

console.log(
  fallos === 0
    ? `\n✅ ${CASOS.length} casos del guard en verde.`
    : `\n❌ ${fallos} de ${CASOS.length} casos fallaron.`,
);
process.exit(fallos === 0 ? 0 : 1);
