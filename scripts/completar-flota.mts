// Completa placa (y panapass si viene) desde Diacor + texto de Hoja de vida.
// No inventa marca/modelo/año: eso va por Excel o edición masiva.
//
//   node --experimental-strip-types --env-file=.env.local --import ./scripts/resolver.mjs scripts/completar-flota.mts
//   ... --commit   # escribe

import { createClient } from "@supabase/supabase-js";
import { posicionesGps, diacorConfigurado } from "@/lib/gps/diacor";
import { normalizarPlaca } from "@/lib/gps/vincular";

const COMMIT = process.argv.includes("--commit");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function placaValida(raw: string | null | undefined): string | null {
  const p = normalizarPlaca(raw);
  // Panamá típico: 2–3 letras + 3–4 dígitos (AB1234 / CX0194)
  if (!/^[A-Z]{1,3}\d{3,4}$/.test(p)) return null;
  if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d+$/i.test(p)) return null;
  return p;
}

const { data: veh, error } = await sb
  .from("vehiculos")
  .select("id, numero, placa, gps_id, marca, modelo, anio, empresa:empresas(codigo)")
  .neq("estado", "entregado");
if (error) throw error;

type V = {
  id: string;
  numero: string;
  placa: string | null;
  gps_id: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  empresa: { codigo: string } | null;
};

const filas = (veh ?? []) as unknown as V[];
const sinPlaca = filas.filter((v) => !placaValida(v.placa));
console.log(`Flota activa: ${filas.length} | sin placa útil: ${sinPlaca.length}`);
console.log(COMMIT ? "ESCRIBIENDO" : "DRY-RUN (pase --commit para guardar)");

let deDiacor = 0;
if (diacorConfigurado()) {
  try {
    const pos = await posicionesGps();
    const porGps = new Map(pos.filter((p) => p.id_dispositivo).map((p) => [p.id_dispositivo, p]));
    for (const v of sinPlaca) {
      if (!v.gps_id) continue;
      const p = porGps.get(v.gps_id);
      const placa = placaValida(p?.placa ?? null);
      if (!placa) continue;
      console.log(`Diacor  ${v.empresa?.codigo ?? "?"} · ${v.numero} → ${placa}`);
      if (COMMIT) {
        const { error: e } = await sb.from("vehiculos").update({ placa }).eq("id", v.id).is("placa", null);
        // también si placa inválida previa
        if (e) {
          await sb.from("vehiculos").update({ placa }).eq("id", v.id);
        }
      }
      deDiacor++;
    }
  } catch (e) {
    console.warn("Diacor no disponible:", e instanceof Error ? e.message : e);
  }
} else {
  console.warn("Sin DIACOR_USER/PASSWORD en el entorno — salto Diacor.");
}

console.log(`Placas desde Diacor: ${deDiacor}`);
console.log(`
Marca / modelo / año NO se rellenan solos:
  1) En Carros → «Editar placa / GPS» (placa y gps_id), o
  2) Pásame un Excel con columnas: empresa, numero, placa, marca, modelo, anio
     y lo importamos de un tiro.
`);
