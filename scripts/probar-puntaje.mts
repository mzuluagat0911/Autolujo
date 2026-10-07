// Puntaje en sombra. No cambia la decisión del motor.
//   npm run probar:puntaje

import { instantePanama } from "@/lib/cartera/fecha";
import { decidirMovimiento, type ContratoFlota, type PagoCandidato } from "@/lib/cartera/cruce";
import { partirNotaSombra, puntuarMovimiento, textoSombra } from "@/lib/cartera/puntaje-cruce";
import { aplicarEnEsteNivel } from "@/lib/cartera/activacion-cruce";

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
  { contratoId: "g-25", letra: 35, numero: "G25", clienteNombre: "Odalys", empresaId: EMP },
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
    referencia: "99887766",
    ...over,
  };
}

const mov = {
  monto: 30,
  fecha: "2026-09-01",
  numeroCarro: "144",
  nombre: null as string | null,
  referencia: "99887766",
  descripcion: "TRANSFERENCIA CARRO 144",
};

const motor = decidirMovimiento(mov, [pago({})], flota, extracto);
const sombra = puntuarMovimiento(mov, [pago({})], flota, extracto, motor);
check("el motor sigue aplicando el cruce perfecto", motor.tipo, "perfecto");
check("la sombra recomienda automático", sombra.tipo, "automatico");
check("la sombra coincide y señala el mismo pago", sombra.coincide && sombra.pagoId, "p1");
check("el puntaje automático pasa el umbral", (sombra.puntaje ?? 0) >= 80, true);
check("explica carro, monto y referencia", sombra.candidatos[0]?.senales.map((s) => s.codigo).sort(), [
  "carro",
  "contrato",
  "cuenta",
  "empresa",
  "fecha",
  "monto",
  "referencia_exacta",
].sort());

const soloTexto = {
  monto: 30,
  fecha: "2026-09-01",
  numeroCarro: null,
  nombre: null,
  referencia: null,
  descripcion: "pago ref 99887766",
};
const pagoTexto = pago({ numeroCarro: null, referencia: "99887766" });
const motorTexto = decidirMovimiento(soloTexto, [pagoTexto], flota, extracto);
const sombraTexto = puntuarMovimiento(soloTexto, [pagoTexto], flota, extracto, motorTexto);
check("el motor aplica si la referencia está en el texto", motorTexto.tipo, "perfecto");
check("la sombra no automatiza una referencia que solo está en el texto", sombraTexto.tipo, "revision");
check("esa diferencia queda marcada y no cambia el motor", sombraTexto.coincide, false);

const otro = pago({
  id: "p2",
  referencia: "11223344",
  numeroCarro: "144",
});
const sinRef = { ...mov, referencia: null, descripcion: "TRANSFERENCIA CARRO 144" };
const motorAmbiguo = decidirMovimiento(sinRef, [pago({ referencia: null }), otro], flota, extracto);
const sombraAmbigua = puntuarMovimiento(sinRef, [pago({ referencia: null }), otro], flota, extracto, motorAmbiguo);
check("dos comprobantes distintos siguen en revisión para el motor", motorAmbiguo.tipo, "ambiguo");
check("la sombra también pide revisión", sombraAmbigua.tipo, "revision");
check("coinciden en no automatizar el ambiguo", sombraAmbigua.coincide, true);

const movG = { ...mov, numeroCarro: "25", descripcion: "carro 25", referencia: null };
const pagoG = pago({ id: "pg", contratoId: "g-25", numeroCarro: "25", referencia: null });
const motorG = decidirMovimiento(movG, [pagoG], flota, extracto);
const sombraG = puntuarMovimiento(movG, [pagoG], flota, extracto, motorG);
check("el 25 pelado no se aplica al G25", motorG.tipo, "sin_comprobante");
check("la sombra bloquea esa contradicción", sombraG.tipo, "omitido");
check("motor y sombra coinciden en no cruzar G25", sombraG.coincide, true);

const nota = partirNotaSombra(`${motor.tipo === "perfecto" ? "Cruce perfecto" : ""}\n${textoSombra(sombra)}`);
check("la nota separa el motivo operativo de la sombra", nota.sombra?.startsWith("Sombra: automático"), true);
check("el motivo operativo no arrastra la sombra", nota.motivo?.includes("Sombra:"), false);

const puertaPerfecta = aplicarEnEsteNivel(motor, sombra);
check("confianza máxima aplica carro y referencia exacta", puertaPerfecta.aplicar, true);
check("ese cruce no queda retenido", puertaPerfecta.retenido, false);

const puertaTexto = aplicarEnEsteNivel(motorTexto, sombraTexto);
check("una referencia solo en el texto no mueve dinero", puertaTexto.aplicar, false);
check("ese cruce queda en revisión", puertaTexto.retenido, true);
check("con la llave apagada el motor sí lo aplicaría", aplicarEnEsteNivel(motorTexto, sombraTexto, "motor").aplicar, true);

const movCarro = { ...mov, referencia: "BANCO999", descripcion: "TRANSFERENCIA CARRO 144" };
const pagoCarro = pago({ referencia: "99887766" });
const motorCarro = decidirMovimiento(movCarro, [pagoCarro], flota, extracto);
const sombraCarro = puntuarMovimiento(movCarro, [pagoCarro], flota, extracto, motorCarro);
check("el carro inequívoco sigue siendo perfecto aunque la ref del banco difiera", motorCarro.tipo, "perfecto");
check("la sombra también lo da por automático", sombraCarro.tipo, "automatico");
check("la llave aplica el carro inequívoco", aplicarEnEsteNivel(motorCarro, sombraCarro).aplicar, true);

const movRef = { ...mov, numeroCarro: null, descripcion: "ACH", referencia: "99887766" };
const pagoRef = pago({ numeroCarro: null, referencia: "99887766" });
const motorRef = decidirMovimiento(movRef, [pagoRef], flota, extracto);
const sombraRef = puntuarMovimiento(movRef, [pagoRef], flota, extracto, motorRef);
check("la referencia exacta del voucher, sin carro, sigue siendo perfecta", motorRef.tipo, "perfecto");
check("la llave aplica esa referencia exacta", aplicarEnEsteNivel(motorRef, sombraRef).aplicar, true);

check("un ambiguo no lo retiene la llave: ya iba a revisión", aplicarEnEsteNivel(motorAmbiguo, sombraAmbigua).retenido, false);
check("un 25 pelado sigue omitido", aplicarEnEsteNivel(motorG, sombraG).aplicar, false);

if (fallos > 0) {
  console.error(`\n${fallos} pruebas fallaron`);
  process.exit(1);
}
console.log("\n✅ Puntaje en sombra en verde.");
