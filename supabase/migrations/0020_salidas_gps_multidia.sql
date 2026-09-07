-- ============================================================================
-- 0020 — Viaje de varios días, destino fuera de tabla, cruce GPS.
-- ============================================================================

alter table salidas_autorizadas add column if not exists fecha_hasta date;
alter table salidas_autorizadas add column if not exists fuera_tabla boolean not null default false;
alter table salidas_autorizadas add column if not exists gps_estado text;
alter table salidas_autorizadas add column if not exists gps_nota text;
alter table salidas_autorizadas add column if not exists gps_lat numeric(10,6);
alter table salidas_autorizadas add column if not exists gps_lng numeric(10,6);
alter table salidas_autorizadas add column if not exists gps_at timestamptz;

update salidas_autorizadas set fecha_hasta = fecha where fecha_hasta is null;

create table if not exists salidas_alertas (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  tipo         text not null,  -- fuera_tabla | multidia | gps_desvio | gps_sin_aval | gps_otro
  salida_id    uuid references salidas_autorizadas(id) on delete cascade,
  vehiculo_id  uuid references vehiculos(id) on delete set null,
  etiqueta     text,
  motivo       text not null,
  created_at   timestamptz not null default now(),
  vista_at     timestamptz
);

create unique index if not exists uq_salida_alerta_veh
  on salidas_alertas (fecha, tipo, vehiculo_id)
  where vehiculo_id is not null;
create unique index if not exists uq_salida_alerta_sid
  on salidas_alertas (fecha, tipo, salida_id)
  where salida_id is not null;

create index if not exists idx_salidas_alertas_pend
  on salidas_alertas (created_at)
  where vista_at is null;
