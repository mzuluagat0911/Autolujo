// Cruce Diacor ↔ carro. Sin red.
//   npm run probar:gps

import { normalizarPosicion } from "@/lib/gps/diacor";
import { clasificarKmDia } from "@/lib/gps/alertas-dia";
import { kmDesdeOdometro } from "@/lib/gps/km-dia";
import { armarFilas, casarPosicion, normalizarPlaca, parseEtiquetaDiacor, sugerenciasVinculo } from "@/lib/gps/vincular";

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

const raw = {
  id_dispositivo: "34287",
  placa: "an-8779",
  latitud: "9.06193",
  longitud: "-79.42252",
  velocidad: "50",
  gps_en_linea: true,
  encendido: true,
  bloqueado: "0",
  odometro: "710561.87",
  nombre: "Demomovil",
};

const p = normalizarPosicion(raw);
check("id", p.id_dispositivo, "34287");
check("lat", p.latitud, 9.06193);
check("lng", p.longitud, -79.42252);
check("vel", p.velocidad, 50);
check("linea", p.gps_en_linea, true);
check("no bloqueado", p.bloqueado, false);
check("placa limpia", normalizarPlaca("an-8779"), "AN8779");
check("placa espacios", normalizarPlaca(" AB 1234 "), "AB1234");

const cars = [
  { id: "v1", numero: "12", placa: "AN-8779", gps_id: null, empresa: "AL" },
  { id: "v2", numero: "99", placa: "XX0000", gps_id: "999", empresa: "AL" },
];

check("casa por placa", casarPosicion(p, cars)?.id, "v1");
check(
  "casa por gps_id",
  casarPosicion(p, [{ ...cars[0]!, gps_id: "34287", placa: null }])?.id,
  "v1",
);
check("placa ambigua no casa", casarPosicion(p, [...cars, { id: "v3", numero: "13", placa: "AN8779", gps_id: null, empresa: "K" }]), null);

const filas = armarFilas([p], cars);
check("fila carro", filas[0]?.carro, "AL · 12");

const sug = sugerenciasVinculo([p], cars);
check("sugerir gps_id", sug, [{ vehiculoId: "v1", gps_id: "34287", via: "placa", detalle: "AN8779" }]);
check("ya vinculado no sugiere", sugerenciasVinculo([p], [{ ...cars[0]!, gps_id: "34287" }]), []);
check(
  "sugerir por etiqueta",
  sugerenciasVinculo(
    [{ ...p, placa: null, nombre: "#AL12", id_dispositivo: "88" }],
    [{ id: "v1", numero: "12", placa: null, gps_id: null, empresa: "AUTOLUJO" }],
  ),
  [{ vehiculoId: "v1", gps_id: "88", via: "etiqueta", detalle: "AUTOLUJO · 12" }],
);

check("etiqueta AL", parseEtiquetaDiacor("#AL66"), { codigoEmpresa: "AUTOLUJO", numero: "66" });
check("etiqueta Gold", parseEtiquetaDiacor("#G02"), { codigoEmpresa: "GOLD", numero: "02" });
check("etiqueta KW", parseEtiquetaDiacor("#KW202"), { codigoEmpresa: "KOWUA", numero: "202" });
check(
  "casa por nombre",
  casarPosicion(
    { ...p, placa: null, nombre: "#AL12", id_dispositivo: "1" },
    [{ id: "v1", numero: "12", placa: null, gps_id: null, empresa: "AUTOLUJO" }],
  )?.id,
  "v1",
);

check("351 km es exceso", clasificarKmDia(351, false), "exceso_km_dia");
check("350 km no es exceso", clasificarKmDia(350, false), "ok");
check("0 km entre semana es parado", clasificarKmDia(0, false), "sin_recorrido");
check("0 km domingo no alerta", clasificarKmDia(0, true), "ok");
check("sin dato", clasificarKmDia(null, false), "sin_dato");
check("taller no es parado", clasificarKmDia(0, false, true), "ok");
check("odo 100→140", kmDesdeOdometro(100, 140), 40);
check("odo cero no sirve", kmDesdeOdometro(0, 40), null);
check("odo hacia atrás", kmDesdeOdometro(900, 10), null);

if (fallos) {
  console.error(`\n❌ ${fallos} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ GPS (cruce) en verde.");
