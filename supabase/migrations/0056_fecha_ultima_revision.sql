-- ============================================================================
-- 0056 — Última revisión mensual del carro
-- Una vez al mes. Distinta del FULL 6.000 km y del kit de tiempos.
-- ============================================================================

alter table vehiculos
  add column if not exists fecha_ultima_revision date;

comment on column vehiculos.fecha_ultima_revision is
  'Última visita de revisión mensual. No es el mantenimiento de 6.000 km.';
