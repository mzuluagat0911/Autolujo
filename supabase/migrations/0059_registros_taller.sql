-- ============================================================================
-- 0059 — Registro de visita de taller (FULL / kit / revisión / ATF / mecánica)
-- Misma ficha si se llena en Agenda o (luego) por WhatsApp Néstor.
-- ============================================================================

-- ATF como tipo de cita aparte
alter table citas_taller drop constraint if exists citas_taller_tipo_check;
alter table citas_taller add constraint citas_taller_tipo_check
  check (tipo in ('revision_mensual', 'mantenimiento_6000', 'kit_tiempos', 'atf', 'mecanica'));

create table if not exists registros_taller (
  id                 uuid primary key default gen_random_uuid(),
  cita_id            uuid references citas_taller(id) on delete set null,
  vehiculo_id        uuid not null references vehiculos(id) on delete cascade,
  cliente_id         uuid references clientes(id) on delete set null,
  tipo               text not null
    check (tipo in ('revision_mensual', 'mantenimiento_6000', 'kit_tiempos', 'atf', 'mecanica')),
  fecha              date not null,
  sucursal           text not null check (sucursal in ('juan_diaz', 'chorrera')),
  km                 int,
  asistencia         text not null default 'llego'
    check (asistencia in ('llego', 'no_llego', 'cancelada')),
  -- FULL 6.000
  full_filtro_ac     boolean,
  full_filtro_motor  boolean,
  full_filtro_aceite boolean,
  full_cuartos_aceite boolean,
  full_ajuste_liquidos boolean,
  promo_gratis       boolean,
  monto_cobrado      numeric(12, 2),
  sticker_ok         boolean,
  carro_limpio       boolean,
  -- Kit
  transmision        text check (transmision is null or transmision in ('manual', 'automatico')),
  precio_lista_kit   numeric(12, 2),
  monto_cliente_kit  numeric(12, 2),
  items_kit          jsonb not null default '[]'::jsonb,
  -- Mecánica / general
  trabajo            text,
  operativo          boolean,
  costo_edison       numeric(12, 2),
  comentario         text,
  aviso_cartera_multa boolean not null default false,
  motivo_multa       text,
  origen             text not null default 'agenda_web'
    check (origen in ('agenda_web', 'whatsapp_nestor')),
  creado_por         uuid references equipo(id) on delete set null,
  proxima_fecha      date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists registros_taller_fecha_idx
  on registros_taller (fecha desc, sucursal);

create index if not exists registros_taller_vehiculo_idx
  on registros_taller (vehiculo_id, fecha desc);

create table if not exists registros_taller_fotos (
  id          uuid primary key default gen_random_uuid(),
  registro_id uuid not null references registros_taller(id) on delete cascade,
  path        text not null,
  es_sticker  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists registros_taller_fotos_reg_idx
  on registros_taller_fotos (registro_id);

comment on table registros_taller is
  'Cierre de visita de taller. FULL = 3 filtros + 4 cuartos + líquidos. Kit manual 212 / auto 234.';

alter table registros_taller enable row level security;
alter table registros_taller_fotos enable row level security;
