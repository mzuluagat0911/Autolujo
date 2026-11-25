// Proyección hipotética de extractos 8am SOLO Gold. NO envía WhatsApp.
//   node --experimental-strip-types --env-file=.env.local --import ./scripts/resolver.mjs scripts/preview-gold-8am.mts

import { writeFileSync } from "node:fs";
import { estadosCuentaHoy } from "@/lib/cartera/estado-cuenta";
import {
  estaAlDia,
  previewEstadoCuenta,
} from "@/lib/cartera/envios";
import {
  acuerdosSaldoPorContrato,
  cargosExtraPorContrato,
} from "@/lib/cartera/extracto-desglose";
import { hoyPanama, fechaLarga } from "@/lib/cartera/fecha";

const hoy = hoyPanama();
const todos = await estadosCuentaHoy();
const gold = todos
  .filter((e) => (e.empresa ?? "").toUpperCase() === "GOLD")
  .sort((a, b) => (a.vehiculoNumero ?? "").localeCompare(b.vehiculoNumero ?? "", "es"));

const ids = gold.map((e) => e.contratoId);
const [saldos, extras] = await Promise.all([
  acuerdosSaldoPorContrato(ids),
  cargosExtraPorContrato(ids),
]);

const filas = gold.map((e) => {
  const ctx = {
    acuerdoSaldo: saldos.get(e.contratoId) ?? 0,
    extras: extras.get(e.contratoId) ?? [],
  };
  return {
    carro: e.vehiculoNumero,
    nombre: e.clienteNombre,
    wa: e.waNumero,
    alDia: estaAlDia(e),
    letra: e.letra,
    totalHoy: e.totalHoy,
    pendienteAnterior: e.pendienteAnterior,
    cuenta: e.cuenta,
    recargo: e.recargo,
    acuerdoHoy: e.acuerdoHoy,
    saldoVista: e.saldoVista,
    mensaje: previewEstadoCuenta(e, ctx),
  };
});

// estadosCuentaHoy ya filtra totalHoy>0 y sin comprobante pendiente.
const aEnviar = filas.filter((f) => f.wa);
const sinWa = filas.filter((f) => !f.wa);

const out = {
  generatedAt: new Date().toISOString(),
  fechaNegocio: hoy,
  fechaLarga: fechaLarga(hoy),
  hipotetico: "Extractos Gold 8:00 a.m. — SIN envío real",
  totales: {
    contratosGoldEnCola: filas.length,
    seEnviarian: aEnviar.length,
    sinWhatsApp: sinWa.length,
    sumaTotalHoy: Math.round(aEnviar.reduce((s, f) => s + f.totalHoy, 0) * 100) / 100,
    alDia: aEnviar.filter((f) => f.alDia).length,
    conAtraso: aEnviar.filter((f) => !f.alDia).length,
  },
  mensajes: aEnviar,
  sinWhatsApp: sinWa.map((f) => ({
    carro: f.carro,
    nombre: f.nombre,
    totalHoy: f.totalHoy,
  })),
};

const jsonPath = "docs/preview-gold-8am.json";
const mdPath = "docs/preview-gold-8am.md";
writeFileSync(jsonPath, JSON.stringify(out, null, 2));

const md: string[] = [
  `# Proyección hipotética — Extractos Gold 8:00 a.m.`,
  ``,
  `> **NO se envió nada.** Simulación con el motor real de cobros (${out.fechaLarga}).`,
  `> Advertencia: en clientes viejos el ledger puede estar inflado vs el Excel (pagos no cruzados).`,
  ``,
  `## Resumen`,
  ``,
  `- En cola Gold (totalHoy > 0): **${out.totales.contratosGoldEnCola}**`,
  `- Se enviarían: **${out.totales.seEnviarian}**`,
  `- Sin WhatsApp: **${out.totales.sinWhatsApp}**`,
  `- Al día: **${out.totales.alDia}** · Con atraso: **${out.totales.conAtraso}**`,
  `- Suma de TOTAL HOY: **$${out.totales.sumaTotalHoy.toFixed(2)}**`,
  ``,
];

if (sinWa.length) {
  md.push(`## Sin WhatsApp`, ``);
  for (const o of out.sinWhatsApp) {
    md.push(`- **${o.carro}** ${o.nombre} (totalHoy $${Number(o.totalHoy).toFixed(2)})`);
  }
  md.push(``);
}

md.push(`## Mensajes (tal cual saldrían por WhatsApp)`, ``);

for (const f of aEnviar) {
  md.push(`### ${f.carro} · ${f.nombre}`);
  md.push(``);
  md.push(`- WA: \`${f.wa}\``);
  md.push(
    `- ${f.alDia ? "Al día" : "Con atraso"} · letra $${f.letra} · saldo ledger $${Number(f.saldoVista).toFixed(2)}`,
  );
  md.push(``);
  md.push("```");
  md.push(f.mensaje);
  md.push("```");
  md.push(``);
}

writeFileSync(mdPath, md.join("\n"));
console.log(JSON.stringify(out.totales, null, 2));
console.log(`\n→ ${mdPath}`);
console.log(`→ ${jsonPath}`);
