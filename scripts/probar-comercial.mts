import assert from "node:assert/strict";
import { partirArchivo, textoConArchivo } from "../lib/comercial/archivo.ts";
import { pideUbicacion, sedesParaVideo } from "../lib/comercial/video-sede.ts";
import { esClicDeAnuncio, esSaludoDeClienteNuevo, MENSAJE_BIENVENIDA, sinBienvenidaRepetida } from "../lib/comercial/bienvenida.ts";
import { MENSAJE_ASESOR, mensajeNaturalLucia } from "../lib/comercial/voz.ts";
import { avisoCitaPendiente } from "../lib/comercial/avisos-cita.ts";
import {
  ajustarMensajeDeCita,
  esDudaSuelta,
  pedidoRepiteCita,
  preguntaPorElDiaDeLaCita,
  repiteCitaPorDuda,
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
  pideAsesorHumano,
  preguntaSiEsBot,
  esPausaPorAsesor,
  MOTIVO_PIDIO_ASESOR,
} from "../lib/comercial/lead.ts";
import { PLANTILLAS_SEGUIMIENTO, plantillaAunNoLista, plantillaSeguimiento } from "../lib/comercial/plantillas.ts";

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
assert.equal(nombreDeWhatsApp("Maria de los Angeles"), "Maria de los Angeles");
assert.equal(nombreDeWhatsApp("José de Dios"), "José de Dios");
assert.equal(nombreDeWhatsApp("alabado sea el señor"), null);
assert.equal(nombreDeWhatsApp("Fe amor paz"), null);
assert.equal(nombreDeWhatsApp("productos milanesa"), null);
assert.equal(nombreDeWhatsApp("Infraestructura J M B"), null);
assert.equal(nombreDeWhatsApp("Dios es Bueno"), null);
assert.equal(nombreDeWhatsApp("Dios"), null);
assert.equal(pideAsesorHumano("Háblale con un agente"), true);
assert.equal(pideAsesorHumano("Pueden llamarme"), true);
assert.equal(pideAsesorHumano("¿Eres un agente?"), false);
assert.equal(preguntaSiEsBot("¿Eres un agente?"), true);
assert.equal(esPausaPorAsesor(MOTIVO_PIDIO_ASESOR), true);
assert.equal(esClicDeAnuncio("¡Hola! Quiero más información"), true);
assert.equal(esClicDeAnuncio("¿A cuántos años es el contrato?"), false);
assert.equal(
  sinBienvenidaRepetida(MENSAJE_BIENVENIDA, [
    { direccion: "in", texto: "Hola" },
    { direccion: "out", texto: MENSAJE_BIENVENIDA },
    { direccion: "in", texto: "¡Hola! Quiero más información" },
  ]).includes("tratamientodedatos"),
  false,
);
assert.match(plantillaSeguimiento("alabado sea el señor", 2).texto, /Hola, buenas/);
assert.equal(telefonoVisible("50766432422", null), "6643-2422");
assert.equal(telefonoVisible("573135076319", null), "+57 313 507 6319");
assert.equal(esSolicitudNoContacto(["No me interesa ese Kia, ¿tienen otro?"]), false);

assert.equal(horasHastaSeguimiento("caliente", 1), 3);
assert.equal(horasHastaSeguimiento("caliente", 2), 24);
assert.equal(horasHastaSeguimiento("caliente", 3), 24);
assert.equal(horasHastaSeguimiento("tibio", 1), 4);
assert.equal(horasHastaSeguimiento("tibio", 2), 48);
assert.equal(horasHastaSeguimiento("frio", 1), 8);
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
  /Juan Díaz o La Chorrera/,
);
assert.match(
  textoSeguimientoLead({
    nombre: "Shaggo",
    proximaAccion: "Preguntar día y hora para la cita en Juan Díaz o La Chorrera.",
    intento: 1,
  }),
  /Juan Díaz o La Chorrera/,
);
assert.equal(
  textoSeguimientoLead({
    nombre: "Shaggo",
    proximaAccion: "Preguntar día y hora para la cita en Juan Díaz o La Chorrera.",
    intento: 1,
  }).includes("Preguntar"),
  false,
);
assert.match(
  textoSeguimientoLead({ nombre: null, proximaAccion: null, intento: 2 }),
  /Juan Díaz o en La Chorrera/,
);
assert.match(
  textoSeguimientoLead({ nombre: "Ana", proximaAccion: null, intento: 7 }),
  /último mensaje/,
);
assert.equal(PLANTILLAS_SEGUIMIENTO.length, 7);
assert.equal(plantillaSeguimiento("Ana", 2).name, "comercial_seguimiento_2");
assert.match(plantillaSeguimiento("Ana", 2).texto, /Juan Díaz o en La Chorrera/);
assert.match(plantillaSeguimiento(null, 7).texto, /Hola, buenas/);
assert.match(plantillaSeguimiento("Ana", 7).texto, /último mensaje/);
assert.equal(
  plantillaAunNoLista("WhatsApp send falló (400): (#132001) Template name does not exist in the translation"),
  true,
);
assert.equal(plantillaAunNoLista("WhatsApp send falló (400): invalid phone"), false);

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
assert.ok(MENSAJE_BIENVENIDA.includes("$99.99"));
assert.ok(MENSAJE_BIENVENIDA.includes("Kia Soluto desde 2024"));
assert.equal(MENSAJE_BIENVENIDA.includes("desde $350"), false);
const eco =
  "Por aquí le atiendo mejor por escrito o con una foto del documento. Cuénteme qué está buscando.";
