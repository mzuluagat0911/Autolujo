// Cruce extracto ↔ comprobante. Sin red ni base de datos.
//   npm run probar:cruce

import { instantePanama } from "@/lib/cartera/fecha";
import {
  canonCarro, extraerCarro, extraerNombre, extraerReferencia, canonReferencia,
  montoExacto, fechaCubrePago,
  esCrucePerfecto, decidirMovimiento, huellaMovimiento,
  type ContratoFlota, type PagoCandidato,
} from "@/lib/cartera/cruce";
import { mismaCuenta } from "@/lib/cartera/cuenta";

let fallos = 0;
function check(nombre: string, obtenido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`     esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
}

const EMP = "emp-autolujo";
const flota: ContratoFlota[] = [
  { contratoId: "c-144", letra: 30, numero: "144", clienteNombre: "Edgar Joel Bonilla", empresaId: EMP },
  { contratoId: "c-20", letra: 30, numero: "20", clienteNombre: "Jose Del Carmen Arauz Smith", empresaId: EMP },
];
const extracto = { empresaId: EMP, numeroCuenta: "0412345678" };

function pago(over: Partial<PagoCandidato>): PagoCandidato {
  return {
    id: "p1",
    contratoId: "c-144",
    empresaId: EMP,
    monto: 30,
    pagadoAt: instantePanama("2026-09-01", 15, 0).toISOString(),
    numeroCarro: "144",
    cuentaDestino: "****5678",
    origen: "comprobante",
    referencia: null,
    ...over,
  };
}

console.log("\n· Parseo de descripción");
check("carro con palabra clave", extraerCarro("TRANSFERENCIA DE JUAN PEREZ CARRO 144", "AUTOLUJO"), "144");
check("carro con auto", extraerCarro("pagos del auto 97", "AUTOLUJO"), "97");
check("carro con cr", extraerCarro("cr323", "AUTOLUJO"), "323");
check("carro Gold con prefijo", extraerCarro("PAGO G-14 CUOTA", "GOLD"), "G14");
check("sin palabra clave no inventa un número suelto", extraerCarro("REF 998877 monto varios", "AUTOLUJO"), null);
check("canon quita ceros", canonCarro("0144"), "144");
check("nombre desde transferencia", extraerNombre("TRANSFERENCIA DE EDGAR JOEL BONILLA CARRO 144"), "EDGAR JOEL BONILLA");

console.log("\n· Referencia / confirmación / canje");
check("extrae REF", extraerReferencia("TRANSFERENCIA DE JUAN REF 99887766 CARRO 144"), "99887766");
check("extrae confirmación", extraerReferencia("Nº de confirmación: AB-12-3456 pago"), "AB123456");
check("extrae comprobante de canje", extraerReferencia("Comprobante de canje 77889900"), "77889900");
check("canon ignora guiones y espacios", canonReferencia("AB-12 3456"), "AB123456");
check("refs distintas no calzan", canonReferencia("1111") === canonReferencia("2222"), false);

console.log("\n· Cuenta y monto");
check("cuenta enmascarada calza", mismaCuenta("****5678", "0412345678"), true);
check("cuenta de otro banco no calza", mismaCuenta("9999", "0412345678"), false);
check("monto exacto a centavos", montoExacto(30, 30.00), true);
check("30 vs 30.01 no calzan", montoExacto(30, 30.01), false);

console.log("\n· Fecha (día del pago o el siguiente)");
const aLas3 = instantePanama("2026-09-01", 15, 0).toISOString();
check("mismo día cubre", fechaCubrePago(aLas3, "2026-09-01"), true);
check("el banco al día siguiente cubre", fechaCubrePago(aLas3, "2026-09-02"), true);
check("dos días después no cubre", fechaCubrePago(aLas3, "2026-09-03"), false);
check("un día antes no cubre", fechaCubrePago(aLas3, "2026-08-31"), false);

console.log("\n· Cruce perfecto");
const mov144 = { monto: 30, fecha: "2026-09-01", numeroCarro: "144", nombre: "EDGAR JOEL BONILLA" };
check(
  "carro+monto+fecha+empresa+cuenta = perfecto",
  esCrucePerfecto(pago({}), { monto: 30, fecha: "2026-09-01", numeroCarro: "144" }, extracto, flota[0]),
  true,
);
check(
  "monto distinto no es perfecto",
  esCrucePerfecto(pago({ monto: 35 }), { monto: 30, fecha: "2026-09-01", numeroCarro: "144" }, extracto, flota[0]),
  false,
);
check(
  "carro distinto no es perfecto",
  esCrucePerfecto(pago({}), { monto: 30, fecha: "2026-09-01", numeroCarro: "20" }, extracto, flota[0]),
  false,
);
check(
  "cuenta de otra empresa no es perfecto",
  esCrucePerfecto(pago({ cuentaDestino: "00009999" }), { monto: 30, fecha: "2026-09-01", numeroCarro: "144" }, extracto, flota[0]),
  false,
);
check(
  "pago de oficina no cruza con el banco",
  esCrucePerfecto(pago({ origen: "manual" }), { monto: 30, fecha: "2026-09-01", numeroCarro: "144" }, extracto, flota[0]),
  false,
);
check(
  "refs distintas bloquean aunque el carro calce",
  esCrucePerfecto(
    pago({ referencia: "AAA1111" }),
    { monto: 30, fecha: "2026-09-01", numeroCarro: "144", referencia: "BBB2222" },
    extracto,
    flota[0],
  ),
  false,
);
check(
  "misma ref exacta + monto + fecha sin carro en el extracto = perfecto",
  esCrucePerfecto(
    pago({ referencia: "9988-7766", numeroCarro: "144" }),
    { monto: 30, fecha: "2026-09-01", numeroCarro: null, referencia: "99887766" },
    extracto,
    flota[0],
  ),
  true,
);
check(
  "sin carro ni ref no es perfecto",
  esCrucePerfecto(
    pago({ numeroCarro: null, referencia: null, contratoId: "c-144" }),
    { monto: 30, fecha: "2026-09-01", numeroCarro: null, referencia: null },
    extracto,
    flota[0],
  ),
  false,
);

console.log("\n· Decisión: aplicar vs sugerir");
const d1 = decidirMovimiento(mov144, [pago({})], flota, extracto);
check("un comprobante que calza se aplica", d1.tipo, "perfecto");

const dNombre = decidirMovimiento(
  { monto: 30, fecha: "2026-09-01", numeroCarro: null, nombre: "EDGAR JOEL BONILLA" },
  [],
  flota,
  extracto,
);
check("solo el nombre NO aplica", dNombre.tipo, "revisar");
check("pero sí sugiere el contrato", dNombre.tipo === "revisar" ? dNombre.sugerido?.contratoId : null, "c-144");
check("la vía es nombre", dNombre.tipo === "revisar" ? dNombre.via : null, "nombre");

const dCarro = decidirMovimiento(
  { monto: 30, fecha: "2026-09-01", numeroCarro: "144", nombre: null },
  [],
  flota,
  extracto,
);
check("carro sin comprobante queda en revisión", dCarro.tipo, "revisar");
check("sugiere el carro, no aplica", dCarro.tipo === "revisar" ? dCarro.via : null, "carro");

const dColision = decidirMovimiento(
  { monto: 30, fecha: "2026-09-01", numeroCarro: null, nombre: "JOSE" },
  [],
  flota,
  extracto,
);
check("un nombre corto no alcanza para sugerir", dColision.tipo === "revisar" ? dColision.sugerido : null, null);

const dos = [
  pago({ id: "p1" }),
  pago({ id: "p2", numeroCarro: "144" }),
];
const dAmb = decidirMovimiento(mov144, dos, flota, extracto);
check("dos comprobantes iguales = ambiguo, no aplica el primero", dAmb.tipo, "ambiguo");
check("ambiguo trae los dos pagos", dAmb.tipo === "ambiguo" ? dAmb.pagos.length : 0, 2);

const dosConRef = [
  pago({ id: "p1", referencia: "AAAA1111" }),
  pago({ id: "p2", referencia: "BBBB2222" }),
];
const dDesempate = decidirMovimiento(
  { ...mov144, referencia: "BBBB2222" },
  dosConRef,
  flota,
  extracto,
);
check("referencia exacta desempata ambiguos", dDesempate.tipo, "perfecto");
check(
  "gana el de la misma ref",
  dDesempate.tipo === "perfecto" ? dDesempate.pago.id : null,
  "p2",
);

const dSoloRef = decidirMovimiento(
  { monto: 30, fecha: "2026-09-01", numeroCarro: null, nombre: null, referencia: "99887766" },
  [pago({ referencia: "99887766", numeroCarro: "144" })],
  flota,
  extracto,
);
check("solo ref exacta aplica si hay contrato del pago", dSoloRef.tipo, "perfecto");

check(
  "misma huella si solo cambia el formato del $",
  huellaMovimiento("2026-09-01", 30, "TRANSFERENCIA DE JUAN CARRO 144 $30.00"),
  huellaMovimiento("2026-09-01", 30, "TRANSFERENCIA DE JUAN CARRO 144"),
);
check(
  "huella distinta si cambia el monto",
  huellaMovimiento("2026-09-01", 30, "X") === huellaMovimiento("2026-09-01", 35, "X"),
  false,
);

console.log(fallos === 0 ? `\n✅ Todo en verde.` : `\n❌ ${fallos} casos fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
