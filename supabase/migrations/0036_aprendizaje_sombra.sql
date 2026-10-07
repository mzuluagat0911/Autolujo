-- ============================================================================
-- 0036 — Aprendizaje en sombra (fase 5).
-- Alias, ejemplos, pesos y huella de la imagen. No cambian el cruce que
-- mueve dinero. Pegar después de 0034 y 0035.
-- ============================================================================

create table if not exists conciliacion_alias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  tipo        text not null check (tipo in ('remitente', 'cuenta_emisora')),
  valor       text not null,
  contrato_id uuid references contratos(id) on delete set null,
  numero_carro text,
  veces       integer not null default 1,
  vigente     boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (empresa_id, tipo, valor)
);

create index if not exists idx_conciliacion_alias_empresa
  on conciliacion_alias (empresa_id)
  where vigente;

comment on table conciliacion_alias is
  'Remitente o cuenta que el equipo confirmó para un carro. Sugiere; no concilia solo.';

create table if not exists conciliacion_ejemplos (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  empresa_id    uuid references empresas(id) on delete set null,
  movimiento_id uuid references movimientos_extracto(id) on delete set null,
  pago_id       uuid references pagos(id) on delete set null,
  contrato_id   uuid references contratos(id) on delete set null,
  resultado     text not null check (resultado in ('acierto', 'rechazo')),
  senales       jsonb not null default '[]'::jsonb
);

create index if not exists idx_conciliacion_ejemplos_empresa
  on conciliacion_ejemplos (empresa_id, created_at desc);

comment on table conciliacion_ejemplos is
  'Corrección humana: acierto al aplicar, rechazo al deshacer o ignorar. Entrena el ranking en sombra.';

create table if not exists conciliacion_pesos (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  version    text not null default 'aprendizaje-v1',
  pesos      jsonb not null,
  ejemplos   integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table conciliacion_pesos is
  'Pesos del ranking por empresa. Solo se mueven alias, nombre y referencia en texto.';

create table if not exists conciliacion_huellas (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pago_id    uuid not null references pagos(id) on delete cascade,
  empresa_id uuid references empresas(id) on delete set null,
  huella     text not null,
  parecida_a uuid references pagos(id) on delete set null,
  unique (pago_id)
);

create index if not exists idx_conciliacion_huellas_empresa
  on conciliacion_huellas (empresa_id, created_at desc);

comment on table conciliacion_huellas is
  'dHash de la captura. Una imagen parecida se anota; no rechaza el pago.';

alter table conciliacion_alias enable row level security;
alter table conciliacion_ejemplos enable row level security;
alter table conciliacion_pesos enable row level security;
alter table conciliacion_huellas enable row level security;
