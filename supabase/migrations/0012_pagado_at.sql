-- ============================================================================
-- 0012 — Hora real del pago (`pagado_at`)
--
-- La columna `fecha` solo guarda el día. Para saber si el pago fue PUNTUAL
-- (antes de las 7:00 p.m.) hace falta la hora exacta. Sin esto, un pago a
-- las 8 p.m. quedaba como "puntual" y el cliente se llevaba el descuento.
--
-- `pagado_at` = cuándo entró el pago (WhatsApp, oficina, extracto).
-- `fecha` se mantiene como día contable (= día en Panamá de pagado_at).
--
-- Es idempotente.
-- ============================================================================

alter table pagos add column if not exists pagado_at timestamptz;

-- Pagos existentes: usamos created_at como mejor aproximación.
update pagos
   set pagado_at = created_at
 where pagado_at is null;

alter table pagos alter column pagado_at set default now();
alter table pagos alter column pagado_at set not null;

create index if not exists idx_pagos_pagado_at on pagos(pagado_at);
create index if not exists idx_pagos_contrato_pagado on pagos(contrato_id, pagado_at);

comment on column pagos.pagado_at is
  'Instante real del pago (timestamptz). En Panamá, antes de las 19:00 = puntual.';
