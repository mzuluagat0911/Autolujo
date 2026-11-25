# Plan: registro de taller (plataforma + WhatsApp Néstor)

Documento alineado con respuestas del equipo (25 nov 2026).
**Un solo registro** sirve igual en la web o si Néstor lo manda por WhatsApp al agente.

---

## 1. Qué hay hoy (no mezclar)

| Tipo | Disparador | Qué guarda hoy | Qué falta (a construir) |
|---|---|---|---|
| **Revisión mensual** | ~cada 30 días | Ancla `fecha_ultima_revision` | Check-list + fotos (mín. 5) |
| **FULL 6.000 km** | Desde ~5.000 km | Ancla fecha + km | Ítems fijos + promo en sucursal + sticker + fotos |
| **Kit de tiempos** | 100k / luego 60k | Evento hoja de vida | Auto/manual, precio lista, monto cliente caso a caso |
| **ATF 50.000** | 50k | Solo alerta en informe | Cita y registro **aparte** |
| **Mecánica** | Novedades | Agenda tipo `mecanica` | Orden + costo interno Edison en el mismo form |

**Sede:** Juan Díaz o La Chorrera = entrega del contrato. Lista de pendientes de sede: **el equipo la debe**.

**Canales (cerrado):**
- **Néstor** → único que reporta trabajo / fotos (WA + plataforma). Número: *después*.
- **Cliente** → solo confirmar / mover / cancelar agenda. Por ahora **no** manda fotos ni odómetro.
- Equipo en plataforma → mismo formulario.

**Km:** nos basamos mucho en el **km del GPS** (no exigir foto de odómetro como fuente principal).

---

## 2. Campos comunes (toda visita)

| Campo | Obl. | Notas |
|---|---|---|
| Carro | Sí | AL / KW / G… |
| Tipo | Sí | `revision_mensual` \| `mantenimiento_6000` \| `kit_tiempos` \| `atf` \| `mecanica` |
| Fecha atención | Sí | |
| Sede | Sí | Juan Díaz / La Chorrera |
| Asistencia | Sí | Llegó / No llegó / Cancelada |
| Km (GPS / sistema) | Sí | Preferir km plataforma/GPS; odómetro solo si aporta |
| Comentario | No | |
| Fotos | Sí (mín. **5** si llegó y se trabajó) | Incluye **foto del sticker** cuando aplique FULL |
| Costo interno Edison | No | Mismo formulario, espacio interno |
| Quién / origen | Sí | `whatsapp_nestor` \| `agenda_web` |

Si **no llegó** o **carro sucio** y corresponde multa $10:
- Flag en el registro → **informar a Cartera** (ellos cobran; el taller no inserta el cargo solo).

---

## 3. Formularios cerrados (por tipo)

### A) Revisión mensual

- Check-list: **el mismo en Juan Díaz y La Chorrera**.
- Ítems exactos del check-list: *aún por detallar* (solo confirmamos que no cambia por sede).
- Fotos: mínimo 5.
- Ancla: `fecha_ultima_revision` → próxima ~+30 días.
- Novedades → si hace falta, cita mecánica aparte.

### B) Mantenimiento FULL (6.000 km) — cerrado

Ítems **fijos** del FULL:

1. Filtro de A/C  
2. Filtro de motor  
3. Filtro de aceite  
4. **4 cuartos** de aceite  
5. Ajuste de líquidos  

| Campo | Obl. | Regla |
|---|---|---|
| Ítems FULL (checks) | Sí | Los 5 de arriba |
| Km (GPS) | Sí | Ancla próximo FULL |
| Promo gratis | Sí | Se decide **en sucursal al llegar**; no todos tienen promo. No asumir desde el contrato a ciegas. |
| Monto cobrado | Sí | $0 si promo; si no, precio FULL acordado ($60 plantilla actual u otro) |
| Sticker pegado | Sí | + **foto del sticker** (cuenta dentro de las 5) |
| Limpio / multa | Si aplica | Flag → avisar Cartera |
| Fotos | Sí | Mín. 5 |

### C) Kit de tiempos — cerrado (precios)

| Transmisión | Precio lista | Modelos |
|---|---|---|
| **Manual** | **$212** | Grand i10 y Kia Soluto (igual) |
| **Automático** | **$234** | Grand i10 y Kia Soluto (igual) |

