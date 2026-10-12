-- Borrador de Lucía y estado de entrega de WhatsApp.
-- Aplicar después de 0039 y 0040. Pegar en Supabase → SQL Editor → Run.

alter table conversaciones_comercial
  add column if not exists borrador text;

alter table mensajes_comercial
  add column if not exists entrega text not null default 'enviado',
  add column if not exists entrega_at timestamptz;

do $$ begin
  alter table mensajes_comercial
    add constraint mensajes_comercial_entrega_check
    check (entrega in ('enviado', 'entregado', 'leido', 'fallido'));
exception when duplicate_object then null; end $$;

create index if not exists idx_mensajes_comercial_entrega
  on mensajes_comercial (entrega, created_at desc)
  where direccion = 'out';
