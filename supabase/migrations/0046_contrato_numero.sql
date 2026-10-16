-- Número visible del contrato. Sigue después del 003044 de las plantillas.

alter table contratos add column if not exists numero_contrato text;

create sequence if not exists contratos_numero_seq start with 3045;

create unique index if not exists contratos_numero_contrato_key
  on contratos (numero_contrato);

create or replace function siguiente_numero_contrato(p_id uuid)
returns text
language plpgsql
as $$
declare
  actual text;
  nuevo text;
begin
  select numero_contrato into actual
  from contratos
  where id = p_id
  for update;

  if actual is not null and btrim(actual) <> '' then
    return actual;
  end if;

  nuevo := lpad(nextval('contratos_numero_seq')::text, 6, '0');
  update contratos
  set numero_contrato = nuevo
  where id = p_id;
  return nuevo;
end;
$$;
