# Agente de Cartera — Plan de arquitectura

> Objetivo: un agente en WhatsApp que reciba pagos (comprobantes), los lea, los concilie
> contra el saldo del contrato, responda al cliente y envíe el estado de cuenta diario.
> Empresa: Inversiones Auto Lujo Panamá.

---

## 0. Principio rector (no negociable)

**El dinero lo maneja el CÓDIGO. El LLM solo VE imágenes y HABLA lenguaje.**

- Los saldos, la letra diaria, la mora, la distribución de un pago y la conciliación se
  calculan en **código determinista** (`lib/cartera/rules.ts`, `lib/cartera/conciliacion.ts`).
- El LLM **nunca** hace aritmética ni decide cuánto debe alguien. Se le prohíbe en el prompt.
- Un modelo puede equivocarse; la plata no. Por eso separamos los roles.

---

## 1. Los dos modelos (roles)

| Rol | Qué hace | Modelo por defecto | Respaldo |
|-----|----------|--------------------|----------|
| 👁️ **Visión** | Lee el comprobante (imagen) → `{monto, fecha, referencia, banco, confianza}` | `google/gemini-2.5-flash` | `anthropic/claude-haiku-4.5` si confianza = baja |
| ✍️ **Agente de texto** | Clasifica intención, pregunta, responde, redacta el estado de cuenta — todo texto escrito de WhatsApp | `google/gemini-2.5-flash` | — |

> Nota: ambos roles son **texto e imagen**. No hay audio/voz en el sistema. El "agente de
> texto" solo redacta los mensajes escritos que se envían por WhatsApp.

**Por qué estos:** el costo del LLM es ruido (≈$3–9/mes para 50 clientes). Elegimos por
**precisión y control de tono**, no por centavos. El benchmark (§6) confirma el de visión
con comprobantes reales. Todo es configurable por env, sin tocar código.

**Patrón "barato primero, escala si duda":** el lector corre con el modelo barato; si la
`confianza` sale baja, se re-lee con el modelo de respaldo (segunda opinión) antes de
pedirle al cliente que confirme. Ya cableado en `lib/ai/provider.ts`
(`modeloVision` / `modeloVisionFallback`).

---

## 2. Pipeline de un pago (el flujo estrella)

```
Cliente manda foto del comprobante
        │
        ▼
Webhook (app/api/whatsapp/webhook)  ── verifica firma HMAC
        │
        ▼
downloadMedia(mediaId)  ── baja los bytes de la imagen
        │
        ▼
👁️ leerComprobante()  ── {monto, fecha, referencia, banco, confianza}
        │
        ├─ confianza baja ──► re-lee con modelo de respaldo
        │
        ▼
Guardar en Supabase Storage (imagen) + tabla `pagos` (estado = pendiente_conciliacion)
        │
        ▼
🧮 Motor de conciliación (CÓDIGO)
        │  - ¿el monto coincide con la letra/saldo del contrato?
        │  - ¿aparece en el extracto bancario subido?
        │
        ├─ cuadra ──► marcar conciliado, actualizar saldo (vista vw_saldo_contrato)
        │             ✍️ "Recibí tu pago de $X. Tu saldo queda en $Y. ¡Gracias!"
        │
        └─ no cuadra / dudoso ──► marcar para revisión humana
                                  ✍️ "Recibí tu comprobante, lo estoy validando."
```

**Regla de oro:** el monto que se le dice al cliente y el saldo **siempre** salen del
código/base de datos, nunca de lo que "cree" el modelo.

---

## 3. Componentes del sistema

| Componente | Dónde | Estado |
|------------|-------|--------|
| Webhook WhatsApp (recibe/responde) | `app/api/whatsapp/webhook/route.ts` | ✅ vivo |
| Cliente WhatsApp (enviar, plantillas, media) | `lib/whatsapp/client.ts` | ✅ |
| Lector de comprobantes (visión) | `lib/ai/comprobante.ts` | ✅ (a validar con benchmark) |
| Provider LLM (OpenRouter, agnóstico) | `lib/ai/provider.ts` | ✅ |
| Motor de reglas (letra, mora, km, distribución) | `lib/cartera/rules.ts` | ✅ v1 |
| **Router de intención** (pago / saldo / duda / queja) | `lib/ai/router.ts` | ⬜ pendiente |
| **Motor de conciliación** (comprobante vs extracto) | `lib/cartera/conciliacion.ts` | ⬜ pendiente |
| **Memoria de conversación** (historial por cliente) | tabla `conversaciones` | ⬜ pendiente |
| **Estado de cuenta diario 8am** | cron + plantilla Meta | ⬜ pendiente |
| **Panel de revisión humana** (dudosos) | `app/cartera/...` | ⬜ pendiente |
| Esquema de datos | `supabase/migrations/0001_*` | ✅ aplicado |

---

## 4. Guardarraíles (lo que hace esto "senior")

