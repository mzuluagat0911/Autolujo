alter table clientes add column if not exists categoria_licencia text;

comment on column clientes.categoria_licencia is
  'Categoría de la licencia de conducir (texto libre: A, B, E1, E2, F, H, etc.).';
