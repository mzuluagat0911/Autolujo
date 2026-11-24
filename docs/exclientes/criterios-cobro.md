# Cobro a ex clientes — decisiones

Fuente: documento "EXCLIENTE AGENTE", respuestas de Marcela (29 oct 2026), Mateo (29 y 30 oct 2026) y Claudia (30 oct 2026).

## Datos

- Deuda correcta: la del Excel (también en los 21 casos donde no cuadra con el sistema). Claudia: **saldos reales Excel**.
- Aaron Vinda (G33): **debe $589** (no $208 ni la suma).
- Empresa, cédula, celular y motivo: Excel *Ex-clientes-autolujo* (30 oct 2026). 148 filas, 146 personas (Aaron G33 y José Carlos KW114 estaban dos veces; queda una con el saldo del Excel, no la suma).
- Los que no están en el sistema (unos 124) tienen una cuenta de deuda sencilla en el módulo (`/cartera/ex-clientes`).
- Se pueden agregar ex clientes a mano (los de años anteriores que aparecen a pagar): **Registrar a mano** en esa misma pantalla.

## Frecuencia

- Se cobra según el rango de deuda **y además** los días de quincena: 14, 15, 16, 29, 30 y 1.
- Un solo mensaje al día, desde las 9 a.m.
- No se cobra domingos ni feriados.
- Días por rango:
  - Menos de $500: lunes a sábado.
  - $500–$1,000: lunes, miércoles y viernes.
  - $1,001–$4,000: martes y jueves.
  - Más de $4,000: los lunes (tono formal).
- Quincena en domingo o feriado: se corre al día hábil siguiente. En febrero: 27 y 28 (en lugar de 29 y 30).
- No se hacen llamadas, salvo que el cliente la pida.

## Acuerdos de pago

- Que pague: dejar que el cliente proponga. En deudas de más de $500, pedir mínimo $50 por quincena; si propone más, se acepta. En deudas de menos de $500, se acepta lo que proponga.
- Plazo: cualquiera (diario, semanal, mensual, fecha puntual). **Sin plazo máximo.**
- Descuento o perdón: solo con autorización de Marcela. El agente le dice al cliente que lo consulta; el caso le aparece a Marcela y **se sigue cobrando** mientras ella decide.
- Con acuerdo vigente se cobra solo en las fechas acordadas mientras cumpla.
- Si incumple: se cobra todos los días, sin importar el rango.

## Mensajes

- Trato de "usted".
- Nombre: Inversiones Autolujo Panamá.
- Quitar "cargos adicionales". Sí se puede mencionar la afectación crediticia por mala paga.
- Paz y salvo: se le pide a Marcela.
- Desglose: el agente da **solo el total**. Si el cliente no está de acuerdo, se marca para que Claudia o Marcela le manden el desglose.
- Insultos: se marca para que cartera revise el mensaje y decida si se cierra o continúa.
- Abogado o quiere hablar con el abogado: sale del agente; lo gestionan Marcela y Claudia.
- "No voy a pagar" (sin abogado): se le sigue cobrando **un mes**.
- Robo o pérdida total: se cobra igual; debe hacer acuerdo de pago según contrato.
- Ex cliente que vuelve a ser cliente activo (retoma con otro carro): la deuda vieja **queda como acuerdo de pago**. Ya no se cobra como ex cliente; se cobra en las fechas del acuerdo. Descuento o perdón sigue siendo solo con Marcela.

## WhatsApp

- Se mandan las plantillas a aprobar en Meta.
- Si sale por el mismo número de cartera, los chats llevan una etiqueta "Ex cliente" para reconocerlos.
- Que no se mezcle con el cobro de cartera.

## Lista de cobro

- 30 días sin respuesta: se cuenta desde el primer mensaje. Se retira del cobro y vuelve a entrar 30 días después.
- No hay máximo ni mínimo de personas cobrándose a la vez.
- Arranque: a todos a la vez, con el Excel ya recibido. Falta aplicar la tabla y cargar.

## Recaudo y reportes

- Lo que pagan los ex clientes suma a la meta de cobranza (otros ingresos de cartera).
- Cuentas para pagar: las mismas de cartera según la empresa del carro (AL, KW, GD).
- Comprobantes se validan igual que en cartera, separados del cobro de cartera.
- Revisan a diario Claudia y Marcela.
- Reportes:
  - Qué pagaron los ex clientes (diario).
  - 30 días sin respuesta, para depurar.
  - A quién no le llega el mensaje, para actualizar el número.
  - Quién aceptó acuerdo y en qué fecha se le cobra.
  - Comprobantes por validar y total recaudado.
  - Quién mencionó abogado o dice que no pagará.

## Archivo con deuda

- Si archivan un carro y el cliente **queda debiendo** (sin tomar otro vehículo), entra solo a `/cartera/ex-clientes` con origen `archivo`, estado `cobro` y el saldo del contrato.
- Los pagos validados del contrato bajan ese saldo. Si llega a $0, pasa a `cerrado`.
- **Dar de baja** (estado `baja`): nos bloquearon o ya no responden / no pagan. Sale del cobro WhatsApp. Queda el motivo.

## Pendiente

- Aplicar migraciones 0048 y 0055 si faltan en prod; cargar el Excel histórico (146 personas, **$67.343,84**). 4 sin WhatsApp válido (AL15 697-1859, AL49 1981130, AL94 6631577, KW209 sin celular).
