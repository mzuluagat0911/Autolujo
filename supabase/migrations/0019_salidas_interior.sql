-- ============================================================================
-- 0019 — Salidas al interior autorizadas (pago previo + aval).
-- No es la multa 127 (salir sin permiso). El abono NO va a la cuota del día.
-- ============================================================================

insert into conceptos_cargo (codigo, nombre, tipo, monto_sugerido) values
  ('SALIDA_INT', 'Salida al interior autorizada', 'otras', null)
on conflict (codigo) do nothing;

alter table cargos add column if not exists pago_id uuid references pagos(id) on delete set null;

alter table pagos add column if not exists rubro text;
alter table pagos add column if not exists destino_interior text;

comment on column pagos.rubro is
  'Si es salida_interior, este abono no cubre la cuota del día (salvo el sobrante).';
comment on column pagos.destino_interior is
  'Destino de la tarifa (Penonomé, Santiago, …) cuando rubro = salida_interior.';

create table if not exists salidas_autorizadas (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references contratos(id) on delete cascade,
  vehiculo_id  uuid references vehiculos(id) on delete set null,
  cliente_id   uuid references clientes(id) on delete set null,
  pago_id      uuid references pagos(id) on delete set null,
  destino      text not null,
  destino_id   text not null,
  monto        numeric(12,2) not null,
  fecha        date not null,
  estado       text not null default 'pendiente_aval', -- pendiente_aval | autorizada | rechazada
  aval_at      timestamptz,
  aval_por     text,
  notas        text,
  created_at   timestamptz not null default now()
);

create unique index if not exists uq_salida_pago
  on salidas_autorizadas (pago_id)
  where pago_id is not null;

create index if not exists idx_salidas_aval
  on salidas_autorizadas (created_at)
  where estado = 'pendiente_aval';
