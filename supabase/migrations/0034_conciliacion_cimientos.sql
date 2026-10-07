-- ============================================================================
-- 0034 — Cimientos de conciliación (fase 1).
--
-- Guarda la huella del movimiento, la empresa y los campos canónicos.
-- Reprocesar el mismo crédito de la misma empresa no puede insertar otra fila.
-- El cruce del comprobante y el movimiento quedan en una sola transacción.
-- Cada decisión nueva queda en conciliacion_auditoria.
--
-- Idempotente. Pegar en Supabase → SQL Editor → Run.
-- La función huella_movimiento tiene que coincidir con huellaMovimiento
-- en lib/cartera/cruce.ts. Fixtures:
--   2026-09-01 | 30 | "TRANSFERENCIA DE JUAN CARRO 144 $30.00"
--     = 2026-09-01|3000|TRANSFERENCIA DE JUAN CARRO 144
--   2026-10-06 | 36.5 | "ACH $36.50" = 2026-10-06|3650|ACH
-- ============================================================================

create or replace function huella_movimiento(p_fecha date, p_monto numeric, p_desc text)
returns text
language plpgsql
immutable
as $$
declare
  d text := coalesce(p_desc, '');
begin
  d := translate(
    d,
    'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ',
    'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn'
  );
  d := upper(d);
  d := regexp_replace(d, '\$[0-9.,]+', ' ', 'g');
  d := regexp_replace(d, '[^A-Z0-9]+', ' ', 'g');
  d := btrim(regexp_replace(d, '\s+', ' ', 'g'));
  d := left(d, 140);
  return coalesce(p_fecha::text, '') || '|' || round(coalesce(p_monto, 0) * 100)::text || '|' || d;
end;
$$;

alter table movimientos_extracto add column if not exists empresa_id uuid references empresas(id) on delete restrict;
alter table movimientos_extracto add column if not exists huella text;
alter table movimientos_extracto add column if not exists referencia_canonica text;
alter table movimientos_extracto add column if not exists numero_carro_canon text;
alter table movimientos_extracto add column if not exists motor_version text;
alter table movimientos_extracto add column if not exists sombra jsonb;

comment on column movimientos_extracto.huella is
  'Identidad del crédito dentro de la empresa. La calcula huellaMovimiento; un reingreso del archivo cae en el índice único.';
comment on column movimientos_extracto.motor_version is
  'Versión del motor que escribió la decisión. cimientos-v1 es la fase 1.';

update movimientos_extracto m
   set empresa_id = e.empresa_id
  from extractos_bancarios e
 where m.extracto_id = e.id
   and m.empresa_id is null;

update movimientos_extracto
   set huella = huella_movimiento(fecha, monto, descripcion)
 where huella is null;

create unique index if not exists uq_mov_empresa_huella
  on movimientos_extracto (empresa_id, huella)
  where empresa_id is not null and huella is not null;

create unique index if not exists uq_mov_pago
  on movimientos_extracto (pago_id)
  where pago_id is not null;

create unique index if not exists uq_pago_movimiento
  on pagos (movimiento_extracto_id)
  where movimiento_extracto_id is not null;

create index if not exists idx_mov_extracto_empresa_fecha
  on movimientos_extracto (empresa_id, fecha);

create table if not exists conciliacion_auditoria (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  actor         text,
  accion        text not null,
  extracto_id   uuid references extractos_bancarios(id) on delete set null,
  movimiento_id uuid references movimientos_extracto(id) on delete set null,
  pago_id       uuid references pagos(id) on delete set null,
  contrato_id   uuid references contratos(id) on delete set null,
  empresa_id    uuid references empresas(id) on delete set null,
  motivo        text,
  antes         jsonb,
  despues       jsonb,
  motor_version text not null default 'cimientos-v1'
);

create index if not exists idx_conciliacion_auditoria_fecha
  on conciliacion_auditoria (created_at desc);
create index if not exists idx_conciliacion_auditoria_mov
  on conciliacion_auditoria (movimiento_id);

alter table conciliacion_auditoria enable row level security;

comment on table conciliacion_auditoria is
  'Bitácora de conciliación. Quién decidió, sobre qué movimiento y con qué versión del motor.';

-- Cruce atómico: el movimiento, el vínculo del pago y la auditoría entran juntos.
-- Si la huella ya existe, no inserta nada y responde repetido.
create or replace function registrar_movimiento_extracto(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mov_id uuid;
  pago uuid := nullif(p->>'pago_id', '')::uuid;
  contrato uuid := nullif(p->>'contrato_id', '')::uuid;
begin
  insert into movimientos_extracto (
    extracto_id, empresa_id, fecha, monto, descripcion, referencia,
    referencia_canonica, numero_carro, numero_carro_canon, nombre_detectado,
    contrato_id, conciliado, pago_id, estado, motivo, via, huella, motor_version, sombra
  ) values (
    (p->>'extracto_id')::uuid,
    (p->>'empresa_id')::uuid,
    nullif(p->>'fecha', '')::date,
    (p->>'monto')::numeric,
    p->>'descripcion',
    p->>'referencia',
    p->>'referencia_canonica',
    p->>'numero_carro',
    p->>'numero_carro_canon',
    p->>'nombre_detectado',
    contrato,
    coalesce((p->>'conciliado')::boolean, false),
    pago,
    coalesce(nullif(p->>'estado', ''), 'pendiente'),
    p->>'motivo',
    p->>'via',
    p->>'huella',
    coalesce(nullif(p->>'motor_version', ''), 'cimientos-v1'),
    p->'sombra'
  )
  returning id into mov_id;

  if pago is not null then
    update pagos
       set estado_conciliacion = 'conciliado',
           contrato_id = coalesce(contrato, contrato_id),
           movimiento_extracto_id = mov_id
     where id = pago
       and estado_conciliacion = 'pendiente';
    if not found then
      raise exception 'pago_no_pendiente';
    end if;
  end if;

  insert into conciliacion_auditoria (
    actor, accion, extracto_id, movimiento_id, pago_id, contrato_id, empresa_id,
    motivo, despues, motor_version
  ) values (
    p->>'actor',
    coalesce(nullif(p->>'accion', ''), coalesce(nullif(p->>'estado', ''), 'registrado')),
    (p->>'extracto_id')::uuid,
    mov_id,
    pago,
    contrato,
    (p->>'empresa_id')::uuid,
    p->>'motivo',
    p,
    coalesce(nullif(p->>'motor_version', ''), 'cimientos-v1')
  );

  return jsonb_build_object('id', mov_id);
exception
  when unique_violation then
    return jsonb_build_object('repetido', true);
end;
$$;

revoke all on function registrar_movimiento_extracto(jsonb) from public, anon, authenticated;
grant execute on function registrar_movimiento_extracto(jsonb) to service_role;
