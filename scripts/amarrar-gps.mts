// Rellena vehiculos.gps_id desde gps_dias / gps_posiciones (sin Diacor).
//   node --experimental-strip-types --env-file=.env.local --import ./scripts/resolver.mjs scripts/amarrar-gps.mts

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: sin, error: e1 } = await sb
  .from("vehiculos")
  .select("id, numero")
  .is("gps_id", null)
  .neq("estado", "entregado");
if (e1) throw e1;
const faltan = new Map(((sin ?? []) as { id: string; numero: string }[]).map((v) => [v.id, v.numero]));
console.log(`Sin gps_id: ${faltan.size}`);

const usados = new Set<string>();
const { data: ya } = await sb.from("vehiculos").select("gps_id").not("gps_id", "is", null);
for (const r of (ya ?? []) as { gps_id: string | null }[]) {
  if (r.gps_id) usados.add(r.gps_id);
}
console.log(`Ya amarrados: ${usados.size}`);

const pares = new Map<string, string>();

async function cargar(tabla: "gps_dias" | "gps_posiciones", orden: string) {
  const { data, error } = await sb
    .from(tabla)
    .select("vehiculo_id, id_dispositivo")
    .not("vehiculo_id", "is", null)
    .order(orden, { ascending: false })
    .limit(5000);
  if (error) {
    console.warn(`${tabla}: ${error.message}`);
    return;
  }
  for (const r of (data ?? []) as { vehiculo_id: string; id_dispositivo: string }[]) {
    if (!faltan.has(r.vehiculo_id) || pares.has(r.vehiculo_id)) continue;
    if (!r.id_dispositivo || usados.has(r.id_dispositivo)) continue;
    pares.set(r.vehiculo_id, r.id_dispositivo);
    usados.add(r.id_dispositivo);
  }
}

await cargar("gps_dias", "fecha");
await cargar("gps_posiciones", "tomado_at");
console.log(`Pares encontrados: ${pares.size}`);

let n = 0;
for (const [vehiculoId, gpsId] of pares) {
  const { error } = await sb.from("vehiculos").update({ gps_id: gpsId }).eq("id", vehiculoId).is("gps_id", null);
  if (error) console.error(vehiculoId, error.message);
  else {
    n++;
    console.log(`OK carro ${faltan.get(vehiculoId)} → ${gpsId}`);
  }
}
console.log(`Amarrados ahora: ${n}`);
