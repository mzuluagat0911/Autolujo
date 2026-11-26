-- ============================================================================
-- 0061 — Inventario administrativo (chapistería / mecánica) por sede.
-- Catálogo único; stock aparte en Juan Díaz y La Chorrera.
-- Entradas y salidas mueven el stock. Arranque en 0 (Ángela actualiza).
-- ============================================================================

create table if not exists inventario_items (
  id              uuid primary key default gen_random_uuid(),
  rubro           text not null check (rubro in ('chapisteria', 'mecanica')),
  codigo          text not null,
  descripcion     text not null,
  precio_unitario numeric(12, 2),
  proveedor       text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (rubro, codigo)
);

create index if not exists inventario_items_rubro_idx
  on inventario_items (rubro, activo);

create index if not exists inventario_items_codigo_idx
  on inventario_items (codigo);

create table if not exists inventario_stock (
  item_id    uuid not null references inventario_items(id) on delete cascade,
  sede       text not null check (sede in ('juan_diaz', 'chorrera')),
  cantidad   numeric(12, 3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (item_id, sede)
);

create index if not exists inventario_stock_sede_idx
  on inventario_stock (sede);

create table if not exists inventario_movimientos (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references inventario_items(id) on delete restrict,
  sede            text not null check (sede in ('juan_diaz', 'chorrera')),
  tipo            text not null check (tipo in ('entrada', 'salida')),
  cantidad        numeric(12, 3) not null check (cantidad > 0),
  fecha           date not null,
  vehiculo_numero text,
  proveedor       text,
  notas           text,
  creado_por      uuid references equipo(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists inventario_movimientos_item_idx
  on inventario_movimientos (item_id, fecha desc);

create index if not exists inventario_movimientos_sede_fecha_idx
  on inventario_movimientos (sede, fecha desc);

comment on table inventario_items is
  'Catálogo de piezas/insumos (chapistería o mecánica). Misma lista en ambas sedes.';
comment on table inventario_stock is
  'Cantidad actual por ítem y sede (Juan Díaz / La Chorrera).';
comment on table inventario_movimientos is
  'Entradas y salidas. La UI actualiza inventario_stock al registrar.';

alter table inventario_items enable row level security;
alter table inventario_stock enable row level security;
alter table inventario_movimientos enable row level security;
