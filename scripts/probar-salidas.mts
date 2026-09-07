// Tarifas y detección de salida al interior. Sin red.
//   npm run probar:salidas

import {
  detectarDestinoInterior,
  detectarDestinoEnTextos,
  detectarDiasViaje,
  inferirDestinoPorMonto,
  partirMontoInterior,
  TARIFAS_SALIDA_INTERIOR,
} from "@/lib/cartera/salidas-interior";
import { cruzarPuntoConSalida, enInterior, enMetroPanama, haversineKm } from "@/lib/cartera/salidas-geo";
import { montoQueCubreCuota } from "@/lib/cartera/salidas-aplicar";
import { textoComoSeAplico, PRIORIDAD } from "@/lib/cartera/aplicar-pago";
import { distribuirPago } from "@/lib/cartera/rules";

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

console.log("\n· Tarifas");
check("7 destinos", TARIFAS_SALIDA_INTERIOR.length, 7);
check("David $127", TARIFAS_SALIDA_INTERIOR.find((d) => d.id === "david")?.monto, 127);
check("Penonomé $25", TARIFAS_SALIDA_INTERIOR.find((d) => d.id === "penonome")?.monto, 25);

console.log("\n· Detectar destino (hace falta contexto de salida)");
check("voy para Santiago", detectarDestinoInterior("voy para Santiago")?.id, "santiago");
check("permiso a David", detectarDestinoInterior("necesito permiso para ir a David")?.id, "david");
check("salida Las Tablas", detectarDestinoInterior("salida a las tablas")?.id, "las_tablas");
check("David gana a Chiriquí", detectarDestinoInterior("salida a David, Chiriquí")?.id, "david");
check("llamen a Santiago no es viaje", detectarDestinoInterior("llamen a Santiago por la colisión"), null);

console.log("\n· Inferir por monto");
check(
  "$127 + interior",
  inferirDestinoPorMonto(127, ["pago del interior"])?.id,
  "david",
);
check("$25 + interior es ambiguo", inferirDestinoPorMonto(25, ["voy al interior"]), null);
check(
  "$25 + Penonomé",
  inferirDestinoPorMonto(25, ["salida a Penonomé"])?.id,
  "penonome",
);

console.log("\n· Partir monto");
check("solo tarifa", partirMontoInterior(45, 45), { interior: 45, resto: 0 });
check("tarifa + cuota", partirMontoInterior(75, 45), { interior: 45, resto: 30 });
check("faltante", partirMontoInterior(20, 45), { interior: 20, resto: 0 });

console.log("\n· No cubre la cuota");
check(
  "rubro interior sin resto",
  montoQueCubreCuota({ monto: 45, rubro: "salida_interior", destino_interior: "santiago" }),
  0,
);
check(
  "mixto con asignaciones",
  montoQueCubreCuota({
    monto: 75,
    rubro: "salida_interior",
    asignaciones: [
      { tipo: "salida_interior", aplicado: 45 },
      { tipo: "cuenta_diaria", aplicado: 30 },
    ],
  }),
  30,
);

const money = (n: number) => "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2));
check(
  "texto de aplicación",
  textoComoSeAplico(
    {
      asignaciones: [{ tipo: "salida_interior", aplicado: 45, etiqueta: "salida a Santiago" }],
      sobrante: 0,
      totalAplicado: 45,
    },
    money,
  ),
  "Se aplicó así: $45 a la salida a Santiago.",
);

const resto = distribuirPago(30, [
  { tipo: "cuenta_diaria", prioridad: PRIORIDAD.cuenta_diaria, monto: 30, etiqueta: "cuota de hoy" },
]);
check("el resto sí va a la cuota", resto.asignaciones[0]?.tipo, "cuenta_diaria");

console.log("\n· Varios mensajes");
check(
  "último destino gana",
  detectarDestinoEnTextos(["hola", "voy al interior a Chitré"])?.id,
  "chitre",
);

console.log("\n· Días y GPS");
check("2 días", detectarDiasViaje(["voy 2 días a Santiago"]), 2);
check("1 día no cuenta", detectarDiasViaje(["voy a Santiago"]), null);
check("Panamá centro no es interior", enMetroPanama(8.98, -79.52), true);
check("Santiago es interior", enInterior(8.10, -80.97), true);
check(
  "GPS en Santiago con aval a Santiago",
  cruzarPuntoConSalida(8.10, -80.97, "santiago", "Santiago").tipo,
  "ok",
);
check(
  "GPS en David con aval a Santiago es desvío",
  cruzarPuntoConSalida(8.43, -82.43, "santiago", "Santiago").tipo,
  "desvio",
);
check(
  "GPS en ciudad con aval a Santiago es en camino",
  cruzarPuntoConSalida(8.98, -79.52, "santiago", "Santiago").tipo,
  "en_camino",
);
check(
  "anillo camino cerca de Santiago",
  cruzarPuntoConSalida(8.25, -80.85, "santiago", "Santiago").tipo,
  "en_camino",
);
check("David queda lejos de la ciudad", haversineKm({ lat: 8.98, lng: -79.52 }, { lat: 8.43, lng: -82.43 }) > 200, true);

console.log(fallos === 0 ? `\n✅ Salidas en verde.` : `\n❌ ${fallos} casos fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
