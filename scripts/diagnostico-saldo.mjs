// Diagnóstico SOLO LECTURA del estado del devengo y los saldos.
// Responde: ¿existen cargos de renta? ¿hasta qué día llega el devengo?
// ¿cuántos contratos activos tienen saldo en cero?
//   node scripts/diagnostico-saldo.mjs

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

const hoy = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Panama",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const { count: activos } = await sb
  .from("contratos")
  .select("*", { count: "exact", head: true })
  .eq("estado", "activo");

const { data: cargos } = await sb.from("cargos").select("tipo, fecha, monto");
const porTipo = {};
for (const g of cargos ?? []) {
  porTipo[g.tipo] = (porTipo[g.tipo] ?? 0) + 1;
}
const rentas = (cargos ?? []).filter((g) => g.tipo === "renta");
const ultimaRenta = rentas.map((g) => g.fecha).sort().at(-1) ?? null;

const { data: saldos } = await sb.from("vw_saldo_contrato").select("contrato_id, saldo_actual");
const enCero = (saldos ?? []).filter((s) => Number(s.saldo_actual ?? 0) <= 0).length;
const total = (saldos ?? []).reduce((a, s) => a + Number(s.saldo_actual ?? 0), 0);

console.log(`Hoy en Panamá: ${hoy}\n`);
console.log(`Contratos activos: ${activos ?? 0}`);
console.log(`Cargos por tipo:`, porTipo);
console.log(`Cargos de renta: ${rentas.length}  ·  último día devengado: ${ultimaRenta ?? "NINGUNO"}`);
console.log(`\nSaldos (todos los contratos): ${saldos?.length ?? 0}`);
console.log(`  con saldo <= 0: ${enCero}`);
console.log(`  suma de saldos: $${total.toFixed(2)}`);

// ¿Desde cuándo hay datos? Define desde qué día tiene sentido devengar sin
// duplicar lo que ya venía dentro de contratos.saldo_inicial.
const { data: primerCon } = await sb
  .from("contratos")
  .select("created_at")
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();
const { data: ultimoPago } = await sb
  .from("pagos")
  .select("fecha")
  .order("fecha", { ascending: false })
  .limit(1)
  .maybeSingle();
console.log(`\nPrimer contrato migrado: ${primerCon?.created_at?.slice(0, 10) ?? "—"}`);
console.log(`Último pago registrado:  ${ultimoPago?.fecha ?? "—"}`);

// fecha_inicio = FEC_INGRES del control (cuándo entró el conductor), NO la fecha
// de corte del saldo. Si fuera reciente para todos, el backfill los saltaría.
const { data: inicios } = await sb
  .from("contratos")
  .select("fecha_inicio")
  .eq("estado", "activo");
const fechas = (inicios ?? []).map((c) => c.fecha_inicio).filter(Boolean).sort();
const posteriores = fechas.filter((f) => f > "2026-08-27").length;
console.log(
  `fecha_inicio de contratos activos: ${fechas.at(0)} → ${fechas.at(-1)}  ` +
    `(${posteriores} empiezan después del 27-ago)`,
);

if (!ultimaRenta) {
  console.log(
    `\n⚠️  No hay ningún cargo de renta: el saldo NO incluye las cuotas diarias.\n` +
      `   Corre la migración 0008 y el cron /api/cron/devengo.`,
  );
} else if (ultimaRenta < hoy) {
  console.log(`\n⚠️  El devengo va atrasado: última cuota cargada el ${ultimaRenta}, hoy es ${hoy}.`);
} else {
  console.log(`\n✅ El devengo está al día.`);
}
