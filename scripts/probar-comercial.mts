import assert from "node:assert/strict";
import { partirArchivo, textoConArchivo } from "../lib/comercial/archivo.ts";
import { esSaludoDeClienteNuevo, MENSAJE_BIENVENIDA } from "../lib/comercial/bienvenida.ts";
import { avisoCitaPendiente } from "../lib/comercial/avisos-cita.ts";
import { validarHorario } from "../lib/comercial/sedes.ts";
import { entregaNueva } from "../lib/comercial/entrega.ts";
import { decisionPiloto, numeroEnPiloto, ordenarPorReciente } from "../lib/comercial/piloto.ts";
import { medianaMinutos } from "../lib/comercial/resultados.ts";
import {
  esSolicitudNoContacto,
  horasHastaSeguimiento,
  lecturaLeadConReglas,
} from "../lib/comercial/lead.ts";

const base = {
  temperatura: "tibio" as const,
  score: 50,
  motivo: "Hay interés inicial.",
};

const caliente = lecturaLeadConReglas(
  ["¿Está disponible el Kia Picanto? Quiero sacar el carro esta semana. ¿Me pueden llamar para una cita?"],
  base,
);
assert.equal(caliente.temperatura, "caliente");
assert.ok(caliente.score >= 70);

const noContactar = lecturaLeadConReglas(
  ["Ya no me interesa, por favor no contactar."],
  { temperatura: "caliente", score: 90, motivo: "Parecía interesado." },
);
assert.equal(noContactar.temperatura, "frio");
assert.ok(noContactar.score <= 15);
assert.equal(esSolicitudNoContacto(["No me contacten más, por favor."]), true);
assert.equal(esSolicitudNoContacto(["No me interesa ese Kia, ¿tienen otro?"]), false);

assert.equal(horasHastaSeguimiento("caliente", 1), 3);
assert.equal(horasHastaSeguimiento("caliente", 2), 24);
assert.equal(horasHastaSeguimiento("tibio", 1), 24);
assert.equal(horasHastaSeguimiento("frio", 1), 48);
assert.equal(horasHastaSeguimiento("frio", 4), null);

assert.equal(
  avisoCitaPendiente({
    fecha: "2026-10-13",
    hora: "10:00",
    ahora: new Date("2026-10-12T09:59:00-05:00"),
  }),
  null,
);
assert.equal(
  avisoCitaPendiente({
    fecha: "2026-10-13",
    hora: "10:00",
    ahora: new Date("2026-10-12T10:00:00-05:00"),
  }),
  "24h",
);
assert.equal(
  avisoCitaPendiente({
    fecha: "2026-10-13",
    hora: "10:00",
    ahora: new Date("2026-10-13T08:00:00-05:00"),
    aviso24hAt: "2026-10-12T15:00:00Z",
  }),
  "dia",
);
assert.equal(
  avisoCitaPendiente({
    fecha: "2026-10-13",
    hora: "10:00",
    ahora: new Date("2026-10-13T07:30:00-05:00"),
    aviso24hAt: "2026-10-12T15:00:00Z",
  }),
  null,
);
assert.equal(medianaMinutos([10, 50, 30]), 30);
assert.equal(medianaMinutos([10, 40]), 25);
assert.equal(medianaMinutos([]), null);

assert.deepEqual(decisionPiloto("50760001111", { agente: "recomendacion" }), {
  responde: true,
  envia: true,
});
assert.deepEqual(decisionPiloto("50760001111", { agente: "off" }), {
  responde: false,
  envia: false,
});
assert.deepEqual(decisionPiloto("50760001111", { agente: "on", numeros: "50769998888" }), {
  responde: true,
  envia: true,
});
assert.equal(numeroEnPiloto("50760001111", "6000-1111"), true);
assert.equal(numeroEnPiloto("50760001111", "50769998888"), true);
assert.equal(entregaNueva("enviado", "delivered"), "entregado");
assert.equal(entregaNueva("leido", "delivered"), null);
assert.equal(entregaNueva("entregado", "failed"), "fallido");

const muchos = Array.from({ length: 10_000 }, (_, i) => ({
  ultimoMensajeAt: new Date(Date.now() - i * 1000).toISOString(),
}));
const inicio = performance.now();
const ordenados = ordenarPorReciente(muchos);
const ms = performance.now() - inicio;
assert.equal(ordenados[0]?.ultimoMensajeAt, muchos[0]?.ultimoMensajeAt);
assert.ok(ms < 80, `ordenar 10.000 chats tardó ${ms.toFixed(1)} ms`);

assert.equal(validarHorario("juan_diaz", "2026-10-14", "16:00"), null);
assert.equal(validarHorario("chorrera", "2026-10-14", "16:30") !== null, true);
assert.equal(validarHorario("chorrera", "2026-10-18", "10:00") !== null, true);
const marcado = textoConArchivo("📷 Documento para preaprobado", "comercial/2026/a.jpg");
assert.equal(partirArchivo(marcado).archivo, "comercial/2026/a.jpg");
assert.equal(partirArchivo(marcado).texto, "📷 Documento para preaprobado");
assert.equal(esSaludoDeClienteNuevo([{ direccion: "in", texto: "Quiero carro" }]), true);
assert.equal(esSaludoDeClienteNuevo([{ direccion: "in", texto: "Hello" }]), true);
assert.equal(esSaludoDeClienteNuevo([{ direccion: "in", texto: "Hola, buenas" }]), true);
assert.equal(esSaludoDeClienteNuevo([{ direccion: "in", texto: "Buenas, quiero información" }]), true);
assert.equal(
  esSaludoDeClienteNuevo([
    { direccion: "in", texto: "Hola" },
    { direccion: "out", texto: MENSAJE_BIENVENIDA },
    { direccion: "in", texto: "Hola" },
  ]),
  false,
);
assert.equal(esSaludoDeClienteNuevo([{ direccion: "in", texto: "Hola, ¿cuánto es la letra?" }]), false);
assert.ok(MENSAJE_BIENVENIDA.includes("https://bit.ly/tratamientodedatosautolujopanama"));
assert.ok(MENSAJE_BIENVENIDA.includes("desde $25"));
assert.ok(MENSAJE_BIENVENIDA.includes("desde $350"));

console.log("CRM comercial: clasificación, citas, piloto y resultados OK");
