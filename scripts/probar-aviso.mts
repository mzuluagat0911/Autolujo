// El WAV de aviso tiene que ser un archivo PCM válido (respaldo de Safari/Firefox).
//   npm run probar:aviso

import { wavAvisoUri } from "@/lib/aviso-asesor";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: string) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const uri = wavAvisoUri();
check("es data URI wav", uri.startsWith("data:audio/wav;base64,"));

const b64 = uri.slice("data:audio/wav;base64,".length);
const buf = Buffer.from(b64, "base64");
check("cabecera RIFF", buf.subarray(0, 4).toString("ascii") === "RIFF");
check("formato WAVE", buf.subarray(8, 12).toString("ascii") === "WAVE");
check("tiene bloque fmt", buf.subarray(12, 16).toString("ascii") === "fmt ");
check("PCM 16-bit (formato 1)", buf.readUInt16LE(20) === 1 && buf.readUInt16LE(34) === 16);
check("mono", buf.readUInt16LE(22) === 1);
check("no está vacío", buf.length > 44 + 1000);

const dataSize = buf.readUInt32LE(40);
check("el tamaño data cuadra", dataSize === buf.length - 44);

console.log(fallos === 0 ? `\n✅ WAV de aviso válido.` : `\n❌ ${fallos} fallos.`);
process.exit(fallos === 0 ? 0 : 1);
