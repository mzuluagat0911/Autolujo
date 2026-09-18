-- ============================================================================
-- 0026 — Hoja de vida del vehículo (bitácora editable en Operaciones)
--   Sustituye el Excel: cada evento (mant, chapistería, entrega, etc.) queda
--   atado a un carro y se puede agregar / editar / borrar desde el wizard.
-- ============================================================================

do $$ begin
  create type tipo_evento_hv as enum (
    'mantenimiento',
    'revision',
    'chapisteria',
    'contrato',
    'devolucion',
    'novedad',
    'documento',
    'otro'
  );
exception when duplicate_object then null;
end $$;

create table if not exists vehiculo_eventos (
  id          uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references vehiculos(id) on delete cascade,
  fecha       date not null,
  km          int,
  tipo        tipo_evento_hv not null default 'otro',
  titulo      text,
  detalle     text,
  lugar       text,
  valor       numeric(12, 2),
  origen      text not null default 'manual', -- manual | hv_excel
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vehiculo_eventos_vehiculo_fecha_idx
  on vehiculo_eventos (vehiculo_id, fecha desc);

create index if not exists vehiculo_eventos_tipo_idx
  on vehiculo_eventos (tipo);
