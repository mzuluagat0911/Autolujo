// Waterfall de un abono: arreglo → saldo anterior → recargo → cuota.
//   npm run probar:aplicar

import { distribuirPago } from "@/lib/cartera/rules";
import {
  obligacionesRestantes,
  partirRecargoDeLaLetra,
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

console.log("\n· Orden: recargo, luego acuerdo, luego saldo");
const todo: Obligacion[] = [
  { tipo: "cuenta_diaria", prioridad: PRIORIDAD.cuenta_diaria, monto: 30 },
  { tipo: "recargo", prioridad: PRIORIDAD.recargo, monto: 5 },
  { tipo: "saldo_anterior", prioridad: PRIORIDAD.saldo_anterior, monto: 10 },
  { tipo: "acuerdo", prioridad: PRIORIDAD.acuerdo, monto: 5, ref: "a1" },
];
const r3 = distribuirPago(12, todo);
check("primero el recargo", r3.asignaciones[0]?.tipo, "recargo");
check("luego el acuerdo", r3.asignaciones[1]?.tipo, "acuerdo");
check("el resto al saldo", r3.asignaciones[2]?.tipo, "saldo_anterior");

console.log("\n· Recargo cargado dentro de la letra: sale primero y no se paga dos veces");
const g26 = partirRecargoDeLaLetra({
  pendienteAnterior: 42,
  cuotaHoy: 0,
  recargoAbierto: 5,
});
check("el domingo deja $5 de recargo", g26.recargoHoy, 5);
check("y $37 de letra atrasada", g26.pendienteAnterior, 37);
const pagoG26 = distribuirPago(
  37,
  obligacionesRestantes(
    {
      acuerdos: [],
      pendienteAnterior: g26.pendienteAnterior,
      recargoHoy: g26.recargoHoy,
      cuotaHoy: g26.cuotaHoy,
    },
    [],
  ),
);
check("de los $37, $5 van al recargo", pagoG26.asignaciones.find((a) => a.tipo === "recargo")?.aplicado, 5);
check("y $32 a la letra atrasada", pagoG26.asignaciones.find((a) => a.tipo === "saldo_anterior")?.aplicado, 32);
check("no sobra nada", pagoG26.sobrante, 0);

const entreSemana = partirRecargoDeLaLetra({
  pendienteAnterior: 5,
  cuotaHoy: 37,
  recargoAbierto: 5,
});
check("entre semana el recargo sale del atraso", entreSemana.pendienteAnterior, 0);
check("la letra del día sigue en $37", entreSemana.cuotaHoy, 37);

const yaPelado = partirRecargoDeLaLetra({
  pendienteAnterior: 0,
  cuotaHoy: 37,
  recargoAbierto: 5,
  yaFueraDeLaLetra: 5,
});
check("si la multa de hoy ya estaba fuera, la letra no se achica", yaPelado.cuotaHoy, 37);
check("y el recargo igual entra primero", yaPelado.recargoHoy, 5);

console.log(fallos === 0 ? `\n✅ Todo en verde.` : `\n❌ ${fallos} casos fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