| Campo | Obl. | Regla |
|---|---|---|
| Transmisión | Sí | manual / automático |
| Precio lista | Auto | 212 o 234 |
| **Monto que asume el cliente** | Sí | **Caso a caso** (no fijo $73) |
| Ítems hechos | Sí | Lista plantilla + extras / diferidos |
| Km (GPS) | Sí | |
| Fotos | Sí | Mín. 5 |

Actualizar plantilla WA / tarifario código: auto era 232 → **234**.

### D) Aceite ATF (50.000) — cerrado

- **Cita aparte** (no se mezcla con el kit).
- Mismos comunes + ATF/filtro hechos + cobro + fotos (mín. 5).

### E) Mecánica

- Síntoma / trabajo, operativo sí/no, fotos.
- **Espacio Edison / costo interno en el mismo formulario.**

---

## 4. Respuestas del equipo (archivo)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Check-list mensual ¿igual en ambas sedes? | **Sí, la misma.** (Ítems exactos pendientes de listar.) |
| 2 | ¿Qué incluye el FULL? | **3 filtros (A/C, motor, aceite) + 4 cuartos de aceite + ajuste de líquidos.** |
| 3 | Promo gratis | Se revisa **al detalle en sucursal**; no todos la tienen. |
| 4 | Kit precios / monto cliente | Manual **$212** / automático **$234** (i10 y Soluto igual). Lo que asume el cliente **varía por caso**. |
| 5 | ATF | **Cita aparte.** |
| 6 | Km | Nos basamos mucho en **km GPS**. |
| 7 | Multa $10 | Si se cobra → **informar a Cartera**. |
| 8 | Sticker | **Foto del sticker.** |
| 9 | WA Néstor | **Después.** |
| 10 | Fotos | **5.** |
| 11 | Sedes faltantes | **Te deben la lista completa.** |
| 12 | Edison | **Mismo formulario**, espacio para ese registro. |
| 13 | Informe atendidos ayer | **Sí**, sale de estos cierres. |
| 14 | Cliente manda fotos | **Solo Néstor** por ahora. |

**Pendiente corto:** ítems del check-list de revisión mensual · lista de carros sin sede · número WA Néstor.

---

## 5. Arquitectura (sin cambio)

```
Agenda web  ──┐
              ├──► registro_taller + fotos + anclas + hoja de vida
WhatsApp Néstor ──┘         │
                            └── flag multa → aviso Cartera
```

Cliente en el mismo WA: solo agenda. Nunca `registro_taller`.

---

## 6. Plan de desarrollo (actualizado)

### Fase 0 — Cerrar pendientes chicos
- [ ] Lista check-list revisión mensual
- [ ] Lista sedes faltantes / completar entregas
- [ ] WA Néstor → `NESTOR_WHATSAPP`
- [ ] Ajustar tarifario kit auto a **$234** y plantilla kit (monto cliente variable)

### Fase 1 — Modelo + UI plataforma
- [x] `registros_taller` (+ fotos storage) — migración **0059**
- [x] Form al “Marcar hecha” por tipo (FULL fijo, kit 212/234 + monto cliente, ATF, Edison)
- [x] Mín. 5 fotos; FULL exige foto sticker
- [x] Flag multa → aviso Cartera (sin auto-cargo)
- [x] Anclas + hoja de vida
- [x] Bloque “Atendidos hoy” en Agenda
- [ ] Check-list ítems revisión mensual (cuando los pasen)
- [ ] Aplicar 0059 en Supabase

### Fase 2 — WhatsApp Néstor
- [ ] Allowlist (cuando den el número)
- [ ] Mismo guardado que la UI + fotos
- [ ] Confirmación al Néstor

### Fase 3 — Cliente solo agenda
- [ ] SI / no puedo / otra fecha → `citas_taller`

### Fase 4
- [ ] Cron sábado con sede + tipo reales
- [ ] Pulir aviso Cartera por multa

---

## 7. Criterio de listo

1. FULL en web: 3 filtros + 4 cuartos + líquidos, 5 fotos (una sticker), ancla km GPS.  
2. Kit: manual 212 / auto 234 + monto cliente libre + 5 fotos.  
3. ATF como visita aparte.  
4. Multa → Cartera avisada, no cargo fantasma.  
5. Néstor por WA (cuando haya número) = mismo registro.  
6. Cliente no puede registrar taller.

---

## 8. Próximo paso de producto

Arrancar **Fase 1** con lo ya cerrado (FULL + kit + ATF + Edison + 5 fotos + flag Cartera).  
En paralelo: check-list mensual, sedes y WA Néstor.
