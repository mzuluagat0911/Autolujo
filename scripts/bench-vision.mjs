// Benchmark de modelos de VISIÓN para leer comprobantes.
// Mide precisión (por campo), latencia y costo real por comprobante.
//
// Uso:
//   1) Pon imágenes reales en  scripts/bench/comprobantes/  (jpg/png)
//   2) Llena  scripts/bench/ground-truth.json  con la verdad de cada imagen:
//        { "pago1.jpg": { "monto": 35.00, "fecha": "2026-08-20",
//                          "referencia": "123456", "banco": "Banco General" }, ... }
//   3) Corre:  node --env-file=.env.local scripts/bench-vision.mjs
//
// Solo necesita OPENROUTER_API_KEY con créditos.

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "bench", "comprobantes");
const GT_PATH = join(__dirname, "bench", "ground-truth.json");

// --- Candidatos (edítalos libremente). Precio $/1M tokens [input, output]. ---
const MODELOS = [
  { id: "google/gemini-2.5-flash",      precio: [0.30, 2.50] },
  { id: "google/gemini-2.5-flash-lite", precio: [0.10, 0.40] },
  { id: "openai/gpt-4o-mini",           precio: [0.15, 0.60] },
  { id: "openai/gpt-4.1-mini",          precio: [0.40, 1.60] },
  { id: "qwen/qwen2.5-vl-72b-instruct", precio: [0.25, 0.75] },
  { id: "anthropic/claude-haiku-4.5",   precio: [1.00, 5.00] },
];

const Schema = z.object({
  monto: z.number().nullable(),
  fecha: z.string().nullable(),
  referencia: z.string().nullable(),
  banco: z.string().nullable(),
  numero_carro: z.string().nullable(),
  cuenta_destino: z.string().nullable(),
  confianza: z.enum(["alta", "media", "baja"]),
});

const PROMPT = `Eres el asistente de cartera de una renta de autos en Panamá.
Te paso la captura de un comprobante de transferencia bancaria (Banco General y otros bancos panameños).
Extrae con precisión: monto en USD, fecha (YYYY-MM-DD), número de referencia, banco emisor,
número de carro/unidad (que el cliente escribe en el COMENTARIO del pago, ej. "CARRO 144" -> "144")
y cuenta destino. Si un dato no se ve claro, ponlo en null y baja la confianza. NO inventes valores.`;

const key = process.env.OPENROUTER_API_KEY;
if (!key) { console.error("❌ Falta OPENROUTER_API_KEY"); process.exit(1); }
if (!existsSync(DIR) || !existsSync(GT_PATH)) {
  console.error(`❌ Faltan datos de prueba.
  - Imágenes en: ${DIR}
  - Verdad en:   ${GT_PATH}
  (ver instrucciones al inicio de este archivo)`);
  process.exit(1);
}
const openrouter = createOpenRouter({ apiKey: key });
const gt = JSON.parse(readFileSync(GT_PATH, "utf8"));
const imgs = readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (imgs.length === 0) { console.error("❌ No hay imágenes en " + DIR); process.exit(1); }

const mime = (f) => (extname(f).toLowerCase() === ".png" ? "image/png" : "image/jpeg");
const normMonto = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100);
const normRef = (v) => (v == null ? null : String(v).replace(/[\s-]/g, "").toLowerCase());
const okMonto = (a, e) => normMonto(a) === normMonto(e);
const okFecha = (a, e) => a && e && String(a).slice(0, 10) === String(e).slice(0, 10);
const okRef = (a, e) => !e || normRef(a) === normRef(e);

async function correr(modelo) {
  let campos = { monto: 0, fecha: 0, referencia: 0, carro: 0 };
  let total = { monto: 0, fecha: 0, referencia: 0, carro: 0 };
  let ms = 0, costo = 0, fallos = 0, exactas = 0;

  for (const f of imgs) {
    const verdad = gt[f];
    if (!verdad) continue;
    const b64 = readFileSync(join(DIR, f)).toString("base64");
    const t0 = Date.now();
    try {
      const { object, usage } = await generateObject({
        model: openrouter(modelo.id),
        schema: Schema,
        maxOutputTokens: 800,
        messages: [{ role: "user", content: [
          { type: "text", text: PROMPT },
          { type: "image", image: `data:${mime(f)};base64,${b64}` },
        ]}],
      });
      ms += Date.now() - t0;
      const [pin, pout] = modelo.precio;
      costo += ((usage?.inputTokens ?? 0) * pin + (usage?.outputTokens ?? 0) * pout) / 1e6;

      const rM = okMonto(object.monto, verdad.monto);
      const rF = verdad.fecha ? okFecha(object.fecha, verdad.fecha) : null;
      const rR = okRef(object.referencia, verdad.referencia);
      const rC = verdad.numero_carro ? okRef(object.numero_carro, verdad.numero_carro) : null;
      if (verdad.monto != null) { total.monto++; if (rM) campos.monto++; }
      if (verdad.fecha) { total.fecha++; if (rF) campos.fecha++; }
      if (verdad.referencia) { total.referencia++; if (rR) campos.referencia++; }
      if (verdad.numero_carro) { total.carro++; if (rC) campos.carro++; }
      if (rM && (rF ?? true) && rR && (rC ?? true)) exactas++;
    } catch (e) {
      fallos++;
      console.error(`   [${modelo.id}] falló en ${f}: ${e?.message ?? e}`);
    }
  }
  const n = imgs.filter((f) => gt[f]).length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 100);
  return {
    id: modelo.id,
    montoPct: pct(campos.monto, total.monto),
    fechaPct: pct(campos.fecha, total.fecha),
    refPct: pct(campos.referencia, total.referencia),
    carroPct: pct(campos.carro, total.carro),
    exactasPct: pct(exactas, n),
    msProm: Math.round(ms / Math.max(n - fallos, 1)),
    costoPromedio: costo / Math.max(n - fallos, 1),
    fallos,
  };
}

console.log(`\n🔬 Benchmark de visión — ${imgs.filter((f)=>gt[f]).length} comprobantes\n`);
const res = [];
for (const m of MODELOS) {
  process.stdout.write(`  probando ${m.id} ... `);
  try { const r = await correr(m); res.push(r); console.log("ok"); }
  catch (e) { console.log("ERROR: " + (e?.message ?? e)); }
}

// Ranking: primero por comprobante EXACTO (los 3 campos), luego por costo.
res.sort((a, b) => b.exactasPct - a.exactasPct || a.costoPromedio - b.costoPromedio);

console.log("\n" + "=".repeat(96));
console.log("MODELO                                | Monto | Fecha | Ref  | Carro | EXACTO | Latencia | $/compr. | fallos");
console.log("-".repeat(108));
for (const r of res) {
  console.log(
    `${r.id.padEnd(37)} | ${String(r.montoPct).padStart(4)}% | ${String(r.fechaPct).padStart(4)}% | ` +
    `${String(r.refPct).padStart(3)}% | ${String(r.carroPct).padStart(4)}% | ${String(r.exactasPct).padStart(5)}% | ` +
    `${String(r.msProm).padStart(6)}ms | $${r.costoPromedio.toFixed(5)} | ${r.fallos}`,
  );
}
console.log("=".repeat(96));
if (res[0]) console.log(`\n🏆 Ganador (precisión→costo): ${res[0].id}\n   Monto es el campo crítico: prioriza el mejor % de Monto con costo razonable.\n`);
