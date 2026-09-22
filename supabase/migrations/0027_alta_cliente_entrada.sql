-- ============================================================================
-- 0027 — Alta de cliente nuevo: fecha inicio cobro de letra + conceptos entrada.
-- ============================================================================

alter table contratos
  add column if not exists fecha_inicio_letra date;

comment on column contratos.fecha_inicio_letra is
  'Desde cuándo se cobra la letra diaria. Si es null, se usa fecha_inicio.';

alter table contratos
  add column if not exists abono_cuota_diaria numeric(10,2);

comment on column contratos.abono_cuota_diaria is
  'Cuota diaria para liquidar el abono inicial restante (ej. $5). Null = sin plan.';

-- Concepto de entrada: 3 domingos × cuota domingo (tipicamente $90).
insert into conceptos_cargo (codigo, nombre, tipo, monto_sugerido)
values ('DOMINGOS', 'Domingos (entrada)', 'otras', 90)
on conflict (codigo) do nothing;
