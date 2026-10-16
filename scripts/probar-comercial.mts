import assert from "node:assert/strict";
import { partirArchivo, textoConArchivo } from "../lib/comercial/archivo.ts";
import { pideUbicacion, sedesParaVideo } from "../lib/comercial/video-sede.ts";
import { esSaludoDeClienteNuevo, MENSAJE_BIENVENIDA } from "../lib/comercial/bienvenida.ts";
import { mensajeNaturalLucia } from "../lib/comercial/voz.ts";
import { avisoCitaPendiente } from "../lib/comercial/avisos-cita.ts";
import {
  ajustarMensajeDeCita,
  esDudaSuelta,
  pedidoRepiteCita,
  preguntaPorElDiaDeLaCita,
  telefonoVisible,
  textoDeLaCitaAbierta,
  textoEsConfirmacion,
} from "../lib/comercial/cita-pedido.ts";
import { validarHorario } from "../lib/comercial/sedes.ts";
import { entregaNueva } from "../lib/comercial/entrega.ts";
import { decisionPiloto, numeroEnPiloto, ordenarPorReciente } from "../lib/comercial/piloto.ts";
import { medianaMinutos } from "../lib/comercial/resultados.ts";
import {
  esSolicitudNoContacto,
  horasHastaSeguimiento,
  textoSeguimientoLead,
  lecturaLeadConReglas,
  nombreDeWhatsApp,
  textosDelCliente,
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
const soloHola = lecturaLeadConReglas(["Hola"], { temperatura: "frio", score: 20, motivo: "Saludó." });
const conOferta = lecturaLeadConReglas(
  ["Hola", "Ya tenemos carros para separar su vehículo."],
  { temperatura: "frio", score: 20, motivo: "Saludó." },
);
assert.ok(conOferta.score > soloHola.score);
assert.deepEqual(textosDelCliente([
  { direccion: "in", texto: "Hola" },
  { direccion: "out", texto: "Ya tenemos carros para separar su vehículo." },
]), ["Hola"]);
assert.equal(nombreDeWhatsApp("Mateo Zuluaga"), "Mateo Zuluaga");
assert.equal(nombreDeWhatsApp("12345"), null);
assert.equal(nombreDeWhatsApp("❤#Adorada❤#"), "Adorada");
assert.equal(telefonoVisible("50766432422", null), "6643-2422");
assert.equal(telefonoVisible("573135076319", null), "+57 313 507 6319");
assert.equal(esSolicitudNoContacto(["No me interesa ese Kia, ¿tienen otro?"]), false);

assert.equal(horasHastaSeguimiento("caliente", 1), 3);
assert.equal(horasHastaSeguimiento("caliente", 2), 24);
assert.equal(horasHastaSeguimiento("caliente", 3), 24);
assert.equal(horasHastaSeguimiento("tibio", 1), 24);
assert.equal(horasHastaSeguimiento("tibio", 2), 48);
assert.equal(horasHastaSeguimiento("frio", 1), 48);
assert.equal(horasHastaSeguimiento("frio", 3), 48);
assert.equal(horasHastaSeguimiento("frio", 4), 24);
assert.equal(horasHastaSeguimiento("caliente", 5), 72);
assert.equal(horasHastaSeguimiento("caliente", 6), 24 * 7);
assert.equal(horasHastaSeguimiento("caliente", 7), 24 * 10);
assert.equal(horasHastaSeguimiento("caliente", 8), 48);
assert.equal(horasHastaSeguimiento("caliente", 9), null);
assert.match(
  textoSeguimientoLead({ nombre: "Ana", proximaAccion: "¿De qué lugar nos escribe?", intento: 1 }),
  /¿De qué lugar nos escribe\?/,
);
assert.match(
  textoSeguimientoLead({ nombre: "Ana", proximaAccion: "Esperar si pide cita.", intento: 1 }),
  /Quedé pendiente/,
);
assert.match(
  textoSeguimientoLead({ nombre: null, proximaAccion: null, intento: 2 }),
  /Juan Díaz o en La Chorrera/,
);
assert.match(
  textoSeguimientoLead({ nombre: "Ana", proximaAccion: null, intento: 7 }),
  /último mensaje/,
);

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
assert.ok(MENSAJE_BIENVENIDA.includes("desde $100"));
assert.equal(MENSAJE_BIENVENIDA.includes("$350"), false);
const eco =
  "Por aquí le atiendo mejor por escrito o con una foto del documento. Cuénteme qué está buscando.";
assert.equal(mensajeNaturalLucia(eco, eco).includes("Por aquí le atiendo"), false);
assert.equal(
  mensajeNaturalLucia("Claro, le paso con un compañero. Enseguida le escriben por aquí.").includes("compañero"),
  false,
);
assert.equal(mensajeNaturalLucia("Soy una inteligencia artificial.").includes("inteligencia"), false);
assert.ok(mensajeNaturalLucia("Soy una inteligencia artificial.").includes("Lucía"));
assert.equal(mensajeNaturalLucia("Hola, soy Lucía. ¿En qué le puedo ayudar?").includes("ayudar"), false);
assert.equal(
  mensajeNaturalLucia("El abono inicial desde $350."),
  "El abono inicial desde $100.",
);
assert.equal(mensajeNaturalLucia("Perfecto, ❤#Adorada❤#. La esperamos."), "Perfecto, Adorada. La esperamos.");
assert.equal(textoEsConfirmacion("ok"), true);
assert.equal(textoEsConfirmacion("Ok me interesa un Grand i 10 del año tienen❓"), false);
assert.equal(preguntaPorElDiaDeLaCita("Mi cita es hoy 16"), true);
assert.equal(esDudaSuelta("❓"), true);
assert.equal(
  textoDeLaCitaAbierta({
    nombre: "❤#Adorada❤#",
    fecha: "2026-10-16",
    hora: "13:00",
    sede: "chorrera",
    hoy: "2026-10-16",
  }),
  "Adorada, su cita queda hoy, viernes 16 de octubre, a las 1 p. m., en La Chorrera. Ahí lo esperamos.",
);
assert.equal(
  ajustarMensajeDeCita(
    "Disculpe, me confundí. ¿Le gustaría confirmar su cita para mañana, viernes 16 de octubre, a la 1 p.m. en La Chorrera, o prefiere agendarla en Juan Díaz?",
    { hoy: "2026-10-16", fechaCita: "2026-10-16", cliente: "Mi cita es hoy 16" },
  ),
  "Disculpe, me confundí. ¿Le gustaría confirmar su cita para hoy, viernes 16 de octubre, a la 1 p.m. en La Chorrera.",
);
const citaJueves = { sede: "juan_diaz", fecha: "2026-10-15", hora: "11:00", nombre: "Mateo" };
assert.equal(
  pedidoRepiteCita(citaJueves, { accion: "agendar", sede: "juan_diaz", fecha: "2026-10-15", hora: "11:00", nombre: "Mateo" }),
  true,
);
assert.equal(
  pedidoRepiteCita(citaJueves, { accion: "reagendar", sede: "juan_diaz", fecha: "2026-10-16", hora: "11:00", nombre: "Mateo" }),
  false,
);
assert.equal(
  pedidoRepiteCita(citaJueves, { accion: "confirmar", sede: null, fecha: null, hora: null, nombre: null }),
  false,
);
assert.equal(textoEsConfirmacion("sí"), true);
assert.equal(textoEsConfirmacion("me peudes decir que carros hay disponibles ?"), false);
assert.equal(textoEsConfirmacion("como puedo llegar me dices ?"), false);
assert.equal(textoEsConfirmacion("algo que deba llevar para ese día ?"), false);
assert.equal(pideUbicacion("como puedo llegar me dices ?"), true);
assert.equal(pideUbicacion("qué carros hay disponibles"), false);
assert.deepEqual(sedesParaVideo("donde queda la de panama", null), ["juan_diaz"]);
assert.deepEqual(sedesParaVideo("como llegar", "chorrera"), ["chorrera"]);
assert.deepEqual(sedesParaVideo("donde quedan", null), ["juan_diaz", "chorrera"]);

console.log("CRM comercial: clasificación, citas, piloto y resultados OK");
