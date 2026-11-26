-- ============================================================================
-- 0065 — Alta/edición de ítems + ediciones de movimientos con motivo (trazabilidad).
-- ============================================================================

alter table inventario_movimientos
  add column if not exists updated_at timestamptz;

create table if not exists inventario_movimientos_ediciones (
  id             uuid primary key default gen_random_uuid(),
  movimiento_id  uuid not null references inventario_movimientos(id) on delete cascade,
  motivo         text not null check (char_length(trim(motivo)) >= 5),
  antes          jsonb not null,
  despues        jsonb not null,
  editado_por    uuid references equipo(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists inventario_movimientos_ediciones_mov_idx
  on inventario_movimientos_ediciones (movimiento_id, created_at desc);

comment on table inventario_movimientos_ediciones is
  'Historial de cambios a entradas/salidas/transferencias. Motivo obligatorio.';

alter table inventario_movimientos_ediciones enable row level security;
