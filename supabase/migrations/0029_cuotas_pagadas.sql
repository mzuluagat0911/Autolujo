-- ============================================================================
-- 0029 — Cuotas del plan (Excel: CUOTAS / CUOTAS PAGAS / FALTANTES).
-- `cuotas_pagadas` + `num_cuotas_total` → faltantes = total − pagadas.
-- ============================================================================

alter table contratos
  add column if not exists cuotas_pagadas numeric(12,2);

comment on column contratos.cuotas_pagadas is
  'Cuotas ya pagadas del plan (migrado del Excel / operaciones). Null = calcular desde ledger.';
