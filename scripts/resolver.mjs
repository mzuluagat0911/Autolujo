// Resolver para correr los scripts de prueba con Node directamente.
//
// El código de la app usa imports sin extensión ("./fecha") y el alias "@/",
// que resuelve el bundler de Next. Node no hace ninguna de las dos cosas. En
// vez de ensuciar la app con extensiones .ts para que Node esté contento, el
// ajuste vive aquí.
//
//   node --experimental-strip-types --import ./scripts/resolver.mjs archivo.ts

import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

const RAIZ = new URL("../", import.meta.url);
const EXTENSIONES = [".ts", ".tsx", ".mjs", ".js", ".json"];

function archivoReal(url) {
  const ruta = fileURLToPath(url);
  if (existsSync(ruta) && statSync(ruta).isFile()) return pathToFileURL(ruta).href;
  for (const ext of EXTENSIONES) {
    if (existsSync(ruta + ext)) return pathToFileURL(ruta + ext).href;
  }
  for (const ext of EXTENSIONES) {
    const indice = `${ruta}/index${ext}`;
    if (existsSync(indice)) return pathToFileURL(indice).href;
  }
  return null;
}

export function resolve(especificador, contexto, siguiente) {
  let url = null;
  if (especificador.startsWith("@/")) {
    url = new URL(especificador.slice(2), RAIZ);
  } else if (especificador.startsWith("./") || especificador.startsWith("../")) {
    url = new URL(especificador, contexto.parentURL ?? RAIZ.href);
  }

  if (url) {
    const resuelto = archivoReal(url);
    if (resuelto) return { url: resuelto, shortCircuit: true };
  }
  return siguiente(especificador, contexto);
}

// Auto-registro: basta con `--import ./scripts/resolver.mjs`.
if (!process.env.__RESOLVER_AUTOLUJO) {
  process.env.__RESOLVER_AUTOLUJO = "1";
  register(import.meta.url, import.meta.url);
}
