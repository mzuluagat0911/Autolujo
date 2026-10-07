// Fase 5 en sombra. No mueve dinero.
//   npm run probar:aprendizaje

import { encode } from "jpeg-js";
import { aplicarEnEsteNivel } from "@/lib/cartera/activacion-cruce";
import {
  ajustarPesos,
  aliasQueCalza,
  montoLejosDeLaLetra,
  PESOS_INICIALES,
  rankearAprendizaje,
  textoAprendizaje,
  type AliasAprendido,
} from "@/lib/cartera/aprendizaje-cruce";
import { distanciaHuella, huellaDesdeBytes, huellaPerceptual, mismaImagen, pngDeRgba } from "@/lib/cartera/huella-imagen";
import { decidirMovimiento, type ContratoFlota, type PagoCandidato } from "@/lib/cartera/cruce";
import { partirNotaSombra, puntuarMovimiento, type CandidatoSombra } from "@/lib/cartera/puntaje-cruce";
import { instantePanama } from "@/lib/cartera/fecha";

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

function lienzo(pintar: (x: number, y: number) => number) {
  const ancho = 32;
  const alto = 32;
  const rgba = new Uint8Array(ancho * alto * 4);
  const gris = new Uint8Array(ancho * alto);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const v = pintar(x, y);
      const i = y * ancho + x;
      gris[i] = v;
      const o = i * 4;
      rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
  }
  return { ancho, alto, rgba, gris };
}

const gradual = lienzo((x) => Math.round((x / 31) * 255));
const jpegAlto = encode({ data: gradual.rgba, width: gradual.ancho, height: gradual.alto }, 90).data;
const jpegBajo = encode({ data: gradual.rgba, width: gradual.ancho, height: gradual.alto }, 30).data;
const huellaAlta = huellaDesdeBytes(jpegAlto);
const huellaBaja = huellaDesdeBytes(jpegBajo);
check("la recompresión JPEG deja la misma captura cerca", mismaImagen(huellaAlta, huellaBaja), true);

const invertido = lienzo((x) => 255 - Math.round((x / 31) * 255));
const huellaInvertida = huellaPerceptual(invertido.gris, invertido.ancho, invertido.alto);
check(
  "otra imagen queda lejos",
  huellaAlta != null && huellaInvertida != null && distanciaHuella(huellaAlta, huellaInvertida) > 10,
  true,
);

const png = pngDeRgba(gradual.ancho, gradual.alto, gradual.rgba);
check(
  "un PNG lee la misma huella que sus pixeles",
  huellaDesdeBytes(png),
  huellaPerceptual(gradual.gris, gradual.ancho, gradual.alto),
);

let pesos = { ...PESOS_INICIALES };
for (let i = 0; i < 30; i++) {
  pesos = ajustarPesos(pesos, { senales: ["alias", "carro", "referencia_exacta"], resultado: "acierto" });
}
check("el alias aprendido tiene tope", pesos.alias, 18);
check("aprender no mueve el peso del carro", pesos.carro, 35);
check("aprender no mueve la referencia exacta", pesos.referencia_exacta, 40);

const alias: AliasAprendido = {
  tipo: "remitente",
  valor: "NELSON REYES",
  contratoId: "c312",
  numero: "312",
  veces: 2,
  vigente: true,
};
check("un alias de una sola vez no se usa", aliasQueCalza([{ ...alias, veces: 1 }], "Nelson Reyes", null), null);
check("el remitente confirmado dos veces sí calza", aliasQueCalza([alias], "Nelson Reyes", null)?.numero, "312");

check("36 contra letra 31 no es anomalía", montoLejosDeLaLetra(36, 31), false);
check("letra más Penonomé no es anomalía", montoLejosDeLaLetra(56, 31), false);
check("un monto muy por encima de la letra sí avisa", montoLejosDeLaLetra(200, 31), true);

function candidato(pagoId: string, contratoId: string, numero: string, fechaPeso: number): CandidatoSombra {
  const senales = [
    { codigo: "carro", peso: 35, detalle: `Carro ${numero}` },
    { codigo: "monto", peso: 25, detalle: "Monto exacto." },
    { codigo: "fecha", peso: fechaPeso, detalle: "Fecha." },
    { codigo: "empresa", peso: 10, detalle: "Misma empresa." },
  ];
  return {
    pagoId,
    contratoId,
    numero,
    puntaje: senales.reduce((s, n) => s + n.peso, 0),
    bloqueado: false,
    bloqueos: [],
    senales,
  };
}

const primero = candidato("p1", "c312", "312", 15);
const segundo = candidato("p2", "c67", "67", 5);
const rank = rankearAprendizaje({
  candidatos: [primero, segundo],
  aliases: [alias],
  pesos,
  nombre: "Nelson Reyes",
  descripcion: null,
  letra: 31,
  monto: 36,
  refAjena: false,
  imagenParecida: false,
  sombraTipo: "revision",
  sombraPagoId: "p1",
});
check("con alias y carro el ranking puede pedir automático", rank.tipo, "automatico");
check("esa recomendación no coincide con una sombra en revisión", rank.coincide, false);
check("el texto deja claro que no mueve dinero", textoAprendizaje(rank).includes("No mueve dinero."), true);

const EMP = "emp-autolujo";
const flota: ContratoFlota[] = [
  { contratoId: "c-144", letra: 30, numero: "144", clienteNombre: "Edgar Joel Bonilla", empresaId: EMP },
];
const extracto = { empresaId: EMP, numeroCuenta: "0412345678" };
const pago: PagoCandidato = {
  id: "p1",
  contratoId: "c-144",
  empresaId: EMP,
  monto: 30,
  pagadoAt: instantePanama("2026-09-01", 15, 0).toISOString(),
  numeroCarro: null,
  cuentaDestino: "****5678",
  origen: "comprobante",
  referencia: "99887766",
};
const soloTexto = {
  monto: 30,
  fecha: "2026-09-01",
  numeroCarro: null,
  nombre: null,
  referencia: null,
  descripcion: "pago ref 99887766",
};
const motorTexto = decidirMovimiento(soloTexto, [pago], flota, extracto);
const sombraTexto = puntuarMovimiento(soloTexto, [pago], flota, extracto, motorTexto);
const puerta = aplicarEnEsteNivel(motorTexto, sombraTexto);
check("la referencia solo en el texto sigue retenida", puerta.retenido, true);
check("el ranking no es un argumento de la llave", aplicarEnEsteNivel(motorTexto, sombraTexto).aplicar, false);

const nota = partirNotaSombra(`Cruce perfecto\nSombra: automático 90 · coincide · Carro\n${textoAprendizaje(rank)}`);
check("la nota separa la sombra del aprendizaje", nota.sombra?.startsWith("Sombra:"), true);
check("el aprendizaje no se mezcla en la sombra", nota.sombra?.includes("Aprendizaje:"), false);
check("el aprendizaje queda en su propia línea", nota.aprendizaje?.startsWith("Aprendizaje:"), true);

if (fallos > 0) {
  console.error(`\n${fallos} pruebas fallaron`);
  process.exit(1);
}
console.log("\n✅ Aprendizaje en sombra en verde.");
