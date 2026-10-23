import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  deudaDeCarro,
  fechaInformeCartera,
  filasDelInforme,
  metaDelInforme,
  pagoDe,
  partirPago,
  totalDeudaDe,
  tramosDeEventos,
  type CargoInforme,
  type CarroInforme,
  type PagoInforme,
} from "../lib/cartera/informe-mes.ts";
import { libroInforme } from "../lib/cartera/informe-xlsx.ts";

const carro: CarroInforme = {
  id: "c1",
  numero: "166",
  empresa: "KW",
  conductor: "KEVIN",
  desdeContrato: "2026-09-01",
};

const cargos: CargoInforme[] = [
  { contratoId: "c1", fecha: "2026-09-30", tipo: "renta", concepto: "Cuota diaria", codigo: null, monto: 100 },
  { contratoId: "c1", fecha: "2026-10-01", tipo: "renta", concepto: "Cuota diaria", codigo: null, monto: 30 },
  { contratoId: "c1", fecha: "2026-10-01", tipo: "afiliacion", concepto: "Abono inicial", codigo: "AFILIACION", monto: 50 },
];
const pagos: PagoInforme[] = [
  {
    contratoId: "c1",
    fecha: "2026-09-20",
    monto: 40,
    metodo: "transferencia",
    notas: null,
    rubro: null,
    asignaciones: [{ tipo: "cuenta_diaria", aplicado: 40 }],
  },
  {
    contratoId: "c1",
    fecha: "2026-10-01",
    monto: 80,
    metodo: "efectivo",
    notas: null,
    rubro: null,
    asignaciones: [
      { tipo: "cuenta_diaria", aplicado: 30 },
      { tipo: "abono", aplicado: 50 },
    ],
  },
];

const parte = partirPago(pagos[1]);
assert.equal(parte.efect, 80);
assert.equal(parte.general, 0);
assert.equal(parte.pagos.Cuota, 30);
assert.equal(parte.pagos["Abono inicial financiado"], 50);

const filas = filasDelInforme([carro], cargos, pagos, "2026-10-01", "2026-10-02");
assert.equal(filas.length, 2);
const dia1 = filas[0];
assert.equal(dia1.fecha, "2026-10-01");
assert.equal(dia1.letra, 30);
assert.equal(dia1.deudas.Cuota, 60);
assert.equal(dia1.deudas["Abono inicial financiado"], 50);
assert.equal(pagoDe(dia1), 80);
assert.equal(totalDeudaDe(dia1), 60);
const deuda = deudaDeCarro(filas, "KW", "166");
assert.equal(deuda.Cuota, 60);
assert.equal(deuda["Abono inicial financiado"], 0);
assert.equal(deuda.total, 60);

const soloDia = filasDelInforme([carro], cargos, pagos, "2026-10-02", "2026-10-02");
assert.equal(soloDia.length, 1);
assert.equal(soloDia[0].fecha, "2026-10-02");
assert.equal(soloDia[0].deudas.Cuota, 60);
assert.equal(soloDia[0].deudas["Abono inicial financiado"], 0);

const meta = metaDelInforme("2026-10-01", "2026-10-02", null, null, 1);
assert.equal(meta.meta, null);
assert.equal(meta.mes, "2026-10-01");
assert.match(meta.nota, /Sin meta/);

const buf = await libroInforme(filas, meta, "2026-10-01", "2026-10-02");
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf as never);
assert.deepEqual(wb.worksheets.map((w) => w.name), [
  "INFORME_2025",
  "META",
  "EXTRACTO_CARRO",
  "CALCULO_EXTRACTO",
  "TOTAL_RECAUDO",
  "TOTAL_PAGO_RECAUDO",
  "TOTAL_DEUDA",
  "TOTAL_RECAUDO_DISCRI",
]);
const base = wb.getWorksheet("INFORME_2025")!;
assert.equal(base.getCell("G2").formula, "SUM(I2:J2)");
assert.equal(base.getCell("U2").formula, "SUM(V2:AE2)-(SUM(K2:T2))+F2");
const extracto = wb.getWorksheet("EXTRACTO_CARRO")!;
assert.equal(extracto.getCell("A2").value, 166);
assert.equal(extracto.getCell("B2").value, "KW");
assert.match(String(extracto.getCell("D2").formula), /SUMIFS/);
const metaHoja = wb.getWorksheet("META")!;
assert.equal(metaHoja.getCell("C2").value, null);
assert.match(String(metaHoja.getCell("E2").formula), /SUMIFS/);

assert.equal(fechaInformeCartera("2026-10-23T16:59:00.000Z", "2026-10-23"), "2026-10-22");
assert.equal(fechaInformeCartera("2026-10-23T17:00:00.000Z", "2026-10-23"), "2026-10-23");
assert.equal(fechaInformeCartera("2026-10-22T20:00:00.000Z", "2026-10-22"), "2026-10-22");
assert.equal(fechaInformeCartera(null, "2026-10-23"), "2026-10-23");

const adelantado: CarroInforme = {
  id: "c2",
  numero: "69",
  empresa: "AUTOLUJO",
  conductor: "ANA",
  desdeContrato: "2026-10-01",
};
const letrasAdelanto: CargoInforme[] = [1, 2, 3, 4].map((d) => ({
  contratoId: "c2",
  fecha: `2026-10-0${d}`,
  tipo: "renta",
  concepto: "Cuota diaria",
  codigo: null,
  monto: 30,
}));
const pagoAdelanto: PagoInforme = {
  contratoId: "c2",
  fecha: "2026-10-01",
  monto: 90,
  metodo: "transferencia",
  notas: "lectura ia del comprobante",
  rubro: null,
  asignaciones: [{ tipo: "cuenta_diaria", aplicado: 90 }],
};
const diasAdelanto = filasDelInforme([adelantado], letrasAdelanto, [pagoAdelanto], "2026-10-01", "2026-10-04");
assert.deepEqual(diasAdelanto.map((f) => f.detalle), ["", "AL DIA", "AL DIA", "NO PAGO"]);

const enTaller: CarroInforme = {
  ...adelantado,
  id: "c3",
  estadoVehiculo: "chapisteria",
  tramos: tramosDeEventos(
    [{ fecha: "2026-10-02", detalle: "pausa-productiva:chapisteria", created_at: "2026-10-02T12:00:00Z" }],
    "chapisteria",
    "c3",
  ),
};
const diasTaller = filasDelInforme(
  [enTaller],
  letrasAdelanto.map((c) => ({ ...c, contratoId: "c3" })),
  [{ ...pagoAdelanto, contratoId: "c3" }],
  "2026-10-01",
  "2026-10-04",
);
assert.deepEqual(diasTaller.map((f) => f.detalle), ["", "CHAPISTERIA", "CHAPISTERIA", "CHAPISTERIA"]);

const porEntregar: CarroInforme = {
  id: "c4",
  numero: "56",
  empresa: "AUTOLUJO",
  conductor: "LUIS",
  desdeContrato: "2026-10-01",
  estadoVehiculo: "por_entregar",
  tramos: tramosDeEventos([], "por_entregar", "c4"),
};
const diasEntrega = filasDelInforme(
  [porEntregar],
  [{ contratoId: "c4", fecha: "2026-10-01", tipo: "renta", concepto: "Cuota diaria", codigo: null, monto: 25 }],
  [],
  "2026-10-01",
  "2026-10-02",
);
assert.deepEqual(diasEntrega.map((f) => f.detalle), ["NO PAGO", "X ENTREGAR"]);

console.log("Informe mensual: pestañas, pago, deuda y detalle OK");
