// Filtro de "ok" / "gracias": Marcela no corre. Sin red.
//   npm run probar:charla

import { destinarCharla, normalizarCharla } from "@/lib/ai/filtro-charla";

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

console.log("\n· Normalizar");
check("ok con signos", normalizarCharla("OK!!"), "ok");
check("gracias con acento y emoji", normalizarCharla("¡Gracias! 🙏"), "gracias");
check("solo sticker emoji", normalizarCharla("👍"), "");

console.log("\n· Silencio (no gastar modelo)");
check("ok", destinarCharla("ok").destinar, "silencio");
check("OK...", destinarCharla("OK...").destinar, "silencio");
check("dale", destinarCharla("dale").destinar, "silencio");
check("listo", destinarCharla("listo").destinar, "silencio");
check("👍", destinarCharla("👍").destinar, "silencio");
check("jajaja", destinarCharla("jajaja").destinar, "silencio");
check("ok dale", destinarCharla("ok dale").destinar, "silencio");

console.log("\n· Gracias → respuesta fija, no Marcela");
check("gracias", destinarCharla("gracias"), { destinar: "canned", mensaje: "Con gusto" });
check("mil gracias", destinarCharla("¡Mil gracias!").destinar, "canned");
check("ok gracias", destinarCharla("ok gracias").destinar, "canned");

console.log("\n· SÍ va a Marcela");
check("cuánto debo", destinarCharla("cuanto debo").destinar, "agente");
check("gracias + saldo", destinarCharla("gracias, cuanto debo").destinar, "agente");
check("ok te paso el comprobante", destinarCharla("ok te paso el comprobante").destinar, "agente");
check("ya pagué", destinarCharla("ya pague").destinar, "agente");
check("no debo eso", destinarCharla("no debo eso").destinar, "agente");
check("hola", destinarCharla("hola").destinar, "agente");
check("buenos días", destinarCharla("buenos dias").destinar, "agente");
check("un párrafo", destinarCharla("mira te cuento que ayer no pude porque el niño estaba enfermo").destinar, "agente");

console.log("\n· Respuesta a una pregunta del agente");
const pregunta = "¿Me puedes mandar la foto del comprobante?";
check("sí a una pregunta", destinarCharla("si", pregunta).destinar, "agente");
check("ok a una pregunta", destinarCharla("ok", pregunta).destinar, "agente");
check("gracias a una pregunta sigue canned", destinarCharla("gracias", pregunta).destinar, "canned");
check("ok después de un saldo (sin pregunta)", destinarCharla("ok", "Hoy te toca $30.").destinar, "silencio");

console.log(fallos === 0 ? `\n✅ Todo en verde.` : `\n❌ ${fallos} casos fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
