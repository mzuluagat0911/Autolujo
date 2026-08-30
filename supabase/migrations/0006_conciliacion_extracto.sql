-- ============================================================================
-- Migración 0006 — Conciliación por extracto bancario.
-- Enriquece los movimientos del extracto con lo que el sistema detecta.
-- IDEMPOTENTE. Pegar en Supabase → SQL Editor → Run.
-- ============================================================================

-- Datos que el sistema extrae/resuelve de cada movimiento del banco
alter table movimientos_extracto add column if not exists numero_carro     text;
alter table movimientos_extracto add column if not exists nombre_detectado text;
alter table movimientos_extracto add column if not exists contrato_id      uuid references contratos(id) on delete set null;
-- estado: pendiente | aplicado | parcial | revisar | ignorado
alter table movimientos_extracto add column if not exists estado           text not null default 'pendiente';

-- De dónde salió un pago: comprobante (WhatsApp) | extracto (banco) | manual
alter table pagos add column if not exists origen text not null default 'comprobante';

-- Evitar cargar dos veces el mismo movimiento del mismo extracto
create index if not exists idx_mov_extracto_estado on movimientos_extracto(estado);
