-- ============================================================================
-- 0062 — Transferencias entre sedes, salida a carro y cobro (cliente/empresa) después.
-- ============================================================================

alter table inventario_movimientos
  drop constraint if exists inventario_movimientos_tipo_check;

alter table inventario_movimientos
  add constraint inventario_movimientos_tipo_check
  check (tipo in ('entrada', 'salida', 'transferencia'));

alter table inventario_movimientos
  add column if not exists sede_destino text
    check (sede_destino is null or sede_destino in ('juan_diaz', 'chorrera'));

alter table inventario_movimientos
  add column if not exists vehiculo_id uuid references vehiculos(id) on delete set null;

alter table inventario_movimientos
  add column if not exists cobro_a text
    check (cobro_a is null or cobro_a in ('cliente', 'empresa'));

alter table inventario_movimientos
  add column if not exists cobro_asignado_at timestamptz;

comment on column inventario_movimientos.sede_destino is
  'Solo transferencias: sede que recibe. sede = origen.';
comment on column inventario_movimientos.cobro_a is
  'Salidas a carro: quién paga (cliente/empresa). Se asigna después; null = pendiente.';

create index if not exists inventario_movimientos_cobro_pendiente_idx
  on inventario_movimientos (fecha desc)
  where tipo = 'salida' and cobro_a is null;

create index if not exists inventario_movimientos_vehiculo_idx
  on inventario_movimientos (vehiculo_id)
  where vehiculo_id is not null;
