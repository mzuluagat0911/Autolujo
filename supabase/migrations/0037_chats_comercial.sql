-- ============================================================================
-- 0037 — Chats del WhatsApp comercial.
--
-- Otra bandeja, otras tablas. No entra en `conversaciones` ni en `mensajes`
-- de cartera. Pegar en Supabase → SQL Editor → Run.
-- ============================================================================

create table if not exists conversaciones_comercial (
  id                 uuid primary key default gen_random_uuid(),
  wa_numero          text not null unique,
  ultimo_mensaje_at  timestamptz,
  ultimo_entrante_at timestamptz,
  ultimo_texto       text,
  no_leidos          integer not null default 0,
  necesita_humano    boolean not null default false,
  motivo             text,
  anuncio            text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_conv_comercial_ultimo
  on conversaciones_comercial (ultimo_mensaje_at desc nulls last);

create table if not exists mensajes_comercial (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones_comercial(id) on delete cascade,
  direccion       text not null check (direccion in ('in', 'out')),
  texto           text,
  wa_message_id   text unique,
  created_at      timestamptz not null default now()
);

create index if not exists idx_mensajes_comercial_conv
  on mensajes_comercial (conversacion_id, created_at);

comment on table conversaciones_comercial is
  'Hilos del número de ventas. No se mezclan con los chats de cobranza.';

alter table conversaciones_comercial enable row level security;
alter table mensajes_comercial enable row level security;
