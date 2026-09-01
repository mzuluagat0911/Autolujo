// Diagnóstico SOLO LECTURA de los pagos y las cuentas de cobro.
// Sirve para saber si se puede poner el candado anti-duplicados por referencia
// y qué cuentas destino son legítimas.
//   node scripts/diagnostico-pagos.mjs

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

const { data: pagos } = await sb
  .from("pagos")
  .select("id, fecha, monto, referencia, banco, origen, metodo, estado_conciliacion, contrato_id");

console.log(`Pagos registrados: ${pagos?.length ?? 0}`);

const cuenta = (campo) => {
  const m = {};
  for (const p of pagos ?? []) m[p[campo] ?? "(null)"] = (m[p[campo] ?? "(null)"] ?? 0) + 1;
  return m;
};
console.log(`  por estado:`, cuenta("estado_conciliacion"));
console.log(`  por origen:`, cuenta("origen"));
console.log(`  por método:`, cuenta("metodo"));
console.log(`  sin contrato:`, (pagos ?? []).filter((p) => !p.contrato_id).length);

const conRef = (pagos ?? []).filter((p) => p.referencia && String(p.referencia).trim());
console.log(`\nPagos con referencia: ${conRef.length} de ${pagos?.length ?? 0}`);

const porRef = new Map();
for (const p of conRef) {
  const k = String(p.referencia).trim().toLowerCase();
  if (!porRef.has(k)) porRef.set(k, []);
  porRef.get(k).push(p);
}
const dups = [...porRef.entries()].filter(([, v]) => v.length > 1);
console.log(`Referencias repetidas: ${dups.length}`);
for (const [k, v] of dups.slice(0, 10)) {
  console.log(`  "${k}" ×${v.length} → ${v.map((p) => `${p.fecha} $${p.monto} [${p.estado_conciliacion}]`).join(" | ")}`);
}
console.log(
  dups.length === 0
    ? `\n✅ Sin duplicados: se puede crear el índice único por referencia.`
    : `\n⚠️  Hay duplicados: resolverlos antes de crear el índice único.`,
);

const { data: cuentas } = await sb
  .from("cuentas_bancarias")
  .select("numero_cuenta, banco, tipo, titular, empresa:empresas(codigo)");
console.log(`\nCuentas de cobro legítimas (${cuentas?.length ?? 0}):`);
for (const c of cuentas ?? []) {
  console.log(`  ${c.empresa?.codigo ?? "—"} · ${c.banco} · ${c.tipo} · ${c.numero_cuenta} · ${c.titular}`);
}
