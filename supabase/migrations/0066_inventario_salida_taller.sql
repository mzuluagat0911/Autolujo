-- ============================================================================
-- 0066 — Salida a taller (sin carro) además de salida a carro.
-- ============================================================================

alter table inventario_movimientos
  add column if not exists para_taller boolean not null default false;

comment on column inventario_movimientos.para_taller is
  'true = consumo de taller (sin carro ni cobro cliente). false = salida a un carro.';

comment on column inventario_movimientos.cobro_a is
  'Salidas a carro: quién paga (cliente/empresa). Se asigna después; null = pendiente. En salidas a taller suele ir empresa.';
