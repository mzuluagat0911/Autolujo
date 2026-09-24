/**
 * Backfill: los $ del acuerdo no deben comer la letra.
 * Inserta cargos tipo=acuerdo por cada pago que ya tenía asignación a arreglo
 * sin cargo compensatorio.
 *
 *   npx tsx scripts/backfill-cargos-acuerdo.mts
 *   npx tsx scripts/backfill-cargos-acuerdo.mts --dry
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const dry = process.argv.includes("--dry");

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  let v = line.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[line.slice(0, i).trim()] = v;
  process.env[line.slice(0, i).trim()] = v;
}

type Asig = { tipo?: string; aplicado?: number; etiqueta?: string; ref?: string };
function parseAsig(raw: unknown): Asig[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Asig[];
  const o = raw as { asignaciones?: Asig[] };
  return Array.isArray(o.asignaciones) ? o.asignaciones : [];
}

async function main() {
  const { asegurarCargosAcuerdoDelPago } = await import("../lib/cartera/aplicar-pago");
  const { fechaContable } = await import("../lib/cartera/fecha");
  const sb = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
  );

  const { data: pagos, error } = await sb
    .from("pagos")
    .select("id, contrato_id, monto, pagado_at, fecha, asignaciones, estado_conciliacion")
    .in("estado_conciliacion", ["conciliado", "manual"])
    .not("asignaciones", "is", null)
    .order("pagado_at", { ascending: true });
  if (error) throw error;

  let tocados = 0;
  let total = 0;
  const porCarro = new Map<string, number>();

  for (const p of (pagos ?? []) as {
    id: string;
    contrato_id: string | null;
    pagado_at: string;
    fecha: string;
    asignaciones: unknown;
  }[]) {
    if (!p.contrato_id) continue;
    const asigs = parseAsig(p.asignaciones).filter(
      (a) => a.tipo === "acuerdo" && Number(a.aplicado) > 0.009,
    );
    if (asigs.length === 0) continue;

    const { data: ya } = await sb
      .from("cargos")
      .select("id, monto")
      .eq("pago_id", p.id)
      .eq("tipo", "acuerdo");
    const sumaYa = (ya ?? []).reduce((s, c) => s + Number((c as { monto: number }).monto || 0), 0);
    const suma = asigs.reduce((s, a) => s + Number(a.aplicado || 0), 0);
    if (sumaYa > 0.009 && Math.abs(sumaYa - suma) < 0.05) continue;

    const { data: veh } = await sb
      .from("contratos")
      .select("vehiculo:vehiculos(numero)")
      .eq("id", p.contrato_id)
      .maybeSingle();
    const carro =
      (veh as { vehiculo?: { numero?: string } | null } | null)?.vehiculo?.numero ??
      p.contrato_id.slice(0, 8);

    console.log(
      `${dry ? "[dry] " : ""}${carro} pago ${p.fecha} → cargo acuerdo $${suma.toFixed(2)}`,
    );
    if (!dry) {
      await asegurarCargosAcuerdoDelPago({
        contratoId: p.contrato_id,
        pagoId: p.id,
        fecha: p.fecha || fechaContable(p.pagado_at),
        asignaciones: asigs.map((a) => ({
          tipo: "acuerdo" as const,
          aplicado: Number(a.aplicado) || 0,
          etiqueta: a.etiqueta,
          ref: a.ref,
        })),
      });
    }
    tocados++;
    total += suma;
    porCarro.set(carro, (porCarro.get(carro) ?? 0) + suma);
  }

  console.log("\nResumen", dry ? "(dry-run)" : "(aplicado)");
  console.log("Pagos corregidos:", tocados);
  console.log("Total $ restaurados a la letra:", total.toFixed(2));
  for (const [c, n] of [...porCarro.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${c}: +$${n.toFixed(2)} al ledger (cargo acuerdo)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
