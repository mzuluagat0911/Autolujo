// Reglas de tiempo y de cuota. Sin red ni base de datos.
//   npm run probar
//
// El servidor corre en UTC y Panamá es UTC−5: entre las 7 p.m. y la medianoche
// el día UTC ya cambió pero el día del negocio no. Ahí es donde se cuelan los
// errores que le cobran un recargo a alguien que pagó a tiempo.

import {
  hoyPanama, horaPanama, pasoCorte, esPagoPuntual, esPagoDelDia,
  fechaContable, pagadoAtDesdeForm, instantePanama, rangoDiaPanama,
  diaSemana, sumarDias, diasEntre, esDomingo,
} from "@/lib/cartera/fecha";
import { cuotaDeFecha, tarifaPlena, penalidadDe, type TerminosCuota } from "@/lib/cartera/cuota";
import { calcularCifras, type EntradaCifras } from "@/lib/cartera/cifras";

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

// --- Zona horaria: el día del negocio no es el día UTC ----------------------
console.log("\n· Zona Panamá");
// 2 de septiembre 01:30 UTC = 1 de septiembre 20:30 en Panamá.
const nocheUTC = new Date("2026-09-02T01:30:00Z");
check("20:30 de Panamá sigue siendo el día anterior", hoyPanama(nocheUTC), "2026-09-01");
check("la hora se reporta en Panamá, no en UTC", horaPanama(nocheUTC), "20:30");
check("a las 20:30 el corte ya pasó", pasoCorte(nocheUTC), true);

// 1 de septiembre 23:30 UTC = 1 de septiembre 18:30 en Panamá.
const tardeUTC = new Date("2026-09-01T23:30:00Z");
check("18:30 de Panamá es el mismo día", hoyPanama(tardeUTC), "2026-09-01");
check("a las 18:30 el corte NO ha pasado", pasoCorte(tardeUTC), false);

// 1 de septiembre 00:30 UTC = 31 de agosto 19:30 en Panamá.
const cruceMes = new Date("2026-09-01T00:30:00Z");
check("el cruce de mes respeta Panamá", hoyPanama(cruceMes), "2026-08-31");

// --- Puntualidad: la frontera exacta de las 7:00 p.m. -----------------------
console.log("\n· Corte de las 7:00 p.m.");
const dia = "2026-09-01";
check("18:59 es puntual", esPagoPuntual(instantePanama(dia, 18, 59), dia), true);
check("19:00 clavadas NO es puntual", esPagoPuntual(instantePanama(dia, 19, 0), dia), false);
check("19:01 no es puntual", esPagoPuntual(instantePanama(dia, 19, 1), dia), false);
check("00:05 sí es puntual (madrugada del mismo día)", esPagoPuntual(instantePanama(dia, 0, 5), dia), true);
check("un pago de ayer no es puntual para hoy", esPagoPuntual(instantePanama("2026-08-31", 10, 0), dia), false);
check("pero sí cuenta como pago de SU día", esPagoDelDia(instantePanama("2026-08-31", 10, 0), "2026-08-31"), true);
check("23:59 sigue siendo pago de ese día", esPagoDelDia(instantePanama(dia, 23, 59), dia), true);

// --- Fecha contable y formulario -------------------------------------------
console.log("\n· Fecha contable");
check("un pago de las 20:30 se contabiliza ese mismo día", fechaContable(nocheUTC), "2026-09-01");
check("el formulario arma la hora en Panamá", fechaContable(pagadoAtDesdeForm(dia, "15:30")), dia);
check("formulario 15:30 es puntual", esPagoPuntual(pagadoAtDesdeForm(dia, "15:30"), dia), true);
check("formulario 19:30 no es puntual", esPagoPuntual(pagadoAtDesdeForm(dia, "19:30"), dia), false);

const { desde, corte, hasta } = rangoDiaPanama(dia);
check("el día operativo arranca a medianoche de Panamá", desde.toISOString(), "2026-09-01T05:00:00.000Z");
check("el corte es a las 19:00 de Panamá", corte.toISOString(), "2026-09-02T00:00:00.000Z");
check("y termina en la medianoche siguiente", hasta.toISOString(), "2026-09-02T05:00:00.000Z");

