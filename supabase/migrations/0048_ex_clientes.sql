-- ============================================================================
-- 0048 — Ex clientes: cuenta de deuda sencilla
-- Gente que ya no tiene carro (o nunca estuvo en el sistema) y se le cobra
-- el saldo. No entra al cobro diario de cartera. El Excel y el alta a mano
-- viven acá. Si retoma con otro carro, la deuda vieja pasa a acuerdo.
-- ============================================================================

create table if not exists ex_clientes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  cedula        text,
  telefono      text,
  whatsapp      text,
  empresa_id    uuid not null references empresas(id) on delete restrict,
  carro         text,
  saldo         numeric(12,2) not null default 0,
  motivo        text,
  notas         text,
  origen        text not null default 'manual',
  estado        text not null default 'cobro',
  cliente_id    uuid references clientes(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ex_clientes_origen_chk check (origen in ('manual', 'excel')),
  constraint ex_clientes_estado_chk check (estado in ('cobro', 'acuerdo', 'pausado', 'cerrado')),
  constraint ex_clientes_saldo_chk check (saldo >= 0)
);

create unique index if not exists idx_ex_clientes_cedula
  on ex_clientes (cedula)
  where cedula is not null and length(trim(cedula)) > 0;

create unique index if not exists idx_ex_clientes_whatsapp
  on ex_clientes (whatsapp)
  where whatsapp is not null and length(trim(whatsapp)) > 0;

create index if not exists idx_ex_clientes_empresa on ex_clientes (empresa_id);
create index if not exists idx_ex_clientes_estado on ex_clientes (estado);

comment on table ex_clientes is
  'Deuda de ex clientes (Excel o alta a mano). No genera letra diaria.';

alter table ex_clientes enable row level security;

drop policy if exists cartera_lee_ex_clientes on ex_clientes;
create policy cartera_lee_ex_clientes on ex_clientes
  for select to authenticated
  using (exists (select 1 from equipo e where e.id = auth.uid() and e.activo));
