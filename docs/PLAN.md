# Auto Lujo · Cartera — Plan de construcción

Motor de cartera con IA para Inversiones Auto Lujo Panamá. Fase 1: agente de
cartera + wizard administrativo. Proyecto: US$3.500, ~3 meses.

## Arquitectura
- **Wizard/admin:** Next.js (App Router) + TypeScript + Tailwind → Vercel.
- **Base de datos:** Supabase (Postgres). Migraciones se pegan a mano en el SQL Editor.
- **Agente de cartera:** API routes (webhook WhatsApp) + cron para estado de cuenta 8am.
- **IA:** Claude Haiku 4.5 (visión/comprobantes) + Claude Sonnet 5 (conversación/reglas).
- **Mensajería:** WhatsApp Business Platform (Cloud API). Piloto 1:1 → grupos (1 por cliente) al aprobar OBA.

## Reglas de negocio (cartera)
- 3 empresas, numeración de carro no se repite: Autolujo (1–332), Kowua (200–217), Gold (G01–G39).
- Letra diaria por año/modelo/km. Tarifario general: $25 (2020); $30/31/33/35/37; $35 y $37 para 0–10.000 km.
- Cuotas por contrato: 365–1275 según año/modelo.
- **Día cierra a las 12:00 del mediodía** (no medianoche). Pago hasta las 19:00.
- Domingos "libres pero no gratuitos": no cuenta cuota, pero se acumulan pendientes.
- Acuerdos por daño: 50% financiado a $5/día y $30/domingo. Orden de aplicación de un pago: **primero al acuerdo, luego a la cuenta diaria.**
- Multa por pago tarde: automática pero negociable.
- Exceso de km: 8.000/mes; luego $2 por cada 10 km.
- Conciliación: **NO hay integración bancaria.** El cliente sube el extracto de Banco General (PDF/Excel) y conciliamos contra él.

## Modelo de datos (v1 — `supabase/migrations/0001_cartera_schema.sql`)
`empresas`, `cuentas_bancarias`, `vehiculos`, `tarifas`, `clientes`, `contratos`,
`acuerdos`, `cargos` (débito), `pagos` (crédito + comprobante), `extractos_bancarios`,
`movimientos_extracto`, `config_reglas`, `estados_cuenta`, `wa_vinculos`.
Vista `vw_saldo_contrato` calcula el saldo (cargos − pagos conciliados).

## Milestones
1. ✅ Modelo de datos v1.
2. ⏳ Wizard admin — módulo Cartera (empresas, vehículos, tarifario, clientes, contratos, reglas).
3. ⏳ Motor de conciliación + reglas.
4. ⏳ Pipeline de visión (leer comprobantes) — probar con capturas de ejemplo.
5. ⏳ Webhook + estado de cuenta 8am — se enchufa con el número.

## Estado WhatsApp / Meta
- Portfolio + Business Manager: ✅ existe · Verificación de negocio: ✅ hecha.
- WABA del bot/comercial: "Autolujo Panamá" (ID 1063518545222396, número +507 6833-0572) — no se toca.
- **Cartera:** número NUEVO dedicado (por conseguir) → WABA nueva + App nueva.
- OBA: requiere 30 días registrado + 2FA + display name aprobado + política. Se pide a los 30 días. Grupos (1 por cliente) dependen del OBA; mientras, piloto 1:1.

## Insumos pendientes de Luis
- Tarifario completo por año/modelo.
- Un extracto de ejemplo de Banco General (PDF/Excel).
- Lista de clientes activos + saldos iniciales.
- Formato de contrato.
- Estrategia de opt-in/consentimiento.
