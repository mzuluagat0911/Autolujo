# Recordatorio Gold — miércoles 23 de septiembre 2026

> **No se envió.** A las 13:18 (Panamá) la bitácora `recordatorios` de hoy está vacía.
> Hora del cron: **1:00 p.m.** (`0 18 * * 1-6` UTC). No hay envío a la 1:30.
> El de las **5:30 p.m.** es otro mensaje (`ultimo_aviso_pago`).

Fuente: estado de cuenta en vivo (`estadosCuentaHoy`). Misma regla que el cron de mediodía: `totalHoy > 0` y sin comprobante de hoy en validación. El domingo no entra en ese total, así que quien solo debe domingo no entra.

Plantilla `recordatorio_pago` (Meta: **APPROVED**, es). Sin montos. Variables: nombre y carro.

```
Hola {{1}} 👋 Aún no vemos el pago pendiente de tu carro {{2}}. Puedes hacerlo hasta las 7:00 p.m. y mandarnos el comprobante por aquí. ¡Cualquier cosa nos dices!
```

## Resumen

- Entran: **41**
- Quedan fuera: **8**
- Todos los 41 tienen WhatsApp

## Les llega el mensaje de la 1:00 p.m.

| Carro | Nombre | A pagar hoy | Nota |
|---|---|---:|---|
| G20 | Luis Carlos Echeverria Olmedo | $165 | atraso + hoy − $20 de hoy |
| G14 | Jorge Javier Gonzalez Berrio | $153 | domingo $1 pendiente, no entra |
| G45 | Omar Alexis Moreira Aguilar | $116 | atraso + hoy + arreglo |
| G11 | Keren Yireth Cordoba Aparicio | $105 | atraso + hoy − $20 de hoy |
| G26 | Edisberto Ubaldo Méndez García | $79 | atraso + hoy |
| G02 | Ernesto Atencio Gomez | $72 | atraso + hoy − $50 de hoy |
| G07 | Aurelio Alfredo Jimenez Gonzalez | $71 | domingo $30 pendiente, no entra |
| G41 | Zoellner Daniel Campos Jaen | $65 | domingo $30 pendiente, no entra |
| G37 | Eric Alberto Flores Soto | $60 | atraso + hoy − $10 de hoy |
| G42 | Baker Jose De Leon Castillo | $40 | hoy + arreglo |
| G33 | Aaron Jafet Vinda Gudiño | $40 | hoy + arreglo |
| G13 | Jose Eriberto Rodriguez Caicedo | $38 | hoy + arreglo; domingo $60 pendiente |
| G05 | Brayan Andres Barrios Muñoz | $38 | hoy + arreglo |
| G22 | Zack Roberto Calvera Oro | $37 | hoy |
| G24 | Anthony Daniel Medianero | $37 | hoy |
| G03 | Edwin Alberto Gil Castillo | $35 | hoy |
| G04 | Daniel Hermogenes Castro Gonzalez | $35 | el pago de hoy cubrió atraso; queda la de hoy |
| G16 | Raul Antonio Ruiz Villaverde | $35 | hoy |
| G29 | Jose Angel Bonilla Fernandez | $35 | hoy |
| G48 | Lizbeth Johana Gomez Rodriguez | $35 | hoy; domingo $60 pendiente |
| G36 | Luis Isaac Pineda Tejada | $35 | hoy |
| G50 | Jaime Alberto Bolaños Del Cid | $35 | hoy; domingo $60 pendiente |
| G46 | Adrian Arturo De La Cruz Guerra | $35 | hoy; domingo $30 pendiente |
| G47 | Anibal Arce Castillero | $35 | hoy; domingo $30 pendiente |
| G49 | Isaias Pinto Sanchez | $35 | hoy; domingo $60 pendiente |
| G30 | Jose Del Carmen Arauz Smith | $35 | hoy |
| G28 | Nathanael Javier Gonzalez Serrano | $35 | hoy; domingo $30 pendiente |
| G12 | Jose Antonio Caballero Villareal | $35 | hoy |
| G39 | Jarienca Marixsa Givans Williams De Duncan | $35 | hoy |
| G34 | Chris Tyrone Moreno Villarreal | $35 | hoy |
| G43 | Luis Gabriel Gonzalez Rodriguez | $35 | hoy; domingo $60 pendiente |
| G17 | Ruben Dario Insignares Urueta | $33 | el pago de hoy cubrió atraso; queda la de hoy |
| G09 | Andres Arturo Torres | $33 | el pago de hoy cubrió atraso; queda la de hoy |
| G01 | Jonathan alexis gonzalez | $33 | hoy; domingo $90 pendiente |
| G15 | Ivan Ariel Palacios Rojas | $33 | hoy; domingo $60 pendiente |
| G08 | Yancarlos Rivera Campo | $33 | hoy; domingo $30 pendiente |
| G10 | Bladimir Enrique Labarsa Gonzalez | $33 | hoy |
| G19 | Hector Ricardo Ortiz Mateo | $33 | hoy |
| G31 | Orlando Lara | $31 | hoy − $2 de hoy |
| G35 | Elias Manuel Arenas Rodriguez | $30 | hoy |
| G40 | Yisell Yanira Mela Chavez | $25 | hoy, con abono |

## No les llega

| Carro | Nombre | Por qué |
|---|---|---|
| G32 | Juan Jose Montero Oda | comprobante de hoy en validación ($35) |
| G06 | Enrique Alexander Paredes Pineda | al día |
| G23 | Anabela Cordoba Ayarza | al día |
| G25 | Odalys Maite Perez De Gracia | al día |
| G44 | Juanita Rios Morrices | al día |
| G38 | Faustino Cordoba Cabrera | pago adelantado |
| G18 | Luis Carlos Alveo | pago adelantado |
| G27 | Hector Javier Marin Flaco | pago adelantado |
