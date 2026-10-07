-- ============================================================================
-- 0035 — Puntaje en sombra.
-- Guarda la recomendación explicada sin cambiar la decisión del motor.
-- Corre después de 0034. Si 0034 ya se pegó sin esta columna, este archivo
-- la agrega y actualiza la función.
-- ============================================================================

alter table movimientos_extracto add column if not exists sombra jsonb;

comment on column movimientos_extracto.sombra is
  'Recomendación sombra-v1: puntaje, señales y si coincide con el motor. No mueve dinero.';

-- Si 0034 se aplicó antes de esta columna, la función queda actualizada.
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
