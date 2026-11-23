// Eval estático del router del asistente (fichas por pregunta + pantalla).
//   npm run probar:asistente

import { CASOS_EVAL } from "@/lib/asistente/eval-casos";
import { fichasPara } from "@/lib/asistente/router";

let ok = 0;
let fail = 0;

for (const c of CASOS_EVAL) {
  const { fichas } = fichasPara(c.pregunta, c.ruta ?? null);
  const faltan = c.fichas.filter((f) => !fichas.includes(f));
  if (faltan.length === 0) {
    ok += 1;
    console.log(`ok  ${c.id} → ${fichas.join(",")}`);
  } else {
    fail += 1;
    console.log(`FAIL ${c.id}`);
    console.log(`  pregunta: ${c.pregunta}`);
    console.log(`  ruta: ${c.ruta ?? "—"}`);
    console.log(`  esperaba: ${c.fichas.join(",")}`);
    console.log(`  obtuvo: ${fichas.join(",")}`);
    console.log(`  faltan: ${faltan.join(",")}`);
  }
}

console.log("");
console.log(`${ok}/${CASOS_EVAL.length} router ok · ${fail} fallos`);
console.log("Tools/tono: revisar a mano con el campo 'espera' de cada caso en lib/asistente/eval-casos.ts");

if (fail > 0) process.exit(1);
