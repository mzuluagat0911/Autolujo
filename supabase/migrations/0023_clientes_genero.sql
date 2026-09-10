-- ============================================================================
-- 0023 — Género del cliente (Sr. / Sra.)
-- ============================================================================

alter table clientes
  add column if not exists genero text;

do $$ begin
  alter table clientes
    add constraint clientes_genero_chk
    check (genero is null or genero in ('m', 'f'));
exception when duplicate_object then null; end $$;

comment on column clientes.genero is
  'm = masculino (Sr.), f = femenino (Sra.). Obligatorio en altas nuevas para el agente.';
