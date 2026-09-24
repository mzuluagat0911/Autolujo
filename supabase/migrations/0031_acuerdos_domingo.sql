-- Acuerdos: frecuencia `domingo` (solo se cobra el domingo).
alter table acuerdos drop constraint if exists acuerdos_frecuencia_check;
alter table acuerdos
  add constraint acuerdos_frecuencia_check
  check (frecuencia in ('dia', 'domingo', 'semana', 'quincena', 'mes', 'fecha'));

comment on column acuerdos.frecuencia is
  'dia | domingo | semana | quincena | mes | fecha — ver lib/cartera/acuerdo.ts';
