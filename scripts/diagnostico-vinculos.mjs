// Diagnóstico SOLO LECTURA de la vinculación WhatsApp → cliente → contrato.
// Mide cuántos clientes son inalcanzables o ambiguos, y con cuántos el match
// por sufijo (el que había antes) podía devolver a la persona equivocada.
//   node scripts/diagnostico-vinculos.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Espejo de lib/cartera/telefono.ts
function normalizar(valor) {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 8) return "507" + d;
  if (d.startsWith("507")) return d.length === 11 ? d : null;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

const { data: clientes } = await sb.from("clientes").select("id, nombre, whatsapp, telefono");
const { data: contratos } = await sb
  .from("contratos")
  .select("cliente_id")
  .eq("estado", "activo");

const porNumero = new Map();
const sinNumero = [];
const noNormalizables = [];

for (const c of clientes ?? []) {
  const bruto = c.whatsapp ?? c.telefono;
  if (!bruto) { sinNumero.push(c); continue; }
  const n = normalizar(bruto);
  if (!n) { noNormalizables.push(c); continue; }
  if (!porNumero.has(n)) porNumero.set(n, []);
  porNumero.get(n).push(c);
}

const colisiones = [...porNumero.entries()].filter(([, v]) => v.length > 1);

const contratosPorCliente = new Map();
for (const c of contratos ?? []) {
  contratosPorCliente.set(c.cliente_id, (contratosPorCliente.get(c.cliente_id) ?? 0) + 1);
}
const variosContratos = [...contratosPorCliente.entries()].filter(([, n]) => n > 1);

// El match viejo: ilike '%<numero>' sobre whatsapp y telefono, con limit(1).
// Cuenta a cuántos clientes distintos podía llegar cada número entrante.
let riesgoSufijo = 0;
for (const n of porNumero.keys()) {
  const alcanzados = new Set();
  for (const c of clientes ?? []) {
    for (const campo of [c.whatsapp, c.telefono]) {
      if (campo && String(campo).endsWith(n)) alcanzados.add(c.id);
    }
  }
  if (alcanzados.size > 1) riesgoSufijo++;
}

console.log(`Clientes: ${clientes?.length ?? 0}`);
console.log(`  sin número:             ${sinNumero.length}`);
console.log(`  número no normalizable: ${noNormalizables.length}`);
console.log(`  números únicos:         ${porNumero.size}`);

if (noNormalizables.length || sinNumero.length) {
  console.log(`\nA corregir en clientes (hoy son inalcanzables por WhatsApp):`);
  for (const c of [...noNormalizables, ...sinNumero]) {
    console.log(`  ${c.nombre} → whatsapp="${c.whatsapp ?? ""}" telefono="${c.telefono ?? ""}"`);
  }
}
console.log(`\nColisiones (un mismo número en varios clientes): ${colisiones.length}`);
for (const [n, v] of colisiones.slice(0, 10)) {
  console.log(`  ${n} → ${v.map((c) => c.nombre).join(" | ")}`);
}
console.log(`\nClientes con más de un contrato activo: ${variosContratos.length}`);
console.log(`Números que con el match por sufijo llegaban a >1 cliente: ${riesgoSufijo}`);
