// Proyección de cobro Gold para el viernes 25-sep-2026, 9am
// (como si ya fueran las 12:01 del viernes).
// Si no entra otro pago esta noche: se suma la letra del viernes y,
// si el acuerdo sigue con saldo, la cuota de ese día (no dos días).
// NO envía WhatsApp.
//   node --experimental-strip-types --env-file=.env.local --import ./scripts/resolver.mjs scripts/preview-gold-manana.mts

import { writeFileSync } from "node:fs";
import { armarEstadosAlcance, money, type EstadoCuenta } from "@/lib/cartera/estado-cuenta";
import { previewEstadoCuenta, totalCobrarHoyExtracto } from "@/lib/cartera/extracto-preview";
import {
  acuerdosSaldoPorContrato,
  cargosExtraPorContrato,
  preferenciaAbonoContrato,
} from "@/lib/cartera/extracto-desglose";

const FECHA = "viernes 25 de septiembre";

/** Estado del viernes: +letra del día y cuota de acuerdo del viernes (si hay saldo). */
function proyectar(e: EstadoCuenta, saldoAcuerdo: number): EstadoCuenta {
  const cuota = Math.max(Number(e.acuerdoHoy) || 0, 0);
  // El viernes solo pide la cuota de ESE día. Lo no pagado del jueves
  // sigue en el saldo del plan; no se mete dos veces al extracto.
  const faltaManana = saldoAcuerdo > 0.009 ? Math.min(saldoAcuerdo, cuota) : 0;
  const letra = Math.max(Number(e.letra) || 0, 0);
  // Saca del total del jueves la falta de acuerdo de hoy, para no arrastrarla
  // metida en "cuenta" y volver a sumar la del viernes.
  const baseSinAcuerdoJueves = Math.max(
    (Number(e.totalHoy) || 0) - Math.max(Number(e.faltaAcuerdo) || 0, 0),
    0,
  );
  const vars = [...e.templateVars];
  if (vars.length >= 3) vars[2] = FECHA;
  return {
    ...e,
    totalHoy: Math.round((baseSinAcuerdoJueves + letra + faltaManana) * 100) / 100,
    acuerdoHoy: cuota,
    faltaAcuerdo: faltaManana,
    templateVars: vars as EstadoCuenta["templateVars"],
  };
}

const todos = await armarEstadosAlcance();
const gold = todos
  .filter((e) => (e.empresa ?? "").toUpperCase() === "GOLD")
  .sort((a, b) => (a.vehiculoNumero ?? "").localeCompare(b.vehiculoNumero ?? "", "es"));

const ids = gold.map((e) => e.contratoId);
const [saldos, extras] = await Promise.all([
  acuerdosSaldoPorContrato(ids),
  cargosExtraPorContrato(ids),
]);

const bloques: string[] = [
  `# Cobro Gold — viernes 25 de septiembre, 9:00 a.m.`,
  ``,
  `Proyección como si ya fueran las 12:01 del viernes. Si no entra otro pago esta noche (jueves 24), se suma la letra del viernes y, si el acuerdo tiene saldo, la cuota de ese día. No se envió WhatsApp.`,
  ``,
  `Reglas: letra + un concepto (si hay acuerdo con saldo, ese; si no, el de menor valor). Mantenimiento y domingo se listan pendientes. El recargo de $5 en el texto es advertencia; no se suma al total ni se crea solo.`,
  ``,
  `---`,
  ``,
];

const resumenCobro: string[] = [];
const resumenNo: string[] = [];
let suma = 0;
let n = 0;

for (const e of gold) {
  const saldo = saldos.get(e.contratoId) ?? 0;
  const pref = await preferenciaAbonoContrato(e.contratoId);
  const proy = proyectar(e, saldo);
  const ctx = {
    acuerdoSaldo: saldo,
    extras: extras.get(e.contratoId) ?? [],
    preferencia: pref,
  };
  const total = totalCobrarHoyExtracto(proy, ctx);
  const etiqueta = `${e.vehiculoNumero} · ${e.clienteNombre}`;

  if (total <= 0.009) {
    resumenNo.push(`- **${etiqueta}** — no se cobra (al día / nada que enviar)`);
    bloques.push(`## ${etiqueta}`, ``, `No se cobra. Nada que enviar el viernes.`, ``, `---`, ``);
    continue;
  }

  const texto = previewEstadoCuenta(proy, ctx);
  suma += total;
  n += 1;
  resumenCobro.push(`- **${e.vehiculoNumero}** · ${money(total)}`);
  bloques.push(`## ${etiqueta}`, ``, "```", texto, "```", ``, `---`, ``);
}

bloques.splice(
  7,
  0,
  `## Resumen`,
  ``,
  `**${n} mensajes a enviar · suma ${money(suma)}**`,
  ``,
  resumenNo.length
    ? [`### No se cobran`, ``, ...resumenNo, ``].join("\n")
    : `### No se cobran\n\nNinguno: todos tienen cobro el viernes.\n`,
  `### Totales por carro`,
  ``,
  ...resumenCobro,
  ``,
  `---`,
  ``,
);

writeFileSync("docs/preview-gold-25-sep.md", bloques.join("\n"));
console.log(`mensajes ${n} · sin cobro ${resumenNo.length} · suma ${money(suma)} · docs/preview-gold-25-sep.md`);
