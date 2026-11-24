-- ============================================================================
-- 0055 — Ex clientes: archivo con deuda + dar de baja
-- Al archivar un contrato debiendo, entra a cobro de ex clientes.
-- "baja" = nos bloquearon o ya no responden / no pagan.
-- contrato_id amarra el saldo al contrato para que los pagos lo bajen.
-- ============================================================================

alter table ex_clientes drop constraint if exists ex_clientes_origen_chk;
alter table ex_clientes
  add constraint ex_clientes_origen_chk
  check (origen in ('manual', 'excel', 'archivo'));

alter table ex_clientes drop constraint if exists ex_clientes_estado_chk;
alter table ex_clientes
  add constraint ex_clientes_estado_chk
  check (estado in ('cobro', 'acuerdo', 'pausado', 'cerrado', 'baja'));

alter table ex_clientes
  add column if not exists contrato_id uuid references contratos(id) on delete set null;

alter table ex_clientes
  add column if not exists motivo_baja text;

alter table ex_clientes
  add column if not exists baja_at timestamptz;

create unique index if not exists idx_ex_clientes_contrato
  on ex_clientes (contrato_id)
  where contrato_id is not null;

comment on column ex_clientes.contrato_id is
  'Contrato archivado/cerrado cuya deuda se cobra como ex cliente.';
comment on column ex_clientes.motivo_baja is
  'Por qué se dio de baja del cobro (bloqueo, no responden, etc.).';
