-- ============================================================================
-- 0017 — Marca de aviso de conciliación al cliente
-- Para no avisarle dos veces "su pago fue validado y recibido" por el mismo pago.
-- ============================================================================

alter table pagos add column if not exists confirmado_notificado_at timestamptz;
