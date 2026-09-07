-- ============================================================================
-- 0018 — Histórico GPS (un día por dispositivo + fotos de posición)
-- El cron ya no pide el recorrido de toda la flota: el km sale del odómetro
-- entre lecturas. El recorrido de Diacor solo se usa si el odómetro no sirve.
-- ============================================================================

create table if not exists gps_dias (
  fecha           date not null,
  id_dispositivo  text not null,
  vehiculo_id     uuid references vehiculos(id) on delete set null,
  etiqueta        text,
  km              numeric(12,2),
  fuente          text,                    -- 'odometro' | 'recorrido'
  odometro_ini    numeric(14,2),
  odometro_fin    numeric(14,2),
  latitud         double precision,
  longitud        double precision,
  direccion       text,
  gps_en_linea    boolean,
  alerta          text,                    -- exceso_km_dia | sin_recorrido | null
  actualizado_at  timestamptz not null default now(),
  primary key (fecha, id_dispositivo)
);

create index if not exists idx_gps_dias_vehiculo on gps_dias (vehiculo_id, fecha desc);
create index if not exists idx_gps_dias_alerta on gps_dias (fecha) where alerta is not null;

create table if not exists gps_posiciones (
  id              uuid primary key default gen_random_uuid(),
  tomado_at       timestamptz not null default now(),
  fecha           date not null,
  id_dispositivo  text not null,
  vehiculo_id     uuid references vehiculos(id) on delete set null,
  latitud         double precision,
  longitud        double precision,
  velocidad       numeric(8,2),
  direccion       text,
  odometro        numeric(14,2),
  gps_en_linea    boolean,
  encendido       boolean,
  etiqueta        text
);

create index if not exists idx_gps_posiciones_disp
  on gps_posiciones (id_dispositivo, tomado_at desc);
create index if not exists idx_gps_posiciones_fecha
  on gps_posiciones (fecha, id_dispositivo);
