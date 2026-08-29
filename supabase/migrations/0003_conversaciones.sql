-- ============================================================================
-- Migración 0003 — Conversaciones de WhatsApp (bandeja del equipo) + Storage.
--
-- Diseño 1:1 (sin grupos): una conversación por número de cliente, etiquetada
-- por CARRO + contrato activo. El equipo la ve en /cartera/conversaciones.
--
-- IDEMPOTENTE. Pegar completo en Supabase → SQL Editor → Run.
-- ============================================================================

-- Un hilo por número de cliente (E.164 sin '+', como llega de Meta).
create table if not exists conversaciones (
  id                uuid primary key default gen_random_uuid(),
  wa_numero         text not null unique,
  cliente_id        uuid references clientes(id)   on delete set null,
  vehiculo_id       uuid references vehiculos(id)  on delete set null,  -- carro etiquetado
  contrato_id       uuid references contratos(id)  on delete set null,  -- contrato activo
  etiqueta          text,                                               -- ej. "Carro 144" (editable)
  ultimo_mensaje_at timestamptz,
  ultimo_texto      text,
  no_leidos         integer not null default 0,
  estado            text not null default 'abierta',                    -- abierta / cerrada
  created_at        timestamptz not null default now()
);
create index if not exists idx_conv_ultimo on conversaciones(ultimo_mensaje_at desc nulls last);

-- Cada mensaje entrante/saliente.
create table if not exists mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  direccion       text not null,                       -- 'in' (cliente) | 'out' (agente)
  tipo            text not null default 'text',        -- text / image / system
  texto           text,
  media_url       text,                                -- comprobante en Storage
  wa_message_id   text unique,                         -- id de Meta → idempotencia
  pago_id         uuid references pagos(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_mensajes_conv on mensajes(conversacion_id, created_at);

-- Guardar el # de carro que el cliente escribió en el comprobante (para conciliar).
alter table pagos add column if not exists numero_carro text;

-- Un pago puede llegar ANTES de identificar el contrato (revisión manual) → nullable.
alter table pagos alter column contrato_id drop not null;

-- Bucket privado para las imágenes de comprobantes.
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;
