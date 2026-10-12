-- Asistencia de la visita y reloj de primera respuesta.
-- Aplicar junto con 0039, al final. Pegar en Supabase → SQL Editor → Run.

alter table citas_comercial
  add column if not exists asistencia text not null default 'pendiente';

do $$ begin
  alter table citas_comercial
    add constraint citas_comercial_asistencia_check
    check (asistencia in ('pendiente', 'asistio', 'no_asistio'));
exception when duplicate_object then null; end $$;

create index if not exists idx_citas_comercial_horario
  on citas_comercial (sede, fecha, hora)
  where estado = 'programada';

alter table conversaciones_comercial
  add column if not exists primera_respuesta_at timestamptz;

create index if not exists idx_conv_comercial_respuesta
  on conversaciones_comercial (created_at, primera_respuesta_at);
