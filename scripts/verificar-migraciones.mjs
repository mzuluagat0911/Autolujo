// Verificación SOLO LECTURA de que las migraciones 0008–0012 quedaron aplicadas.
//   node scripts/verificar-migraciones.mjs

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

const ok = (b) => (b ? "✅" : "❌");
let todoBien = true;
function check(etiqueta, condicion, detalle = "") {
  if (!condicion) todoBien = false;
  console.log(`${ok(condicion)} ${etiqueta}${detalle ? ` — ${detalle}` : ""}`);
}

// --- 0009: columnas generadas de teléfono -----------------------------------
const { data: cli, error: errCli } = await sb
  .from("clientes")
  .select("id, whatsapp, wa_norm, tel_norm");
if (errCli) {
  check("0009 · columnas wa_norm / tel_norm", false, errCli.message);
} else {
  const conNorm = cli.filter((c) => c.wa_norm || c.tel_norm).length;
  check("0009 · columnas wa_norm / tel_norm", true, `${conNorm} de ${cli.length} clientes normalizados`);
  const malos = cli.filter((c) => c.whatsapp && !c.wa_norm).length;
  console.log(`   ${malos} clientes con whatsapp que la función descartó (los teléfonos rotos).`);
}

// --- 0010: cuenta_destino + limpieza de duplicados ---------------------------
const { data: pagos, error: errPagos } = await sb
  .from("pagos")
  .select("id, referencia, cuenta_destino, estado_conciliacion");
if (errPagos) {
  check("0010 · columna cuenta_destino", false, errPagos.message);
} else {
  check("0010 · columna cuenta_destino", true);
  const porEstado = {};
  for (const p of pagos) porEstado[p.estado_conciliacion] = (porEstado[p.estado_conciliacion] ?? 0) + 1;
  const vivos = pagos.filter((p) => p.estado_conciliacion !== "rechazado" && p.referencia);
  const refs = new Set(vivos.map((p) => String(p.referencia).trim().toLowerCase()));
  check(
    "0010 · sin referencias duplicadas vivas",
    refs.size === vivos.length,
    `${vivos.length} pagos vivos con referencia, ${refs.size} referencias distintas`,
  );
  console.log(`   estados:`, porEstado);
}

// --- 0011: escalada_at -------------------------------------------------------
const { data: convs, error: errConv } = await sb
  .from("conversaciones")
  .select("id, necesita_humano, escalada_at");
if (errConv) {
  check("0011 · columna escalada_at", false, errConv.message);
} else {
  check("0011 · columna escalada_at", true, `${convs.length} conversaciones`);
  const esperando = convs.filter((c) => c.necesita_humano);
  const sinReloj = esperando.filter((c) => !c.escalada_at).length;
  check(
    "0011 · backfill del reloj",
    sinReloj === 0,
    `${esperando.length} esperando, ${sinReloj} sin escalada_at`,
  );
}

// --- 0012: pagado_at (hora real del pago) ------------------------------------
const { data: pagosHora, error: errHora } = await sb
  .from("pagos")
  .select("id, pagado_at, fecha")
  .limit(5);
if (errHora) {
  check("0012 · columna pagado_at", false, errHora.message);
} else {
  const conHora = (pagosHora ?? []).filter((p) => p.pagado_at).length;
  check("0012 · columna pagado_at", true, `${conHora} de ${pagosHora?.length ?? 0} muestras con hora`);
}

// --- 0008: el índice no se puede leer por PostgREST, pero sí el estado --------
const { data: cargos, error: errCargos } = await sb.from("cargos").select("tipo, fecha");
if (errCargos) {
  check("0008 · tabla cargos accesible", false, errCargos.message);
} else {
  const rentas = cargos.filter((c) => c.tipo === "renta");
  console.log(`\n0008 · cargos de renta existentes: ${rentas.length} (el cron todavía no ha corrido)`);
  console.log(`   El índice único se comprueba al correr el devengo por primera vez.`);
}

console.log(todoBien ? `\n✅ Migraciones 0008–0012 verificadas.` : `\n❌ Hay algo sin aplicar (ver arriba).`);
