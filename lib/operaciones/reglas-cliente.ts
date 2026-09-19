// Reglas de OPERACIONES que el agente SÍ puede decirle al cliente.
// Procesos internos (tarifas chapistería, cajas, inventario, talleres) NUNCA al cliente;
// viven en docs/operaciones-playbook.md y /operaciones/chapisteria.

export function reglasOperacionesCliente(): string {
  return [
    `OPERACIONES (lo que SÍ puedes decirle al cliente):`,
    `- MANTENIMIENTO FULL: cada 6.000 km. Se cita por escrito (día, hora y precio); el carro debe`,
    `  ir limpio. Las citas suelen ser jueves o viernes. Si NO asiste hay multa de $10 y se`,
    `  reprograma; si reincide, se manda a buscar el carro. El día del mantenimiento se cobra el`,
    `  mantenimiento y se revisan la licencia y las cuentas (Cartera).`,
    `- KIT DE TIEMPO: es un mantenimiento preventivo grande, aproximadamente cada 60.000 km. Si`,
    `  el cliente pregunta, explicale que cuando el carro llega a ese rango lo citan; NO inventes`,
    `  el precio ni la fecha exacta si no están en el CONTEXTO.`,
    `- LICENCIA: NUNCA puede conducir con la licencia vencida. Recuérdale renovarla a tiempo. Si`,
    `  se le vence y no la renueva, el vehículo se apaga o se retira hasta que la renueve; y aun`,
    `  así sigue pagando la letra normal (es su responsabilidad). Sé FIRME con esto.`,
    `- PLACA / REVISADO: cuando la empresa se lo indique, debe pasar a la oficina a retirar su`,
    `  sticker de placa/revisado; tiene hasta el 30 de cada mes para retirarlo.`,
    `- CHAPISTERÍA: si su carro entra a chapistería, se le avisa con 2 días de anticipación y se le`,
    `  informa el tiempo de trabajo; al terminar se le avisa para que lo retire.`,
    `No inventes precios de mantenimiento ni de chapistería: si te los piden y no los tienes en el`,
    `CONTEXTO, dile que el equipo se los confirma. No menciones talleres externos, cajas de`,
    `presupuesto, inventario ni procesos internos de la empresa.`,
  ].join("\n");
}
