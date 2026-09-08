// Carga km del mes vía Diacor → gps_dias.
//
//   node --experimental-strip-types --env-file=.env.local --import ./scripts/resolver.mjs scripts/cargar-km-mes.mts
//   ... 2026-09-01 2026-09-07

import { cargarKmRango, rangoMesEnCurso } from "@/lib/gps/cargar-km-rango";
import { diacorConfigurado } from "@/lib/gps/diacor";

if (!diacorConfigurado()) {
  console.error("Faltan DIACOR_USER / DIACOR_PASSWORD en el entorno.");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const mes = rangoMesEnCurso();
const desde = args[0] && /^\d{4}-\d{2}-\d{2}$/.test(args[0]) ? args[0] : mes.desde;
const hasta = args[1] && /^\d{4}-\d{2}-\d{2}$/.test(args[1]) ? args[1] : mes.hasta;

console.log(`Cargando km Diacor ${desde} → ${hasta}…`);
const t0 = Date.now();
const res = await cargarKmRango(desde, hasta);
const seg = ((Date.now() - t0) / 1000).toFixed(1);

if (!res.ok) {
  console.error("Falló:", res.error);
  process.exit(1);
}

console.log(
  `OK en ${seg}s · ${res.dispositivos} dispositivos · ${res.dias} días · ${res.guardados} filas · ${res.errores} errores · ${Math.round(res.kmTotal).toLocaleString("es-PA")} km total`,
);
for (const d of res.porDia) {
  console.log(
    `  ${d.fecha}: ${d.guardados} filas, ${Math.round(d.km).toLocaleString("es-PA")} km${d.errores ? `, ${d.errores} err` : ""}`,
  );
}
