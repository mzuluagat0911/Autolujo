# Cobro Gold — miércoles 23 de septiembre 2026 (arranque producción)

> **No se envió nada.** Fuente: `GOLD PARA MATEO (8).xlsx`.
> Criterios: `prioridad-extras.ts` · `cuota.ts` · `pipeline.ts` (agente) · `cifras.ts` · `aplicar-pago.ts`.

## Criterios del agente / motor (fuente de verdad)

1. **Base del día:** saldo anterior (`atrasado` + falta letra del 22) + **+$5** si faltó el 22 + **cuenta** del 23 + abono de enganche si hay plan.
2. **Un solo ítem extra** en el total (`prioridad-extras.ts`): acuerdos → mantenimiento → otro (menor saldo).
3. Se puede **listar** todo lo debido; lo no cobrado hoy va con `(pendiente)`. El **TOTAL HOY** solo suma base + el ítem elegido.
4. **Domingo:** saldo/cuota domingo **solo se cobra si hoy es domingo**. Entre semana → `domingo (pendiente)`, no entra al total.
5. **Adelantado** (`pipeline.ts`): si la cuota del día ya está cubierta (col. del día / crédito / nota de pago adelantado), **HOY NO se cobra**. Si con el mismo adelanto pagó multa/recargo u acuerdo del día, tampoco se piden.
6. Adelanto / col. 23 cubren **letras**. Nota **NO COBRAR** → sin mensaje.
7. **G33 Aaron** · cumpleaños 22 → no arrastra letra ni $5 del 22.
8. **No se inventan** faltantes fuera de `atrasado` o col. del 22.

## Resumen

- Mensajes: **44** (vacío: G21; sin cobro: 5)
- Falta 22 / recargo $5: **18** / **18**
- Suma total HOY: **$2637**

## Sin cobro el 23

- **G18** Luis · adelantado_sin_cobro · letra $35 · NO COBRAR HASTA EL VIERNES 25 DE SEPTIEMBRE YA QUE HIZO UN PAGO ADELANTADO
- **G23** Anabela · adelantado_sin_cobro · letra $35 + multa $10 + acuerdo $45 · PAGO ADELANTADO EL DIA 23 DE SEPTIEMBRE
- **G25** Odalys · ya_pagado_col23 · letra $35
- **G27** Hector · ya_pagado_col23 · letra $35
- **G44** Juanita · ya_pagado_col23 · letra $35

---

## Ejemplo G01

- 22:al_dia · 23:a_cobrar · ítem hoy **—**
**TOTAL HOY $33**

```
Buen día Jonathan 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G01

$33 cuenta
$90 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $33*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

---

## Ejemplo G33

- 22:cumple_libre · 23:a_cobrar · ítem hoy **—**
**TOTAL HOY $35**

```
Buen día Aaron 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G33

$35 cuenta

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

---

## Ejemplo G14

- 22:parcial · 23:a_cobrar · ítem hoy **—**
**TOTAL HOY $147**

```
Buen día Jorge 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G14

$109 saldo anterior
$33 cuenta
$5 por no pagar
$1 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $147*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

---

## Ejemplo G20

- 22:sin_pago · 23:a_cobrar · ítem hoy **acuerdos**
**TOTAL HOY $164**

```
Buen día Luis 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G20

$119 saldo anterior
$35 cuenta
$5 por no pagar
$5 acuerdos (saldo $25)
$26 mantenimiento (pendiente)

*DEBE TOTAL PAGAR HOY: $164*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

---

## Ejemplo G08

- 22:al_dia · 23:a_cobrar · ítem hoy **—**
**TOTAL HOY $33**

