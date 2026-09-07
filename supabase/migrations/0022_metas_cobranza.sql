-- ============================================================================
-- 0022 — Meta mensual de cobranza (asignada por admin).
-- Una fila por mes calendario (día 1). El Resumen la usa como Meta 100%.
-- ============================================================================

create table if not exists metas_cobranza (
  mes          date primary key,                          -- siempre el día 1 del mes
  meta_100     numeric(14,2) not null check (meta_100 > 0),
  nota         text,                                      -- ej. "2000 Exclientes"
  creado_por   uuid references equipo(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table metas_cobranza is
  'Meta de recaudo al 100% por mes. La carga el admin; el Resumen calcula 95%, diario e ideal.';

create index if not exists idx_metas_cobranza_updated on metas_cobranza (updated_at desc);
