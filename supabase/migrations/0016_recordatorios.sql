-- ============================================================================
-- 0016 — Escalera de recordatorios de pago
-- Bitácora de los reenganches del día (mediodía / cierre). Una fila por
-- (contrato, fecha, nivel) → idempotente: cada nivel se manda una sola vez.
-- La "lista por llamar" se calcula en vivo (quién debe hoy y no ha pagado),
-- no necesita tabla; esta bitácora es solo para no repetir el envío.
-- ============================================================================

create table if not exists recordatorios (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references contratos(id) on delete cascade,
  fecha        date not null,
  nivel        text not null,               -- 'mediodia' | 'cierre'
  estado       text not null,               -- 'enviado' | 'fallido'
  enviado_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (contrato_id, fecha, nivel)
);

create index if not exists idx_recordatorios_fecha on recordatorios(fecha);
