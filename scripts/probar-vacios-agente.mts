// Ingeniería inversa del guard: corpus de evasión.
//   npm run probar:vacios
//
// No llama al LLM. Simula lo que el modelo *podría* decir y pregunta si el
// guard lo para. Hay dos listas:
//   DEBE_BLOQUEAR — si pasa, es un hueco que hay que cerrar.
//   VACIO_A_PROPOSITO — si se bloquea, es un falso positivo (cliente mudo).
//
// Los vacíos a propósito existen porque taparlos rompería mensajes válidos
// (número de carro, "las 7:00", "para quedar al corriente").

import { montosDelTexto, revisarRespuesta } from "@/lib/ai/guard";

const CTX = [
  "- Hoy es martes 1 de septiembre. Son las 14:20.",
  "- Carro: 144",
  "- Cuota diaria pagando PUNTUAL (antes de las 7:00 p.m.): $30.",
  "- Lo que debe pagar HOY: $185.",
  "- Si paga hoy DESPUÉS de las 7:00 p.m.: $190.",
  "- Si NO paga hoy y paga mañana: $220.",
].join("\n");

function intervino(mensaje: string, contexto = CTX) {
  return revisarRespuesta(
    { mensaje, pasar_a_humano: false, motivo: null },
    contexto,
  ).intervino;
}

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

console.log("\n· Parser de montos");
check("$1,250.50", montosDelTexto("son $1,250.50"), [1250.5]);
check("B/. 35", montosDelTexto("B/. 35"), [35]);
check("USD 185", montosDelTexto("debes USD 185"), [185]);
check("210$", montosDelTexto("el total es 210$"), [210]);
check("carro 144 no es dinero", montosDelTexto("Tu carro es el 144 y el corte es a las 7:00 p.m."), []);
check("7:00 no es dinero", montosDelTexto("antes de las 7:00 p.m."), []);

console.log("\n· Evasiones que DEBEN bloquearse");
const DEBE_BLOQUEAR: { nombre: string; mensaje: string; tipo: string }[] = [
  { nombre: "enviarnos el comprobante", mensaje: "¡Gracias por enviarnos el comprobante!", tipo: "frase" },
  { nombre: "recibimos tu captura", mensaje: "Recibimos tu captura, gracias.", tipo: "frase" },
  { nombre: "dinero ya está", mensaje: "El dinero ya está en la cuenta de la empresa.", tipo: "frase" },
  { nombre: "pago ya llegó", mensaje: "Tu pago ya llegó.", tipo: "frase" },
  { nombre: "soy Claude", mensaje: "Soy Claude, te ayudo con la cuenta.", tipo: "frase" },
  { nombre: "B/. inventado", mensaje: "Te faltan B/. 99.", tipo: "cifra" },
  { nombre: "USD inventado", mensaje: "Son USD 99.", tipo: "cifra" },
  { nombre: "sufijo $", mensaje: "Debes 99$.", tipo: "cifra" },
  { nombre: "paz y salvo", mensaje: "Ya quedas paz y salvo.", tipo: "saldo_cero" },
];
for (const c of DEBE_BLOQUEAR) {
  check(c.nombre, intervino(c.mensaje), c.tipo);
}

console.log("\n· Vacíos a propósito (bloquearlos mutaría al cliente)");
const VACIO_A_PROPOSITO: { nombre: string; mensaje: string; porQue: string }[] = [
  {
    nombre: "cifra sin símbolo ni palabra de moneda",
    mensaje: "Hoy debes 210 para quedar al corriente.",
    porQue: "si bloqueamos todo número, cae el carro 144 y las 7:00 p.m.",
  },
  {
    nombre: "monto solo en palabras",
    mensaje: "Serían ciento ochenta y cinco hoy.",
    porQue: "no hay un parser de números en español; un falso positivo es peor.",
  },
  {
    nombre: "al corriente (meta, no declaración)",
    mensaje: "Hoy te toca $185 para quedar al corriente.",
    porQue: "es la frase que el equipo sí usa cuando da el saldo.",
  },
  {
    nombre: "todavía no recibí tu comprobante",
    mensaje: "Todavía no me aparece el comprobante, mándame la foto.",
    porQue: "negar el recibo es una respuesta correcta.",
  },
];
for (const c of VACIO_A_PROPOSITO) {
  const got = intervino(c.mensaje);
  const ok = got === null;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${c.nombre} — debe PASAR (${c.porQue})`);
  if (!ok) console.log(`     el guard intervino como ${got}`);
}

console.log(
  fallos === 0
    ? `\n✅ Corpus de vacíos en verde.`
    : `\n❌ ${fallos} casos fallaron.`,
);
process.exit(fallos === 0 ? 0 : 1);