assert.equal(mensajeNaturalLucia(eco, eco).includes("Por aquí le atiendo"), false);
assert.equal(
  mensajeNaturalLucia("Claro, le paso con un compañero. Enseguida le escriben por aquí.").includes("compañero"),
  false,
);
assert.ok(
  mensajeNaturalLucia("Claro, le paso con un compañero. Enseguida le escriben por aquí.", "Háblale con un agente").includes(
    "6878-4560",
  ),
);
assert.equal(
  mensajeNaturalLucia("Claro, le paso con un compañero.", "Háblale con un agente").includes("qué carro"),
  false,
);
assert.equal(mensajeNaturalLucia("ok", "Háblale con un agente"), MENSAJE_ASESOR);
assert.ok(
  mensajeNaturalLucia("¿A qué hora le queda bien?", "Son usados?").includes("usados"),
);
assert.ok(
  mensajeNaturalLucia("El Kia Soluto 2026 tiene 1275 cuotas.", "¿A cuántos años sería el contrato?").includes(
    "3 años y medio",
  ),
);
assert.ok(
  mensajeNaturalLucia("La letra del i10 2020 es $25.", "¿Cuánto sería la quincena del i10 2020?").includes("$375"),
);
assert.ok(
  mensajeNaturalLucia("Por el momento no tenemos cobertura en esa zona.", "Soy de Veracruz").includes("sí puede venir"),
);
assert.equal(
  mensajeNaturalLucia("Por el momento no tenemos cobertura en esa zona.", "Soy de Veracruz").includes("no tenemos cobertura"),
  false,
);
assert.equal(
  mensajeNaturalLucia("El contrato son 1275 cuotas diarias, unos 3 años y medio. ¿Le agendo la visita para verlo?", "¿A cuántos años sería el contrato?", { hayCita: true }).includes(
    "agendo",
  ),
  false,
);
assert.ok(
  mensajeNaturalLucia("¿Le agendo la visita?", "¿Qué carros hay?").includes("Hyundai"),
);
assert.equal(mensajeNaturalLucia("Soy una inteligencia artificial.").includes("inteligencia"), false);
assert.ok(mensajeNaturalLucia("Soy una inteligencia artificial.").includes("Lucía"));
assert.equal(mensajeNaturalLucia("Hola, soy Lucía. ¿En qué le puedo ayudar?").includes("ayudar"), false);
assert.ok(mensajeNaturalLucia("El abono inicial desde $350.").includes("$99.99"));
assert.equal(mensajeNaturalLucia("El abono inicial desde $350.").includes("desde $350"), false);
assert.ok(mensajeNaturalLucia("El abono inicial desde $350.").includes("desde $25"));
assert.equal(mensajeNaturalLucia("El 2024 manual tiene abono de $100.").includes("$100"), true);
assert.ok(
  mensajeNaturalLucia("El abono de $80 no lo tenemos. El más barato es $100.", "Y este del abono de 80").includes(
    "se financia",
  ),
);
assert.equal(
  mensajeNaturalLucia("El abono de $80 no lo tenemos.", "Y este del abono de 80").includes("no lo tenemos"),
  false,
);
assert.ok(mensajeNaturalLucia("Puede visitarnos en Juan Díaz.", "Tengo 20 años").includes("no podemos seguir"));
assert.equal(mensajeNaturalLucia("Puede visitarnos en Juan Díaz.", "Tengo 20 años").includes("Juan Díaz"), false);
assert.equal(
  mensajeNaturalLucia("Le agendo la visita.", "Cumplo 25 el mes que viene").includes("no podemos seguir"),
  false,
);
assert.ok(
  mensajeNaturalLucia("Sí, hasta Aguadulce tenemos cobertura.", "Estoy en Aguadulce, ¿hasta acá tienen cobertura?").includes(
    "no tenemos cobertura",
  ),
);
assert.ok(
  mensajeNaturalLucia("Los mantenimientos están incluidos durante todo el contrato.", "Y los mantenimientos").includes(
    "12",
  ),
);
assert.equal(
  mensajeNaturalLucia("Los mantenimientos están incluidos durante todo el contrato.", "Y los mantenimientos").includes(
    "todo el contrato",
  ),
  false,
);
assert.ok(mensajeNaturalLucia("No puedo darle un teléfono.", "Deme un teléfono para llamar").includes("6878-4560"));
assert.ok(
  mensajeNaturalLucia("Cuénteme qué día y a qué hora le queda.", "No gracias déjelo así").includes("Entendido"),
);
assert.equal(
  mensajeNaturalLucia("Cuénteme qué día y a qué hora le queda.", "No gracias déjelo así").includes("qué día"),
  false,
);
assert.ok(mensajeNaturalLucia("El automático se confirma en la visita.", "Buenos días").startsWith("Buenos días."));
assert.ok(
  mensajeNaturalLucia("Hyundai y Kia, letras desde $25.").includes("Kia Soluto empieza en 2024"),
);
assert.ok(
  mensajeNaturalLucia("El Grand i10 automático lo tenemos desde $27.").includes("se confirma en la visita"),
);
assert.equal(
  mensajeNaturalLucia("El Grand i10 automático lo tenemos desde $27.").includes("$27"),
  false,
);
assert.equal(mensajeNaturalLucia("Perfecto, ❤#Adorada❤#. La esperamos."), "Perfecto, Adorada. La esperamos.");
assert.ok(
  mensajeNaturalLucia("El Grand i10 automático 2027 queda en $33.").includes("se confirma en la visita"),
);
assert.equal(
  mensajeNaturalLucia("El Grand i10 manual 2027 queda en $33."),
  "El Grand i10 manual 2027 queda en $33.",
);
assert.ok(
  mensajeNaturalLucia("El Grand i10 manual 2027 es $33, y el automático 2027 es $33.").includes(
    "se confirma en la visita",
  ),
);
assert.equal(
  mensajeNaturalLucia("El Grand i10 automático 2026 queda en $33. El Grand i10 automático 2027 queda en $33.").includes(
    "$33",
  ),
  false,
);
assert.ok(
  mensajeNaturalLucia("Los mantenimientos de las llantas se coordinan en la sede.", "¿Quién asume las llantas?").includes(
    "asume usted",
  ),
);
assert.ok(
  mensajeNaturalLucia("Eso lo ve el equipo en la visita.", "¿Y si me colisiono?").includes("avíseme"),
);
assert.equal(
  mensajeNaturalLucia("El recibo puede estar a nombre de un familiar directo.").includes("familiar"),
  false,
);
assert.ok(
  mensajeNaturalLucia("Cuando sepa, me avisa y le agendo.").includes("sábado"),
);
assert.equal(
  mensajeNaturalLucia("Avíseme cuando llegue y le confirmo.").includes("sábado"),
  false,
);
assert.ok(
  mensajeNaturalLucia(
    "Claro. Tenemos opciones de pago mensual. ¿Le queda mejor Juan Díaz o La Chorrera?",
    "Busco una facilidad de pago mensual",
  ).includes("por adelantado") ||
    mensajeNaturalLucia(
      "Claro. Tenemos opciones de pago mensual. ¿Le queda mejor Juan Díaz o La Chorrera?",
      "Busco una facilidad de pago mensual",
    ).includes("adelantar"),
);
assert.equal(
  mensajeNaturalLucia(
    "Claro. Tenemos opciones de pago mensual.",
    "Busco una facilidad de pago mensual",
  ).includes("pago mensual"),
  false,
);
assert.ok(
  mensajeNaturalLucia(
    "La letra es diaria. La semana, la quincena y el mes se pagan por adelantado. No hay pagos atrasados.",
    "Busco una facilidad de pago mensual",
  ).includes("No hay pagos atrasados"),
);
assert.ok(
  mensajeNaturalLucia("¿Le queda mejor Juan Díaz o La Chorrera?", "¿Cuáles son los requisitos para adquirir el carro?").includes(
    "récord policivo",
  ),
);
assert.ok(
  mensajeNaturalLucia("Le dejo La Chorrera a las 9.", "Quiero ir el domingo.").includes("solo abre Juan Díaz"),
);
assert.equal(repiteCitaPorDuda("?", "El paz y salvo es del tránsito?"), false);
assert.equal(repiteCitaPorDuda("?", "ok"), true);
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
