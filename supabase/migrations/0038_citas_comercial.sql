-- Citas del WhatsApp comercial y de qué campaña de Meta llegó el lead.
-- Pegar en Supabase → SQL Editor → Run.

alter table conversaciones_comercial
  add column if not exists campana_id text,
  add column if not exists ctwa_clid text,
  add column if not exists campana_url text;

create table if not exists citas_comercial (
  id                uuid primary key default gen_random_uuid(),
  conversacion_id   uuid references conversaciones_comercial(id) on delete set null,
  wa_numero         text not null,
  nombre            text not null,
  celular           text,
  sede              text not null check (sede in ('juan_diaz', 'chorrera')),
  fecha             date not null,
  hora              text not null,
  lugar             text,
  confirmacion      text not null default 'pendiente' check (confirmacion in ('pendiente', 'chat', 'llamada')),
  estado            text not null default 'programada' check (estado in ('programada', 'cancelada')),
  campana_id        text,
  anuncio           text,
  aviso_vispera_at  timestamptz,
  aviso_dia_at      timestamptz,
  aviso_error       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_citas_comercial_fecha
  on citas_comercial (fecha, hora);

comment on table citas_comercial is
  'Visitas agendadas por Lucía. confirmacion pendiente = el equipo puede llamar.';

alter table citas_comercial enable row level security;
