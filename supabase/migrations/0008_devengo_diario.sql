-- ============================================================================
-- 0008 — Devengo diario de la cuota (cargo tipo 'renta')
--
-- Hasta ahora NADA insertaba la cuota diaria en `cargos`, así que
-- `vw_saldo_contrato` (saldo_inicial + cargos − pagos) solo bajaba: el saldo
-- nunca crecía con el paso de los días. El job de devengo crea un cargo de
-- renta por contrato activo y por día operativo; este índice es el candado que
-- lo hace idempotente (si el cron corre dos veces, no duplica la cuota).
--
-- Es idempotente: se puede correr varias veces.
-- Nota: no puede haber cargos 'renta' previos (nunca se generaron), así que el
-- índice no debería chocar con datos existentes.
-- ============================================================================

-- Un solo cargo de renta por contrato y día.
create unique index if not exists uq_cargo_renta_dia
  on cargos(contrato_id, fecha)
  where tipo = 'renta';

-- El devengo consulta "qué se cargó en esta fecha"; y el contexto del agente
-- consulta "hasta qué día está devengado este contrato".
create index if not exists idx_cargos_fecha_tipo on cargos(fecha, tipo);
