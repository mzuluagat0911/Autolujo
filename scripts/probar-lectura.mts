// Si el modelo barato se cae, el de respaldo tiene que leer igual.
//   npm run probar:lectura

import { conRespaldo } from "@/lib/ai/comprobante";

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

const floja = (n: number) => n < 0;
const mejor = (a: number, b: number) => (b > a ? b : a);

const clara = await conRespaldo({
  etiqueta: "test-clara",
  primaria: async () => 60,
  respaldo: async () => {
    throw new Error("no debía llamarse");
  },
  floja,
  mejor,
});
check("lectura clara no pide respaldo", clara, 60);

let usoRespaldo = false;
const caida = await conRespaldo({
  etiqueta: "test-caida",
  primaria: async () => {
    throw new Error("modelo caído");
  },
  respaldo: async () => {
    usoRespaldo = true;
    return 60;
  },
  floja,
  mejor,
});
check("si el barato se cae, gana el respaldo", caida, 60);
check("el respaldo sí se llamó", usoRespaldo, true);

const flojaPrimero = await conRespaldo({
  etiqueta: "test-floja",
  primaria: async () => -1,
  respaldo: async () => 60,
  floja,
  mejor,
});
check("lectura floja se reemplaza por la del respaldo", flojaPrimero, 60);

const quedaLaPrimera = await conRespaldo({
  etiqueta: "test-respaldo-caido",
  primaria: async () => -1,
  respaldo: async () => {
    throw new Error("respaldo caído");
  },
  floja,
  mejor,
});
check("si solo el respaldo se cae, queda la primera lectura", quedaLaPrimera, -1);

let exploto = false;
try {
  await conRespaldo({
    etiqueta: "test-ambos",
    primaria: async () => {
      throw new Error("uno");
    },
    respaldo: async () => {
      throw new Error("dos");
    },
    floja,
    mejor,
  });
} catch {
  exploto = true;
}
check("si los dos se caen, el error sube para que WhatsApp reintente", exploto, true);

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s)`);
  process.exit(1);
}
console.log("\nTodo en verde");
