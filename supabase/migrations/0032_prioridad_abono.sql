-- Concepto que se abona después del recargo, por carro.
-- null = menor valor (regla general).
alter table contratos
  add column if not exists prioridad_abono text;

comment on column contratos.prioridad_abono is
  'Concepto único después del recargo: menor | acuerdo | mantenimiento | domingo | otro. null = menor valor.';
