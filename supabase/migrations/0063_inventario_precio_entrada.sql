-- Precio unitario de la entrada (queda en el movimiento y actualiza el catálogo).

alter table inventario_movimientos
  add column if not exists precio_unitario numeric(12, 2);

comment on column inventario_movimientos.precio_unitario is
  'En entradas: precio pagado por unidad. Actualiza inventario_items.precio_unitario.';
