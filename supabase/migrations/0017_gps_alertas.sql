-- ============================================================================
-- 0017 — Alertas de GPS del día
-- Exceso (>350 km) o carro sin recorrido. Una fila por dispositivo + tipo + fecha.
-- El equipo las ve en la campana y en /cartera/rastreo. No cobra solo.
-- ============================================================================

create table if not exists gps_alertas (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null,
  tipo            text not null,          -- 'exceso_km_dia' | 'sin_recorrido'
  id_dispositivo  text not null,
  vehiculo_id     uuid references vehiculos(id) on delete set null,
  etiqueta        text,
  km              numeric(12,2),
  created_at      timestamptz not null default now(),
  vista_at        timestamptz,
  unique (fecha, id_dispositivo, tipo)
);

create index if not exists idx_gps_alertas_pendientes
  on gps_alertas (created_at)
  where vista_at is null;
