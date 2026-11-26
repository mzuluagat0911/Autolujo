-- ============================================================================
-- 0064 — Proveedores de inventario (se alimentan con cada entrada).
-- Después, con historial de precios, se recomienda el más barato por pieza.
-- ============================================================================

create table if not exists inventario_proveedores (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  nombre_norm text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (nombre_norm)
);

create index if not exists inventario_proveedores_activo_idx
  on inventario_proveedores (activo, nombre);

alter table inventario_movimientos
  add column if not exists proveedor_id uuid references inventario_proveedores(id) on delete set null;

create index if not exists inventario_movimientos_proveedor_idx
  on inventario_movimientos (proveedor_id)
  where proveedor_id is not null;

comment on table inventario_proveedores is
  'Proveedores creados al registrar entradas. El precio por compra vive en inventario_movimientos.';

alter table inventario_proveedores enable row level security;
