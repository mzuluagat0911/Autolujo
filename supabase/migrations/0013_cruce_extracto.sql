-- ============================================================================
-- 0013 — Motivo y vía del cruce en cada movimiento del extracto.
--
-- El extracto ya no aplica dinero por nombre ni por monto parecido. Lo que no
-- calza queda en revisión y el equipo necesita VER POR QUÉ. `motivo` es esa
-- explicación; `via` dice de dónde salió la sugerencia (carro / nombre).
--
-- Es idempotente.
-- ============================================================================

alter table movimientos_extracto add column if not exists motivo text;
alter table movimientos_extracto add column if not exists via text;

comment on column movimientos_extracto.motivo is
  'Por qué se aplicó o por qué quedó en revisión. Lo escribe el cruce, no el LLM.';
comment on column movimientos_extracto.via is
  'perfecto | carro | nombre. Nombre nunca concilia solo: solo sugiere.';