```
Buen día Yancarlos 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G08

$33 cuenta
$30 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $33*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

---

## Ejemplo G23

- 22:al_dia · 23:adelantado_sin_cobro · ítem hoy **—**
**TOTAL HOY $0** · *sin envío*

```
(Sin cobro el 23 — adelantado: letra23 $35 + multa/recargo $10 + acuerdo $45 · PAGO ADELANTADO EL DIA 23 DE SEPTIEMBRE)
```

---

## Ejemplo G18

- 22:al_dia · 23:adelantado_sin_cobro · ítem hoy **—**
**TOTAL HOY $0** · *sin envío*

```
(Sin cobro el 23 — adelantado: letra23 $35 · NO COBRAR HASTA EL VIERNES 25 DE SEPTIEMBRE YA QUE HIZO UN PAGO ADELANTADO)
```

---

## Tabla (a enviar)

| Unidad | Cliente | Ant. | Rec. | Cuenta23 | Ítem hoy | **Hoy** |
|---|---|---:|---:|---:|---|---:|
| G01 | Jonathan | — | — | $33 | — | **$33** |
| G02 | Ernesto | $84 | $5 | $33 | — | **$122** |
| G03 | Edwin | — | — | $35 | — | **$35** |
| G04 | Daniel | $35 | $5 | $35 | — | **$75** |
| G05 | Brayan | — | — | $33 | acuerdos | **$38** |
| G06 | Enrique | — | — | $33 | — | **$33** |
| G07 | Aurelio | $33 | $5 | $33 | — | **$71** |
| G08 | Yancarlos | — | — | $33 | — | **$33** |
| G09 | Andres | $28 | $5 | $33 | — | **$66** |
| G10 | Bladimir | — | — | $33 | — | **$33** |
| G11 | Keren | $92 | $5 | $33 | — | **$130** |
| G12 | Jose | — | — | $35 | — | **$35** |
| G13 | Jose | — | — | $33 | — | **$38** |
| G14 | Jorge | $109 | $5 | $33 | — | **$147** |
| G15 | Ivan | — | — | $33 | — | **$33** |
| G16 | Raul | — | — | $35 | — | **$35** |
| G17 | Ruben | $33 | $5 | $33 | — | **$71** |
| G19 | Hector | — | — | $33 | — | **$33** |
| G20 | Luis | $119 | $5 | $35 | acuerdos | **$164** |
| G22 | Zack | — | — | $37 | — | **$37** |
| G24 | Anthony | — | — | $37 | — | **$37** |
| G26 | Edisberto | $37 | $5 | $37 | — | **$79** |
| G28 | Nathanael | — | — | $35 | — | **$35** |
| G29 | Jose | — | — | $35 | — | **$35** |
| G30 | Jose | $35 | $5 | $35 | — | **$75** |
| G31 | Orlando | — | — | $33 | — | **$33** |
| G32 | Juan | $35 | $5 | $35 | — | **$75** |
| G33 | Aaron | — | — | $35 | — | **$35** |
| G34 | Chris | $35 | $5 | $35 | — | **$75** |
| G35 | Elias | $35 | $5 | $35 | — | **$75** |
| G36 | Luis | — | — | $35 | — | **$35** |
| G37 | Eric | $35 | $5 | $35 | — | **$75** |
| G38 | Faustino | — | — | $35 | — | **$35** |
| G39 | Jarienca | — | — | $35 | — | **$35** |
| G40 | Yisell | $70 | $5 | $35 | — | **$110** |
| G41 | Zoellner | $40 | $5 | $35 | — | **$80** |
| G42 | Baker | — | — | $35 | acuerdos | **$40** |
| G43 | Luis | $35 | $5 | $35 | — | **$75** |
| G45 | Omar | $111 | $5 | $35 | acuerdos | **$156** |
| G46 | Adrian | — | — | $35 | — | **$35** |
| G47 | Anibal | — | — | $35 | — | **$35** |
| G48 | Lizbeth | — | — | $35 | — | **$35** |
| G49 | Isaias | — | — | $35 | — | **$40** |
| G50 | Jaime | — | — | $35 | — | **$35** |

---

## Mensajes a enviar

### G01 · Jonathan alexis gonzalez

- total **$33** · ítem —

```
Buen día Jonathan 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G01

$33 cuenta
$90 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $33*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G02 · Ernesto Atencio Gomez

- total **$122** · ítem —

