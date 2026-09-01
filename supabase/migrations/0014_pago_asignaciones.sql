-- ============================================================================
-- 0014 — Cómo se partió un pago (arreglo → saldo anterior → recargo → cuota).
--
-- El cliente no elige a qué va el abono. El código lo reparte y lo deja
-- escrito en `pagos.asignaciones` para el desglose y para bajar `acuerdos.saldo`.
-- Idempotente.
-- ============================================================================

alter table pagos add column if not exists asignaciones jsonb;

comment on column pagos.asignaciones is
  'Resultado del waterfall: [{tipo, aplicado, ref, etiqueta}]. Null = aún no se aplicó (comprobante pendiente).';
