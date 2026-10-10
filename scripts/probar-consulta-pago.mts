// Día que el cliente nombra → la base manda. Sin red.
//   npm run probar:consulta-pago

import {
  armarConsulta,
  corregirRespuestaPago,
  diasDePagoMencionados,
  type PagoDia,
} from "@/lib/cartera/consulta-pago";

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}\n     obtenido ${JSON.stringify(obtenido)}`);
}

const HOY = "2026-10-10";
const AYER = "2026-10-09";

const pagoAyer: PagoDia = {
  monto: 30,
  pagadoAt: "2026-10-09T11:09:00.000Z",
  fecha: AYER,
  estado: "conciliado",
};

console.log("\n· Qué día nombró");
check("anoche es ayer", diasDePagoMencionados("Hola si anoche les cancele", HOY).dias.map((d) => d.fecha), [AYER]);
check("antier", diasDePagoMencionados("pagué antier", HOY).dias[0]?.fecha, "2026-10-08");
check("sin día", diasDePagoMencionados("ya les pagué", HOY).dias.length, 0);
check("sin día habla", diasDePagoMencionados("ya les pagué", HOY).habla, true);
check("no es pago", diasDePagoMencionados("hola", HOY).habla, false);

console.log("\n· Héctor: anoche sí está, hoy es aparte");
const mapa = new Map<string, PagoDia[]>([[AYER, [pagoAyer]]]);
const c = armarConsulta(diasDePagoMencionados("Hola si anoche les cancele", HOY), mapa, HOY);
check("confirma", c?.modo, "confirmar");
check("frase nombra ayer", /ayer sí está/.test(c?.frase ?? ""), true);
check("frase separa hoy", /hoy es aparte/.test(c?.frase ?? ""), true);
check(
  "niega y se corrige",
  corregirRespuestaPago("No me aparece ningún pago de anoche. Mándeme la foto.", c),
  c?.frase,
);
check(
  "si ya lo dijo bien, se queda",
  /ayer/.test(corregirRespuestaPago("Sí, el pago de ayer sí está. Lo de hoy es aparte.", c)),
  true,
);

console.log("\n· Sin día, pregunta");
const q = armarConsulta(diasDePagoMencionados("ya les pagué", HOY), new Map(), HOY);
check("pregunta", q?.modo, "preguntar");
check(
  "no niega a ciegas",
  corregirRespuestaPago("No me aparece ningún pago.", q),
  q?.frase,
);

console.log("\n· Día vacío");
const n = armarConsulta(diasDePagoMencionados("pagué antier", HOY), new Map(), HOY);
check("niega", n?.modo, "negar");

if (fallos) {
  console.log(`\n❌ ${fallos} casos fallaron.`);
  process.exit(1);
}
console.log("\n✅ Consulta de pago en verde.");
