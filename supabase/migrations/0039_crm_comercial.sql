-- CRM comercial: operación, seguimiento y trazabilidad.
-- Aplicar después de 0037 y 0038.

alter table conversaciones_comercial
  add column if not exists nombre text,
  add column if not exists etapa text not null default 'nuevo',
  add column if not exists temperatura text not null default 'tibio',
  add column if not exists temperatura_score smallint not null default 40,
  add column if not exists temperatura_motivo text,
  add column if not exists asesor_id uuid references equipo(id) on delete set null,
  add column if not exists modo_atencion text not null default 'lucia',
  add column if not exists interes text,
  add column if not exists lugar text,
  add column if not exists resumen text,
  add column if not exists proxima_accion text,
  add column if not exists seguimiento_at timestamptz,
  add column if not exists intentos_seguimiento smallint not null default 0,
  add column if not exists ultimo_seguimiento_at timestamptz,
  add column if not exists resultado text,
  add column if not exists motivo_perdida text,
  add column if not exists cerrado_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version integer not null default 1;

alter table mensajes_comercial
  add column if not exists autor text not null default 'lucia',
  add column if not exists actor_id uuid references equipo(id) on delete set null;

do $$ begin
  alter table mensajes_comercial
    add constraint mensajes_comercial_autor_check
    check (autor in ('cliente', 'lucia', 'humano', 'sistema'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table conversaciones_comercial
    add constraint conversaciones_comercial_etapa_check
    check (etapa in ('nuevo', 'conversacion', 'cita', 'visito', 'ganado', 'perdido'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table conversaciones_comercial
    add constraint conversaciones_comercial_temperatura_check
    check (temperatura in ('caliente', 'tibio', 'frio'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table conversaciones_comercial
    add constraint conversaciones_comercial_modo_check
    check (modo_atencion in ('lucia', 'humano'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table conversaciones_comercial
    add constraint conversaciones_comercial_score_check
    check (temperatura_score between 0 and 100);
exception when duplicate_object then null; end $$;

create index if not exists idx_conv_comercial_cola
  on conversaciones_comercial
  (cerrado_at nulls first, necesita_humano desc, seguimiento_at nulls last, ultimo_mensaje_at desc, id);

create index if not exists idx_conv_comercial_asesor
  on conversaciones_comercial (asesor_id, ultimo_mensaje_at desc, id)
  where cerrado_at is null;

create index if not exists idx_conv_comercial_etapa
  on conversaciones_comercial (etapa, temperatura, ultimo_mensaje_at desc, id);

create index if not exists idx_conv_comercial_seguimiento
  on conversaciones_comercial (seguimiento_at, id)
  where seguimiento_at is not null and cerrado_at is null;

create index if not exists idx_mensajes_comercial_conv_desc
  on mensajes_comercial (conversacion_id, created_at desc, id desc);

create table if not exists eventos_comercial (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones_comercial(id) on delete cascade,
  actor_id        uuid references equipo(id) on delete set null,
  tipo            text not null,
  detalle         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_eventos_comercial_conv
  on eventos_comercial (conversacion_id, created_at desc);

create table if not exists seguimientos_comercial (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones_comercial(id) on delete cascade,
  programado_at   timestamptz not null,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'enviando', 'enviado', 'cancelado', 'fallido')),
  intento         smallint not null check (intento between 1 and 3),
  texto           text,
  plantilla       text,
  motivo_cancelado text,
  error           text,
  enviado_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (conversacion_id, intento)
);

create index if not exists idx_seguimientos_comercial_pendientes
  on seguimientos_comercial (programado_at, id)
  where estado = 'pendiente';

-- Permite sumar "comercial" a los roles existentes sin romper admin/cartera.
comment on column equipo.rol is 'admin | cartera | comercial';

alter table eventos_comercial enable row level security;
alter table seguimientos_comercial enable row level security;

drop policy if exists comercial_equipo_lee_conversaciones on conversaciones_comercial;
create policy comercial_equipo_lee_conversaciones on conversaciones_comercial
  for select to authenticated
  using (exists (select 1 from equipo e where e.id = auth.uid() and e.activo));

drop policy if exists comercial_equipo_lee_mensajes on mensajes_comercial;
create policy comercial_equipo_lee_mensajes on mensajes_comercial
  for select to authenticated
  using (exists (select 1 from equipo e where e.id = auth.uid() and e.activo));

drop policy if exists comercial_equipo_lee_eventos on eventos_comercial;
create policy comercial_equipo_lee_eventos on eventos_comercial
  for select to authenticated
  using (exists (select 1 from equipo e where e.id = auth.uid() and e.activo));

drop policy if exists comercial_equipo_lee_seguimientos on seguimientos_comercial;
create policy comercial_equipo_lee_seguimientos on seguimientos_comercial
  for select to authenticated
  using (exists (select 1 from equipo e where e.id = auth.uid() and e.activo));

-- El webhook y las Server Actions escriben con service_role. La UI autenticada
-- solo escucha/lee; las mutaciones siguen pasando por el servidor.
