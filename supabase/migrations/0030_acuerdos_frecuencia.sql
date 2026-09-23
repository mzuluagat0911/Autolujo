-- Frecuencia de cobro de acuerdos (día / semana / quincena / mes / fecha).
-- `cuota_diaria` sigue siendo el MONTO de la cuota del período.
-- `fecha_especifica` ancla el día de cobro (o la única fecha si frecuencia = fecha).

alter table acuerdos
  add column if not exists frecuencia text not null default 'dia';

alter table acuerdos
  add column if not exists fecha_especifica date;

comment on column acuerdos.frecuencia is
  'dia | semana | quincena | mes | fecha — cada cuánto se pide la cuota del acuerdo';
comment on column acuerdos.fecha_especifica is
  'Ancla: día de la semana/mes, o la fecha única si frecuencia = fecha';

alter table acuerdos drop constraint if exists acuerdos_frecuencia_check;
alter table acuerdos
  add constraint acuerdos_frecuencia_check
  check (frecuencia in ('dia', 'semana', 'quincena', 'mes', 'fecha'));
