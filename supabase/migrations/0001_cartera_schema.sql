-- ============================================================================
-- Auto Lujo · Cartera — Modelo de datos v1
-- Pegar en Supabase → SQL Editor. Idempotente donde es razonable.
-- Revisar antes de aplicar. Domina: cobranza diaria de renta de autos.
-- ============================================================================

-- gen_random_uuid() viene de pgcrypto (activo por defecto en Supabase).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- ENUMS (creados de forma idempotente)
-- ---------------------------------------------------------------------------
do $$ begin
  create type estado_vehiculo as enum
    ('activo','mantenimiento','chapisteria','por_entregar','improductivo','entregado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_contrato as enum ('activo','finalizado','suspendido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_acuerdo as enum ('dano','financiamiento','otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_cargo as enum
    ('cuenta_diaria','acuerdo','multa','panapass','exceso_km','ajuste');
exception when duplicate_object then null; end $$;

do $$ begin
  create type metodo_pago as enum ('transferencia','efectivo','tarjeta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_conciliacion as enum ('pendiente','conciliado','rechazado','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type canal_envio as enum ('whatsapp','sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_envio as enum ('pendiente','enviado','fallido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_vinculo_wa as enum ('individual','grupo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_vinculo_wa as enum ('pendiente','activo','archivado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- EMPRESAS  (Autolujo, Kowua, Gold — numeración no se repite entre ellas)
-- ---------------------------------------------------------------------------
create table if not exists empresas (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique,          -- AUTOLUJO / KOWUA / GOLD
  nombre              text not null,
  ruc                 text,
  representante_legal text,
  prefijo_carro       text default '',               -- ej. 'G' para Gold (G01..G39)
  rango_min           int,                           -- ej. Autolujo 1..332, Kowua 200..217
  rango_max           int,
  created_at          timestamptz not null default now()
);

create table if not exists cuentas_bancarias (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  banco         text not null default 'Banco General',
  numero_cuenta text,
  tipo          text,
  titular       text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- VEHÍCULOS
-- ---------------------------------------------------------------------------
create table if not exists vehiculos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete restrict,
  numero       text not null,                        -- número de carro dentro de la empresa
  placa        text,
  marca        text,
  modelo       text,
  anio         int,
  km_inicial   int default 0,
  km_actual    int default 0,
  gps_id       text,                                 -- id en Diacor
  panapass     text,
  estado       estado_vehiculo not null default 'activo',
  created_at   timestamptz not null default now(),
  unique (empresa_id, numero)
);

-- ---------------------------------------------------------------------------
-- TARIFARIO  (letra diaria según empresa / año / modelo / rango de km)
--   Regla real: $25 (2020), $30/31/33/35/37; $35 y $37 para 0..10.000 km.
--   Se resuelve tomando la fila vigente que mejor calce con año+modelo+km.
-- ---------------------------------------------------------------------------
create table if not exists tarifas (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid references empresas(id) on delete cascade,   -- null = aplica a todas
  modelo       text,                                             -- null = cualquier modelo
  anio         int,                                              -- null = cualquier año
  km_min       int default 0,
  km_max       int default 2147483647,
  letra_diaria numeric(10,2) not null,
  vigente      boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------------
create table if not exists clientes (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  cedula           text,
  telefono         text,
  whatsapp         text,                              -- E.164, ej. +5076XXXXXXX
  direccion        text,
  mayor_de_25      boolean,
  score_financiero int not null default 0,            -- puntaje por comportamiento de pago
  activo           boolean not null default true,
  notas            text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CONTRATOS  (cliente + vehículo + empresa)
--   num_cuotas_total: 365..1275 según año/modelo.
-- ---------------------------------------------------------------------------
create table if not exists contratos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references clientes(id)  on delete restrict,
  vehiculo_id       uuid not null references vehiculos(id) on delete restrict,
  empresa_id        uuid not null references empresas(id)  on delete restrict,
  fecha_inicio      date not null default current_date,
  letra_diaria      numeric(10,2) not null,
  num_cuotas_total  int,
  abono_inicial     numeric(10,2) default 0,           -- NO reembolsable
  saldo_inicial     numeric(12,2) default 0,           -- saldo migrado al arranque
  estado            estado_contrato not null default 'activo',
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ACUERDOS  (daños al 50% financiados a $5/día y $30/domingo, u otros)
-- ---------------------------------------------------------------------------
create table if not exists acuerdos (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid not null references contratos(id) on delete cascade,
  tipo          tipo_acuerdo not null default 'dano',
  descripcion   text,
  monto_total   numeric(12,2) not null,
  saldo         numeric(12,2) not null,
  cuota_diaria  numeric(10,2) not null default 5,
  cuota_domingo numeric(10,2) not null default 30,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CARGOS  (lo que el cliente DEBE — ledger lado débito)
--   Regla de aplicación: primero al acuerdo, luego a la cuenta diaria.
-- ---------------------------------------------------------------------------
create table if not exists cargos (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references contratos(id) on delete cascade,
  acuerdo_id   uuid references acuerdos(id) on delete set null,
  fecha        date not null default current_date,
  tipo         tipo_cargo not null,
  concepto     text,
  monto        numeric(12,2) not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_cargos_contrato_fecha on cargos(contrato_id, fecha);

-- ---------------------------------------------------------------------------
-- PAGOS  (lo que el cliente PAGA — ledger lado crédito, con comprobante)
-- ---------------------------------------------------------------------------
create table if not exists pagos (
  id                     uuid primary key default gen_random_uuid(),
  contrato_id            uuid not null references contratos(id) on delete cascade,
  cliente_id             uuid references clientes(id) on delete set null,
  fecha                  date not null default current_date,
  monto                  numeric(12,2) not null,
  metodo                 metodo_pago not null default 'transferencia',
  banco                  text,
  referencia             text,
  comprobante_url        text,                         -- captura subida por el cliente
  estado_conciliacion    estado_conciliacion not null default 'pendiente',
  movimiento_extracto_id uuid,                         -- FK se agrega abajo (dependencia circular)
  notas                  text,
  created_at             timestamptz not null default now()
);
create index if not exists idx_pagos_contrato_fecha on pagos(contrato_id, fecha);
create index if not exists idx_pagos_estado on pagos(estado_conciliacion);

-- ---------------------------------------------------------------------------
-- EXTRACTOS BANCARIOS  (el archivo que Auto Lujo sube — NO hay API bancaria)
-- ---------------------------------------------------------------------------
create table if not exists extractos_bancarios (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references empresas(id) on delete restrict,
  cuenta_bancaria_id uuid references cuentas_bancarias(id) on delete set null,
  banco              text not null default 'Banco General',
  fecha              date not null,
  archivo_url        text,
  cargado_por        text,
  created_at         timestamptz not null default now()
);

create table if not exists movimientos_extracto (
  id           uuid primary key default gen_random_uuid(),
  extracto_id  uuid not null references extractos_bancarios(id) on delete cascade,
  fecha        date not null,
  monto        numeric(12,2) not null,
  referencia   text,
  descripcion  text,
  conciliado   boolean not null default false,
  pago_id      uuid references pagos(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_mov_extracto_conciliado on movimientos_extracto(conciliado);

-- FK diferida de pagos → movimientos_extracto (dependencia circular resuelta)
do $$ begin
  alter table pagos
    add constraint fk_pagos_movimiento
    foreign key (movimiento_extracto_id)
    references movimientos_extracto(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- CONFIG / REGLAS  (parámetros del negocio; global o por empresa)
--   Cierre a las 12:00 del mediodía · pago hasta las 19:00 · multa $5 ·
--   exceso 8.000 km/mes → $2 por cada 10 km.
-- ---------------------------------------------------------------------------
create table if not exists config_reglas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid references empresas(id) on delete cascade, -- null = global
  hora_cierre         time not null default '12:00',
  hora_limite_pago    time not null default '19:00',
  multa_tarde         numeric(10,2) not null default 5,
  pago_minimo_diario  numeric(10,2) not null default 5,
  pago_minimo_domingo numeric(10,2) not null default 30,
  km_incluido_mes     int not null default 8000,
  exceso_km_costo     numeric(10,2) not null default 2,   -- $2
  exceso_km_bloque    int not null default 10,             -- por cada 10 km
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ESTADOS DE CUENTA  (log del envío diario 8am)
-- ---------------------------------------------------------------------------
create table if not exists estados_cuenta (
  id               uuid primary key default gen_random_uuid(),
  contrato_id      uuid not null references contratos(id) on delete cascade,
  fecha            date not null default current_date,
  saldo_cuentas    numeric(12,2) default 0,
  saldo_acuerdos   numeric(12,2) default 0,
  cuotas_pagadas   int,
  cuotas_restantes int,
  canal            canal_envio not null default 'whatsapp',
  estado           estado_envio not null default 'pendiente',
  enviado_at       timestamptz,
  created_at       timestamptz not null default now(),
  unique (contrato_id, fecha)
);

-- ---------------------------------------------------------------------------
-- VÍNCULOS WHATSAPP  (cliente ↔ chat 1:1 o grupo; opt-in)
--   1 grupo por cliente cuando el OBA esté aprobado; 1:1 en el piloto.
-- ---------------------------------------------------------------------------
create table if not exists wa_vinculos (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references clientes(id) on delete cascade,
  wa_id              text,                              -- phone (1:1) o group id
  tipo               tipo_vinculo_wa not null default 'individual',
  grupo_invite_link  text,
  opt_in             boolean not null default false,
  opt_in_at          timestamptz,
  estado             estado_vinculo_wa not null default 'pendiente',
  created_at         timestamptz not null default now()
);
create index if not exists idx_wa_cliente on wa_vinculos(cliente_id);

-- ---------------------------------------------------------------------------
-- VISTA: saldo por contrato  (cargos − pagos conciliados/manuales)
-- ---------------------------------------------------------------------------
create or replace view vw_saldo_contrato as
select
  c.id as contrato_id,
  c.cliente_id,
  c.saldo_inicial
    + coalesce((select sum(g.monto) from cargos g where g.contrato_id = c.id), 0)
    - coalesce((select sum(p.monto) from pagos p
                 where p.contrato_id = c.id
                   and p.estado_conciliacion in ('conciliado','manual')), 0)
    as saldo_actual
from contratos c;

-- ---------------------------------------------------------------------------
-- SEED mínimo: las 3 empresas + config global por defecto
-- ---------------------------------------------------------------------------
insert into empresas (codigo, nombre, prefijo_carro, rango_min, rango_max)
values
  ('AUTOLUJO','Autolujo','',    1,   332),
  ('KOWUA','Kowua','',        200,   217),
  ('GOLD','Reparaciones Gold','G', 1,  39)
on conflict (codigo) do nothing;

insert into config_reglas (empresa_id)
select null
where not exists (select 1 from config_reglas where empresa_id is null);

-- ============================================================================
-- Fin v1. Próximo: RLS/políticas de acceso por rol y funciones de conciliación.
-- ============================================================================
