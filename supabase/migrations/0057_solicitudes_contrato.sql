-- ============================================================================
-- 0057 — Solicitudes de contrato
-- Comercial pide el alta; cartera aprueba (o modifica) y recién ahí se crea
-- el cliente y el contrato. El payload guarda el formulario completo.
-- ============================================================================

create table if not exists solicitudes_contrato (
  id              uuid primary key default gen_random_uuid(),
  estado          text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  solicitante_id  uuid references equipo(id) on delete set null,
  aprobador_id    uuid references equipo(id) on delete set null,
  aprobado_at     timestamptz,
  motivo_rechazo  text,
  notas_internas  text,

  -- Resumen para listar sin abrir el JSON
  nombre          text not null,
  whatsapp        text,
  telefono        text,
  wa_norm         text,
  vehiculo_id     uuid references vehiculos(id) on delete set null,
  carro_numero    text,
  empresa_codigo  text,
  letra_diaria    numeric(12,2),
  sucursal        text,
  fecha_inicio    date,

  -- Formulario completo (claves = name del FormData)
  payload         jsonb not null default '{}'::jsonb,

  -- Tras aprobar
  cliente_id      uuid references clientes(id) on delete set null,
  contrato_id     uuid references contratos(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_solicitudes_contrato_estado
  on solicitudes_contrato (estado, created_at desc);

create index if not exists idx_solicitudes_contrato_wa
  on solicitudes_contrato (wa_norm)
  where wa_norm is not null;

create index if not exists idx_solicitudes_contrato_vehiculo
  on solicitudes_contrato (vehiculo_id)
  where vehiculo_id is not null and estado = 'pendiente';

comment on table solicitudes_contrato is
  'Pedido de alta de comercial. Cliente y contrato se crean al aprobar en cartera.';

alter table solicitudes_contrato enable row level security;

drop policy if exists equipo_lee_solicitudes_contrato on solicitudes_contrato;
create policy equipo_lee_solicitudes_contrato on solicitudes_contrato
  for select to authenticated
  using (exists (select 1 from equipo e where e.id = auth.uid() and e.activo));