```
Buen día Ernesto 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G02

$84 saldo anterior
$33 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $122*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G03 · Edwin Alberto Gil Castillo

- total **$35** · ítem —

```
Buen día Edwin 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G03

$35 cuenta

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G04 · Daniel Hermogenes Castro Gonzalez

- total **$75** · ítem —

```
Buen día Daniel 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G04

$35 saldo anterior
$35 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $75*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G05 · Brayan Andres Barrios Muñoz

- total **$38** · ítem acuerdos

```
Buen día Brayan 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G05

$33 cuenta
$5 acuerdos (saldo $35)

*DEBE TOTAL PAGAR HOY: $38*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G06 · Enrique Alexander Paredes Pineda

- total **$33** · ítem —

```
Buen día Enrique 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G06

$33 cuenta

*DEBE TOTAL PAGAR HOY: $33*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G07 · Aurelio Alfredo Jimenez Gonzalez

- total **$71** · ítem —

```
Buen día Aurelio 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G07

$33 saldo anterior
$33 cuenta
$5 por no pagar
$30 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $71*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G08 · Yancarlos Rivera Campo

- total **$33** · ítem —

```
Buen día Yancarlos 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G08

$33 cuenta
$30 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $33*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G09 · Andres Arturo Torres

- total **$66** · ítem —

```
Buen día Andres 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G09

$28 saldo anterior
$33 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $66*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G10 · Bladimir Enrique Labarsa Gonzalez

- total **$33** · ítem —

```
Buen día Bladimir 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G10

$33 cuenta

*DEBE TOTAL PAGAR HOY: $33*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G11 · Keren Yireth Cordoba Aparicio

- total **$130** · ítem —

```
Buen día Keren 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G11

$92 saldo anterior
$33 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $130*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G12 · Jose Antonio Caballero Villareal

- total **$35** · ítem —

```
Buen día Jose 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G12

$35 cuenta

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G13 · Jose Eriberto Rodriguez Caicedo

- total **$38** · ítem —

```
Buen día Jose 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G13

$33 cuenta
$5 abono (saldo $20)
$60 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $38*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G14 · Jorge Javier Gonzalez Berrio

- total **$147** · ítem —

```
Buen día Jorge 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G14

$109 saldo anterior
$33 cuenta
$5 por no pagar
$1 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $147*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G15 · Ivan Ariel Palacios Rojas

- total **$33** · ítem —

```
Buen día Ivan 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G15

$33 cuenta
$60 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $33*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G16 · Raul Antonio Ruiz Villaverde

- total **$35** · ítem —

```
Buen día Raul 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G16

$35 cuenta

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G17 · Ruben Dario Insignares Urueta

- total **$71** · ítem —

```
Buen día Ruben 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G17

$33 saldo anterior
$33 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $71*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G19 · Hector Ricardo Ortiz Mateo

- total **$33** · ítem —

```
Buen día Hector 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G19

$33 cuenta

*DEBE TOTAL PAGAR HOY: $33*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G20 · Luis Carlos Echeverria Olmedo

- total **$164** · ítem acuerdos

```
Buen día Luis 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G20

$119 saldo anterior
$35 cuenta
$5 por no pagar
$5 acuerdos (saldo $25)
$26 mantenimiento (pendiente)

*DEBE TOTAL PAGAR HOY: $164*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G22 · Zack Roberto Calvera Oro

- total **$37** · ítem —

```
Buen día Zack 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G22

$37 cuenta

*DEBE TOTAL PAGAR HOY: $37*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G24 · Anthony Daniel Medianero

- total **$37** · ítem —

```
Buen día Anthony 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G24

$37 cuenta

*DEBE TOTAL PAGAR HOY: $37*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G26 · Edisberto Ubaldo Méndez García

- total **$79** · ítem —

```
Buen día Edisberto 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G26

$37 saldo anterior
$37 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $79*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G28 · Nathanael Javier Gonzalez Serrano

- total **$35** · ítem —

```
Buen día Nathanael 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G28

$35 cuenta
$30 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G29 · Jose Angel Bonilla Fernandez

