import assert from "node:assert/strict";
import {
  empresaDeCarro,
  fusionarFilasExcel,
  prepararCarga,
  resumenCarga,
} from "../lib/cartera/ex-clientes-carga.ts";

assert.equal(empresaDeCarro("AL15"), "AUTOLUJO");
assert.equal(empresaDeCarro("KW114"), "KOWUA");
assert.equal(empresaDeCarro("G33"), "GOLD");
assert.equal(empresaDeCarro("g01"), "GOLD");
assert.equal(empresaDeCarro(""), null);

const fusion = fusionarFilasExcel([
  {
    carro: "G33",
    nombre: "AARON JAFET VINDA GUDIÑO",
    cedula: "4-775-1522",
    celular: "61673548",
    deuda: 589,
    motivo: "DESISTE, PAGARA 20 SEMANALES",
  },
  {
    carro: "G33",
    nombre: "Aaron Jafet Vinda Gudiño",
    cedula: "4-775-1522",
    celular: "+50761673548",
    deuda: 589,
    motivo: "desiste, PAGARA EN LA SEMANA",
  },
  {
    carro: "AL26",
    nombre: "LUIS ALBERTO HASSAN",
    cedula: "3-723-1929",
    celular: "67134579",
    deuda: 125,
    motivo: "DESISTE",
  },
]);
assert.equal(fusion.length, 2);
const aaron = fusion.find((f) => f.cedula === "4-775-1522");
assert.equal(aaron?.deuda, 589);
assert.ok(aaron?.motivo.includes("SEMANALES") || aaron?.motivo.includes("SEMANA"));

const { listas, sinEmpresa } = prepararCarga(fusion);
assert.equal(sinEmpresa.length, 0);
assert.equal(listas.length, 2);
assert.equal(listas.find((f) => f.carro === "G33")?.empresaCodigo, "GOLD");
assert.equal(listas.find((f) => f.carro === "G33")?.whatsapp, "+50761673548");

const r = resumenCarga(listas);
assert.equal(r.personas, 2);
assert.equal(r.saldo, 714);

console.log("Ex clientes: fusión del Excel y empresa por carro OK");
