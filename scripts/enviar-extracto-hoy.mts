/** Disparo manual del extracto del día (mismo job que el cron 8am). */
import { estadosCuentaHoy } from "@/lib/cartera/estado-cuenta";
import { enviarEstadosCuentaHoy } from "@/lib/cartera/envios";

const dry = process.argv.includes("--dry");

const cola = await estadosCuentaHoy();
console.log(`Cola cobro hoy: ${cola.length} (totalHoy>0 y sin comprobante pendiente)`);
for (const e of cola.slice(0, 15)) {
  console.log(`  ${e.vehiculoNumero ?? "?"} · $${e.totalHoy} · ${e.clienteNombre ?? ""} · wa=${e.waNumero ? "sí" : "NO"}`);
}
if (cola.length > 15) console.log(`  … +${cola.length - 15} más`);

if (dry) {
  console.log("DRY — no se envió nada.");
  process.exit(0);
}

const res = await enviarEstadosCuentaHoy();
console.log("Resultado:", res);
process.exit(res.fallidos > 0 ? 1 : 0);
