import assert from "node:assert/strict";
import { decidirCargoDeConcepto } from "../lib/cartera/rubros-pago.ts";

// Alta panapass $20 suelto + pago asigna $20 → reclama, no inserta.
{
  const d = decidirCargoDeConcepto({
    asignado: 20,
    abiertos: 20,
    deOtrosPagos: 0,
    pagadoPorOtros: 0,
  });
  assert.equal(d.reclamarAbiertos, true);
  assert.equal(d.faltaInsertar, 0);
}

// Sin cargo abierto → inserta lo asignado.
{
  const d = decidirCargoDeConcepto({
    asignado: 20,
    abiertos: 0,
    deOtrosPagos: 0,
    pagadoPorOtros: 0,
  });
  assert.equal(d.reclamarAbiertos, false);
  assert.equal(d.faltaInsertar, 20);
}

// Abierto $20 + otro pago ya cubrió $10 de un cargo de $30 → falta $0 al asignar $20? 
// abiertos 0, deOtros 30, pagadoOtros 10 → libre 20 → asignado 20 → falta 0
{
  const d = decidirCargoDeConcepto({
    asignado: 20,
    abiertos: 0,
    deOtrosPagos: 30,
    pagadoPorOtros: 10,
  });
  assert.equal(d.reclamarAbiertos, false);
  assert.equal(d.faltaInsertar, 0);
}

// Abierto parcial $10, asignan $20 → no reclama todo; inserta $10.
{
  const d = decidirCargoDeConcepto({
    asignado: 20,
    abiertos: 10,
    deOtrosPagos: 0,
    pagadoPorOtros: 0,
  });
  assert.equal(d.reclamarAbiertos, false);
  assert.equal(d.faltaInsertar, 10);
}

console.log("concepto-cargo: OK");
