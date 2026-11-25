-- ============================================================================
-- 0058 — Agenda de taller (Néstor) + chats del WhatsApp de mantenimiento
-- Citas por sede (entrega del contrato). Llegó / no llegó, notas y ancla
-- de próxima revisión / mantenimiento al marcar hecha.
-- ============================================================================

create table if not exists citas_taller (
  id              uuid primary key default gen_random_uuid(),
  vehiculo_id     uuid not null references vehiculos(id) on delete cascade,
  cliente_id      uuid references clientes(id) on delete set null,
  tipo            text not null
    check (tipo in ('revision_mensual', 'mantenimiento_6000', 'kit_tiempos', 'mecanica')),
  fecha           date not null,
  hora_texto      text,
  sucursal        text not null
    check (sucursal in ('juan_diaz', 'chorrera')),
  trabajo         text,
  monto_cliente   numeric(12, 2),
  estado          text not null default 'programada'
    check (estado in ('programada', 'llego', 'no_llego', 'cancelada', 'hecha')),
  km_al_atender   int,
  proxima_fecha   date,
  comentario      text,
  creado_por      uuid references equipo(id) on delete set null,
  actualizado_por uuid references equipo(id) on delete set null,
  atendido_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists citas_taller_fecha_sucursal_idx
  on citas_taller (fecha, sucursal, estado);

create index if not exists citas_taller_vehiculo_idx
  on citas_taller (vehiculo_id, fecha desc);

create table if not exists citas_taller_notas (
  id         uuid primary key default gen_random_uuid(),
  cita_id    uuid not null references citas_taller(id) on delete cascade,
  autor_id   uuid references equipo(id) on delete set null,
  texto      text not null,
  created_at timestamptz not null default now()
);

create index if not exists citas_taller_notas_cita_idx
  on citas_taller_notas (cita_id, created_at desc);

comment on table citas_taller is
  'Agenda de taller: revisión, FULL 6.000, kit o mecánica. Sucursal = sede de entrega.';

-- Chats del +507 6623-6501. No se mezclan con cartera ni comercial.
create table if not exists conversaciones_mantenimiento (
  id                 uuid primary key default gen_random_uuid(),
  wa_numero          text not null unique,
  nombre             text,
  vehiculo_id        uuid references vehiculos(id) on delete set null,
  ultimo_mensaje_at  timestamptz,
  ultimo_entrante_at timestamptz,
  ultimo_texto       text,
  no_leidos          integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_conv_mant_ultimo
  on conversaciones_mantenimiento (ultimo_mensaje_at desc nulls last);

create table if not exists mensajes_mantenimiento (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones_mantenimiento(id) on delete cascade,
  direccion       text not null check (direccion in ('in', 'out')),
  texto           text,
  wa_message_id   text unique,
  autor_id        uuid references equipo(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_mensajes_mant_conv
  on mensajes_mantenimiento (conversacion_id, created_at);

alter table citas_taller enable row level security;
alter table citas_taller_notas enable row level security;
alter table conversaciones_mantenimiento enable row level security;
alter table mensajes_mantenimiento enable row level security;
