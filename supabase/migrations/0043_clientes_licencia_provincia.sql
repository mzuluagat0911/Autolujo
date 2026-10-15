-- Número de licencia y provincia del cliente. El vencimiento ya está en
-- fecha_vencimiento_licencia y el nacimiento en fecha_nacimiento.

alter table clientes add column if not exists numero_licencia text;
alter table clientes add column if not exists provincia text;

comment on column clientes.numero_licencia is
  'Número de la licencia de conducir.';
comment on column clientes.provincia is
  'Provincia o comarca de Panamá donde vive el cliente.';