1. **Separación plata/lenguaje:** el LLM propone texto, el código valida números.
2. **Idempotencia:** un mismo comprobante (misma referencia) no se cuenta dos veces.
3. **Umbral de confianza:** lecturas dudosas → segunda opinión → si sigue dudosa, humano.
4. **Ventana de 24h de Meta:** respuestas libres solo dentro de la ventana; fuera, plantilla.
5. **Escalada a humano:** todo lo que no cuadra se marca y notifica, no se inventa.
6. **Auditoría:** cada pago guarda la imagen original + lo que leyó el modelo + quién concilió.
7. **Reintentos de Meta:** el webhook responde 200 rápido y procesa con try/catch.
8. **Secretos:** solo en env (Vercel / `.env.local`), nunca en git. Token permanente rotable.

---

## 5. Información que necesitamos de Luis (crítico para avanzar)

> Sin esto trabajamos a ciegas. Prioridad de arriba hacia abajo.

1. **8–10 comprobantes reales** (screenshots) de los bancos que usan los clientes
   (Banco General, Banistmo, etc.) → para el **benchmark de visión** y el ground truth.
2. **Un extracto bancario real** en su formato exacto (Excel / PDF / CSV, como lo descargan)
   → para construir el **motor de conciliación**.
3. **Las reglas exactas del negocio:**
   - Letra diaria por vehículo / tarifa.
   - Día de corte / cuándo vence.
   - Política de **mora**: ¿cuánto se cobra?, ¿desde qué día?
   - **Exceso de km**: ¿tarifa por km?
   - ¿Los **domingos** cuentan como día operativo?
4. **Un estado de cuenta como lo mandan hoy** → para replicar campos y tono.
5. **Catálogo real de arranque:** vehículos, tarifas y clientes activos con su **saldo actual**
   → para migrar/inicializar.
6. **El tono con el cliente:** ¿tuteo o usted?, ¿formal o cercano? → afina el prompt del agente de texto.

---

## 6. Benchmark de visión (cómo elegimos con datos, no con opinión)

- Harness: `scripts/bench-vision.mjs`. Mide **precisión por campo** (monto/fecha/ref),
  **% de comprobantes 100% correctos**, **latencia** y **costo real por comprobante**.
- El campo **crítico es el Monto** (de ahí sale la plata). Priorizamos el mejor % de monto
  con costo razonable.
- Cómo correrlo:
  1. Imágenes reales en `scripts/bench/comprobantes/`.
  2. Verdad en `scripts/bench/ground-truth.json` (plantilla en `ground-truth.example.json`).
  3. `node --env-file=.env.local scripts/bench-vision.mjs`
- Candidatos precargados: Gemini 2.5 Flash / Flash-Lite, GPT-4o-mini, GPT-4.1-mini,
  Qwen2.5-VL-72B, Claude Haiku 4.5.

### Precios de referencia (OpenRouter, $/1M tokens)

| Modelo | Input | Output | ~$/comprobante | ~$/turno chat |
|--------|------:|-------:|---------------:|--------------:|
| gemini-2.5-flash | 0.30 | 2.50 | 0.00073 | 0.00054 |
| gemini-2.5-flash-lite | 0.10 | 0.40 | 0.00018 | 0.00013 |
| gpt-4o-mini | 0.15 | 0.60 | 0.00027 | 0.00019 |
| gpt-4.1-mini | 0.40 | 1.60 | 0.00072 | 0.00051 |
| qwen2.5-vl-72b | 0.25 | 0.75 | 0.00041 | 0.00029 |
| claude-haiku-4.5 | 1.00 | 5.00 | 0.00195 | 0.00140 |

**Lectura:** hasta el más caro cuesta centavos. El costo real del sistema son las
tarifas de conversación de **Meta**, no el LLM.

---

## 7. Fases de construcción

- **Fase 0 — Infra** ✅ casi: Supabase, Vercel, webhook vivo, visión conectada, token (pendiente permanente).
- **Fase 1 — Pipeline de pago 1:1**: foto → lectura → registro en `pagos` + Storage → respuesta. Conciliación básica contra saldo.
- **Fase 2 — Estado de cuenta diario 8am**: cron + plantilla Meta aprobada.
- **Fase 3 — Router de intención + Q&A**: "¿cuánto debo?", "¿cuándo vence?", quejas → humano.
- **Fase 4 — Conciliación con extracto**: subir extracto → casar pagos automáticamente.
- **Fase 5 — Panel operativo**: revisión humana de dudosos, métricas de cartera.
- (Luego) **Fase 6 — Grupos**: 1 grupo por cliente cuando la OBA esté aprobada.

---

## 8. Estructura del proyecto (capas)

```
lib/ai/          providers · comprobante (visión) · router · agente (texto)
lib/cartera/     rules (determinista) · conciliacion · estado-cuenta
lib/whatsapp/    client · plantillas
app/api/whatsapp/webhook   orquestador (recibe → decide → responde)
supabase/        esquema + migraciones
scripts/bench-*  benchmarks de modelos
app/cartera/     panel operativo (revisión, catálogos)
```
