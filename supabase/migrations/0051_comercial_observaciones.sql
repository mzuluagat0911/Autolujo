-- Notas del comercial en la ficha, y consulta de su actividad por asesor.

alter table conversaciones_comercial
  add column if not exists observaciones text;

create index if not exists idx_eventos_comercial_actor
  on eventos_comercial (actor_id, created_at desc);
