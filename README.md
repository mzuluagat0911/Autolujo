# Auto Lujo — Plataforma

Plataforma de gestión con IA para Inversiones Auto Lujo Panamá. Se construye por
módulos (cartera, comercial, operaciones, seguros). **Fase 1: módulo de cartera**
— agente de cobranza + wizard administrativo. Stack: Next.js + Supabase + Tailwind → Vercel.

Ver [`docs/PLAN.md`](docs/PLAN.md) para arquitectura, reglas de negocio y milestones.

## Arranque local

1. **Base de datos:** pega `supabase/migrations/0001_cartera_schema.sql` en el
   SQL Editor de Supabase y ejecútalo.
2. **Variables:** copia `.env.example` a `.env.local` y rellena las claves de
   Supabase (Project Settings → API).
3. **Instalar y correr:**
   ```bash
   npm install
   npm run dev
   ```
4. Abre http://localhost:3000 — deberías ver el dashboard con las 3 empresas.

## Estructura

```
app/                  # Next.js (wizard + API routes del webhook)
  page.tsx            # dashboard
  cartera/empresas/   # primer módulo (prueba de conexión a Supabase)
lib/
  supabase/           # clientes de base de datos (server / browser)
  ai/                 # capa de proveedores (Vercel AI SDK + OpenRouter/Anthropic) — pendiente
  cartera/            # motor de reglas determinístico — pendiente
supabase/migrations/  # SQL (se pega a mano en Supabase)
docs/                 # plan
```
