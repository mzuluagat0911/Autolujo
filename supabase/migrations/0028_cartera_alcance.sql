-- ============================================================================
-- 0028 — Alcance operativo de cartera (piloto por empresa).
-- Filas = empresas incluidas en panel + envíos/crons.
-- Tabla vacía = sin filtro (todas las empresas).
-- GPS / rastreo NO lee esta tabla.
-- ============================================================================

create table if not exists cartera_alcance (
  empresa_id  uuid primary key references empresas(id) on delete cascade,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references equipo(id) on delete set null
);

comment on table cartera_alcance is
  'Empresas en el alcance de cartera (piloto). Vacía = todas. No aplica a GPS.';
