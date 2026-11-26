-- Comentario al crear el acuerdo (de qué es) y motivo al suspenderlo/cancelarlo.

alter table acuerdos
  add column if not exists comentario text;

alter table acuerdos
  add column if not exists motivo_cierre text;

alter table acuerdos
  add column if not exists cerrado_at timestamptz;

comment on column acuerdos.comentario is
  'De qué es el acuerdo (ej. choque, deducible). Se carga al crearlo.';
comment on column acuerdos.motivo_cierre is
  'Por qué se suspendió o canceló (ej. absolución en audiencia).';
comment on column acuerdos.cerrado_at is
  'Cuándo se desactivó el acuerdo.';
