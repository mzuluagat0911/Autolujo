-- ============================================================================
-- 0010 — Antifraude de comprobantes: un comprobante = un pago
--
-- `pagos.referencia` no tenía ningún candado, así que reenviar la misma
-- captura creaba un pago nuevo cada vez. En los datos del piloto ya pasó:
--   referencia "239914989" ×2  ·  referencia "3057" ×3
--
-- Primero se limpian los duplicados existentes (se conserva el más antiguo y
-- el resto queda 'rechazado'), y luego se crea el índice único que lo impide.
-- Los rechazados quedan fuera del índice: si el equipo descarta un pago, el
-- cliente puede volver a enviar el comprobante bueno.
--
-- Es idempotente.
-- ============================================================================

-- 1. Limpieza: marcar como rechazados los duplicados, conservando el primero.
with ranked as (
  select id,
         row_number() over (
           partition by lower(btrim(referencia))
           order by created_at asc, id asc
         ) as rn
    from pagos
   where referencia is not null
     and btrim(referencia) <> ''
     and estado_conciliacion <> 'rechazado'
)
update pagos p
   set estado_conciliacion = 'rechazado',
       notas = coalesce(p.notas || ' · ', '') || 'Duplicado por referencia (limpieza 0010).'
  from ranked r
 where p.id = r.id
   and r.rn > 1;

-- 2. Candado: una referencia viva por pago.
create unique index if not exists uq_pago_referencia
  on pagos (lower(btrim(referencia)))
  where referencia is not null
    and btrim(referencia) <> ''
    and estado_conciliacion <> 'rechazado';

-- 3. La cuenta destino que leyó la IA, para poder cruzarla con las nuestras.
alter table pagos add column if not exists cuenta_destino text;

comment on column pagos.cuenta_destino is
  'Cuenta a la que dice el comprobante que se transfirió. Se compara con cuentas_bancarias.';
