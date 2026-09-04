-- ============================================================================
-- 0015 — Cumpleaños del cliente (beneficio: cumpleaños libre)
-- Por contrato, el día del cumpleaños el arrendatario no paga cuota, si está
-- al día y tiene >= 1 mes de permanencia. Necesitamos la fecha para aplicarlo.
-- ============================================================================

alter table clientes add column if not exists fecha_nacimiento date;

comment on column clientes.fecha_nacimiento is
  'Fecha de nacimiento del cliente. Se usa para el beneficio de cumpleaños libre.';
