# Reglas de negocio — Cartera Auto Lujo

> Fuente: contrato de arrendamiento (KOWUA #144) + control de cobros real del equipo
> (`ControlCobros`, export de su sistema). Esta es la **fuente de verdad** que el motor
> determinista (`lib/cartera/`) debe respetar. El LLM NO calcula nada de esto.

---

## 1. Modelo de negocio

**Arrendamiento diario con opción de compra** (rent-to-own). El cliente paga una **letra
diaria** hasta completar **~1,095 cuotas** (≈3 años, lunes a sábado). Al terminar y quedar
paz y salvo, el carro se le **traspasa**.

> ⚠️ Realidad operativa: **la mayoría NO llega al traspaso** — devuelven el carro antes.
> Por eso un mismo carro pasa por **varios arrendatarios** en el tiempo.

### Jerarquía de datos

```
EMPRESA (Auto Lujo / Kowua / Gold)
  └── CARRO (# unidad)         ← ancla permanente. Va en el comentario del pago.
        └── CONTRATO (temporal) ← vínculo cliente↔carro, con SUS términos y SU saldo.
              └── CLIENTE / CONDUCTOR (tiene código propio)
```

- **1 carro → N contratos** en el tiempo, pero **solo 1 activo** a la vez.
- El **saldo vive en el contrato**, no en el carro: cada arrendatario arranca de cero.
- Cuando alguien devuelve el carro → su contrato pasa a `devuelto`/`abandonado` y se abre
  uno nuevo para el siguiente.

---

## 2. La letra diaria (el corazón)

- La letra es **variable por contrato** — la fija el equipo comercial según el deal.
  Valores reales vistos: `25, 27, 30, 31, 32, 33, 35, 37`.
- **Descuento por pago puntual:** si paga **antes de las 7 PM**, descuento (típico $5).
  Ej. contrato #144: letra $35 → con puntualidad **$30**.
- **Después de las 7 PM:** pierde el descuento + posible recargo de $5.
- **Horario:** lunes a sábado, 8am–7pm.
- **Domingos:** por defecto **libres** (no se cobran). Pero es **configurable por contrato**
  (`cobra_domingo`, `cuota_domingo`) — algunos deals cobran "primeros N domingos".
- **Feriados** (25 dic, 1 ene): se liquidan al **50%** (si está al día).
- **Cumpleaños:** libre (si está al día + 1 mes de permanencia).
- **Enfermo/incapacitado:** igual paga; se difiere al próximo domingo.

---

## 3. Pagos iniciales (variables por contrato)

- **Cuota inicial / Fondo de inscripción** — **NO reembolsable**, **NO abona** a las 1,095
  cuotas (es afiliación/depreciación). Variable: `100, 150, 200, 220, 250, 300, 350, 400,
  500, 600…`
- **Panapass:** ~$20 ($5 recarga + $5 trámite + $10 instalación). Saldo negativo → recarga
  + $10 de recargo.
- **Primeros N domingos:** algunos contratos cobran los primeros domingos (ej. #144: 3 × $30).

---

## 4. Buckets de deuda (separados — como su sistema)

El saldo NO es un solo número; son **cubetas independientes** (todas deben quedar en paz y
salvo para el traspaso):

| Bucket | Qué acumula | Campo sistema origen |
|--------|-------------|----------------------|
| **Renta** | cuotas diarias pendientes | `DEU_RENTA` |
| **Afiliación** | fondo de inscripción / cuota inicial | `FON_INSCRI` |
| **Siniestros** | daños, colisiones, deducibles | `DEU_SINIES` |
| **Multas / otras** | recargos varios | `DEU_OTRAS` |
| **Panapass** | recargas y transacciones | (col. Panapass) |

En el modelo → `cargos.tipo ∈ (renta, afiliacion, siniestro, multa, panapass, otras)`.

---

## 5. Catálogo de multas y recargos

Códigos reales del sistema del cliente + montos del contrato:

| Código | Concepto | Monto |
|--------|----------|-------|
| 122 | Exceso de kilometraje (>8,000 km/mes) | $2 por cada 10 km |
| 123 | Gastos administrativos | variable |
| 124 | Mantenimiento (inasistencia / carro sucio) | $10 |
| 127 | Otras (salida al interior sin permiso) | según distancia |
| — | Pago después de las 7 PM | $5 |
| — | No cerrar semana al día (lunes) | $10 |
| — | Salir de límites geográficos sin permiso | $50 |
| — | Cobro a domicilio | $30 Panamá / $40 Arraiján / $50 Chorrera |
| — | Reparación fuera del taller autorizado | $50 |
| — | Apertura remota / desplazamiento | $25 |
| — | No notificar accidente de inmediato | $250 |
| — | Reposición llave normal / control | $25 / $400 |
| — | Sin llanta de repuesto | $40 |
| — | Cojinería en mal estado | $50 |

> Regla: las multas se **descuentan del siguiente pago** que haga el arrendatario.

---

## 6. Mora y terminación

- **Semana:** el lunes debe estar al día; si no, multa $10.
- **Terminación anticipada:** incumplir **3 cuotas** (consecutivas o no) es causal.
- **Score financiero** (`clientes.score_financiero`): sube/baja según puntualidad de pago.

---

## 7. Conciliación de pagos (cómo casa el dinero)

1. El cliente paga en el banco y **pone el # de carro en el comentario**
   (*"CARRO 144"*), luego manda el comprobante por WhatsApp.
2. El sistema lee el comprobante → extrae **monto, fecha, referencia, banco, cuenta destino
   y # de carro del comentario**.
3. Con el **# de carro** → busca el `vehiculo` → su **contrato activo** → aplica el pago ahí.
4. Concilia contra el **extracto bancario** subido (casa por referencia/monto/fecha).
5. Si cuadra → actualiza saldo y responde. Si no → marca para **revisión humana**.

### Cuentas bancarias (KOWUA S.A.)
- Banco General **AHORROS**: `0469976106024`
- Banco General **CORRIENTE**: `0117467598`
- Banistmo: pago por corresponsal
- **Al pagar:** colocar en el comentario el **# de carro**. Enviar comprobante antes de 7pm.

---

## 8. Lo que es VARIABLE por deal (no hardcodear)

Lo fija el equipo comercial contrato por contrato → vive en `contratos`, no en config global:

- `letra_diaria`
- `abono_inicial` (cuota inicial / fondo de inscripción)
- `descuento_puntual`
- `cobra_domingo` / `cuota_domingo`
- `num_cuotas_total`
- `saldo_inicial` (al migrar clientes existentes)

Los **recargos/multas** sí son más estándar → viven en `config_reglas` (con override por
empresa) y en el catálogo `conceptos_cargo`.

---

## 9. Contactos operativos (del contrato)

- **Cobros:** Claudia 6922-9957 · Marcela 6643-2422 · (oficina Ángela 6996-4199)
- **Novedades operativas:** 6330-3437
- **Colisiones:** Santiago 6929-1946