// --- Calendario -------------------------------------------------------------
console.log("\n· Calendario");
check("2026-09-06 es domingo", esDomingo("2026-09-06"), true);
check("2026-09-01 es martes", diaSemana("2026-09-01"), 2);
check("sumar días cruza de mes", sumarDias("2026-08-31", 1), "2026-09-01");
check("restar días cruza de mes", sumarDias("2026-09-01", -1), "2026-08-31");
check("días entre fechas", diasEntre("2026-08-29", "2026-09-01"), 3);
check("días entre la misma fecha", diasEntre(dia, dia), 0);

// --- Cuota: la renta es SIEMPRE base, el recargo va aparte ------------------
console.log("\n· Cuota y recargo");
const sinDomingo: TerminosCuota = { letra_diaria: 30, descuento_puntual: 5, cobra_domingo: false, cuota_domingo: null };
const conDomingo: TerminosCuota = { letra_diaria: 30, descuento_puntual: 5, cobra_domingo: true, cuota_domingo: 15 };

check("entre semana cobra la letra", cuotaDeFecha(sinDomingo, "2026-09-01"), 30);
check("domingo libre no cobra", cuotaDeFecha(sinDomingo, "2026-09-06"), 0);
check("domingo pactado cobra su cuota", cuotaDeFecha(conDomingo, "2026-09-06"), 15);
check("la penalidad es el descuento perdido", penalidadDe(sinDomingo), 5);
check("tarifa plena = cuota + penalidad", tarifaPlena(sinDomingo, "2026-09-01"), 35);
check("sin cuota no hay tarifa plena", tarifaPlena(sinDomingo, "2026-09-06"), 0);
check("tarifa plena del domingo pactado", tarifaPlena(conDomingo, "2026-09-06"), 20);

const sinDescuento: TerminosCuota = { letra_diaria: 30, descuento_puntual: null, cobra_domingo: false, cuota_domingo: null };
check("sin descuento pactado no hay recargo", penalidadDe(sinDescuento), 0);
check("y la tarifa plena es la cuota", tarifaPlena(sinDescuento, "2026-09-01"), 30);

// --- Una sola fuente de cifras (lo que ve el cliente) -----------------------
console.log("\n· Cifras del día");
const T: TerminosCuota = { letra_diaria: 30, descuento_puntual: 5, cobra_domingo: false, cuota_domingo: null };
const base = (over: Partial<EntradaCifras>): EntradaCifras => ({
  terminos: T, saldo: 30, pagoHoy: false, pagoPuntual: false, pendiente: false,
  hoy: "2026-09-01", corte: false, multaHoyRegistrada: false, hoyYaDevengado: true,
  ...over,
});

check("devengado, sin pagar, antes del corte: debe $30", calcularCifras(base({})).totalHoy, 30);
check("y avisa $35 si paga tarde", calcularCifras(base({})).totalHoyTarde, 35);
check("mañana suma otra cuota: $65", calcularCifras(base({})).totalManana, 65);

check("después del corte sin pagar: recargo $5", calcularCifras(base({ corte: true })).recargo, 5);
check("total con recargo $35", calcularCifras(base({ corte: true })).totalHoy, 35);
check("si la multa ya está en el saldo, no se duplica", calcularCifras(base({ corte: true, multaHoyRegistrada: true, saldo: 35 })).totalHoy, 35);

check("comprobante pendiente congela el recargo tras el corte", calcularCifras(base({ corte: true, pendiente: true })).recargo, 0);
check("y el total sigue en $30", calcularCifras(base({ corte: true, pendiente: true })).totalHoy, 30);

check("pagó puntual: $0 si no debía de antes", calcularCifras(base({ pagoHoy: true, pagoPuntual: true, saldo: 0 })).totalHoy, 0);

const sinDevengar = calcularCifras(base({ hoyYaDevengado: false, saldo: 0 }));
check("cron no ha corrido: se suma la cuota de hoy", sinDevengar.faltaHoy, 30);
check("total igual que si ya estuviera devengada", sinDevengar.totalHoy, 30);

const pagoSinRenta = calcularCifras(base({ hoyYaDevengado: false, saldo: -30, pagoHoy: true, pagoPuntual: true }));
check("pagó $30 y la renta aún no existe: saldo negativo cancela la cuota", pagoSinRenta.totalHoy, 0);

check("max(saldo,0) ANTES de sumar la cuota habría cobrado de más", pagoSinRenta.cuenta, 0);

check("domingo libre no cobra ni recarga", calcularCifras(base({ hoy: "2026-09-06", corte: true, saldo: 0 })).totalHoy, 0);

console.log(fallos === 0 ? `\n✅ Todo en verde.` : `\n❌ ${fallos} casos fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
