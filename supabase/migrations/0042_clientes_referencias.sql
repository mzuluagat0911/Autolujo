-- Referencias personales que van en el contrato (nombre, parentesco, teléfono).
-- La dirección ya vive en clientes.direccion.

alter table clientes add column if not exists referencias text;

comment on column clientes.referencias is
  'Referencias personales del contrato, una por línea: nombre — parentesco — teléfono.';