- total **$35** · ítem —

```
Buen día Jose 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G29

$35 cuenta

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G30 · Jose Del Carmen Arauz Smith

- total **$75** · ítem —

```
Buen día Jose 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G30

$35 saldo anterior
$35 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $75*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G31 · Orlando Lara

- total **$33** · ítem —

```
Buen día Orlando 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G31

$33 cuenta

*DEBE TOTAL PAGAR HOY: $33*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G32 · Juan Jose Montero Oda

- total **$75** · ítem —

```
Buen día Juan 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G32

$35 saldo anterior
$35 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $75*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G33 · Aaron Jafet Vinda Gudiño

- total **$35** · ítem —

```
Buen día Aaron 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G33

$35 cuenta

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G34 · Chris Tyrone Moreno Villarreal

- total **$75** · ítem —

```
Buen día Chris 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G34

$35 saldo anterior
$35 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $75*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G35 · Elias Manuel Arenas Rodriguez

- total **$75** · ítem —

```
Buen día Elias 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G35

$35 saldo anterior
$35 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $75*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G36 · Luis Isaac Pineda Tejada

- total **$35** · ítem —

```
Buen día Luis 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G36

$35 cuenta

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G37 · Eric Alberto Flores Soto

- total **$75** · ítem —

```
Buen día Eric 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G37

$35 saldo anterior
$35 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $75*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G38 · Faustino Cordoba Cabrera

- total **$35** · ítem —

```
Buen día Faustino 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G38

$35 cuenta

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G39 · Jarienca Marixsa Givans Williams De Duncan

- total **$35** · ítem —

```
Buen día Jarienca 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G39

$35 cuenta

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G40 · Yisell Yanira Mela Chavez

- total **$110** · ítem —

```
Buen día Yisell 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G40

$70 saldo anterior
$35 cuenta
$5 por no pagar

*DEBE TOTAL PAGAR HOY: $110*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G41 · Zoellner Daniel Campos Jaen

- total **$80** · ítem —

```
Buen día Zoellner 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G41

$40 saldo anterior
$35 cuenta
$5 por no pagar
$30 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $80*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G42 · Baker Jose De Leon Castillo

- total **$40** · ítem acuerdos

```
Buen día Baker 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G42

$35 cuenta
$5 acuerdos (saldo $30)

*DEBE TOTAL PAGAR HOY: $40*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G43 · Luis Gabriel Gonzalez Rodriguez

- total **$75** · ítem —

```
Buen día Luis 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G43

$35 saldo anterior
$35 cuenta
$5 por no pagar
$60 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $75*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G45 · Omar Alexis Moreira Aguilar

- total **$156** · ítem acuerdos

```
Buen día Omar 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G45

$111 saldo anterior
$35 cuenta
$5 por no pagar
$5 acuerdos (saldo $61)

*DEBE TOTAL PAGAR HOY: $156*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G46 · Adrian Arturo De La Cruz Guerra

- total **$35** · ítem —

```
Buen día Adrian 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G46

$35 cuenta
$30 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G47 · Anibal Arce Castillero

- total **$35** · ítem —

```
Buen día Anibal 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G47

$35 cuenta
$30 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G48 · Lizbeth Johana Gomez Rodriguez

- total **$35** · ítem —

```
Buen día Lizbeth 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G48

$35 cuenta
$90 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G49 · Isaias Pinto Sanchez

- total **$40** · ítem —

```
Buen día Isaias 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G49

$35 cuenta
$5 abono (saldo $150)
$60 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $40*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

### G50 · Jaime Alberto Bolaños Del Cid

- total **$35** · ítem —

```
Buen día Jaime 🌞

❌ EXTRACTO DIARIO

23 de septiembre

🔹 Carro G50

$35 cuenta
$60 domingo (pendiente)

*DEBE TOTAL PAGAR HOY: $35*

*RECUERDE:* El sistema cierra a las 7:00 p.m.
*Se genera $5 de recargo por no pagar.*

Envíanos tu comprobante por aquí. ¡Gracias!
```

