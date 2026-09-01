// Waterfall de un abono: arreglo → saldo anterior → recargo → cuota.
//   npm run probar:aplicar

import { distribuirPago } from "@/lib/cartera/rules";
import {
  obligacionesRestantes,
  PRIORIDAD,
  textoComoSeAplico,
} from "@/lib/cartera/aplicar-pago";
import type { Obligacion } from "@/lib/cartera/types";

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

const money = (n: number) => "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2));

console.log("\n· $20 sobre $5 de arreglo + $30 de cuota");
const deudas: Obligacion[] = [
  { tipo: "acuerdo", prioridad: PRIORIDAD.acuerdo, monto: 5, ref: "a1", etiqueta: "arreglo" },
  { tipo: "cuenta_diaria", prioridad: PRIORIDAD.cuenta_diaria, monto: 30, etiqueta: "cuota de hoy" },
];
const r = distribuirPago(20, deudas);
check("al arreglo van $5", r.asignaciones.find((a) => a.tipo === "acuerdo")?.aplicado, 5);
check("a la cuota van $15", r.asignaciones.find((a) => a.tipo === "cuenta_diaria")?.aplicado, 15);
check("no sobra nada", r.sobrante, 0);
check(
  "el texto lo dice en ese orden",
  textoComoSeAplico(r, money),
  "Se aplicó así: $5 al arreglo, $15 a la cuota de hoy.",
);

const resto = obligacionesRestantes(
  { acuerdos: [{ id: "a1", monto: 5, etiqueta: "arreglo" }], pendienteAnterior: 0, recargoHoy: 0, cuotaHoy: 30 },
  r.asignaciones,
);
check("después de ese abono el arreglo del día ya está cubierto", resto.some((o) => o.tipo === "acuerdo"), false);
check("y de la cuota quedan $15", resto.find((o) => o.tipo === "cuenta_diaria")?.monto, 15);

console.log("\n· Segundo abono del mismo día suma sobre lo que falta");
const r2 = distribuirPago(15, resto);
check("el segundo $15 cierra la cuota", r2.asignaciones[0]?.aplicado, 15);
check("y no toca de nuevo el arreglo", r2.asignaciones.some((a) => a.tipo === "acuerdo"), false);

console.log("\n· Orden: arreglo antes que saldo anterior y recargo");
const todo: Obligacion[] = [
  { tipo: "cuenta_diaria", prioridad: PRIORIDAD.cuenta_diaria, monto: 30 },
  { tipo: "recargo", prioridad: PRIORIDAD.recargo, monto: 5 },
  { tipo: "saldo_anterior", prioridad: PRIORIDAD.saldo_anterior, monto: 10 },
  { tipo: "acuerdo", prioridad: PRIORIDAD.acuerdo, monto: 5, ref: "a1" },
];
const r3 = distribuirPago(12, todo);
check("primero el arreglo", r3.asignaciones[0]?.tipo, "acuerdo");
check("luego el saldo anterior", r3.asignaciones[1]?.tipo, "saldo_anterior");
check("el recargo no entra con $12", r3.asignaciones.some((a) => a.tipo === "recargo"), false);

console.log(fallos === 0 ? `\n✅ Todo en verde.` : `\n❌ ${fallos} casos fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
