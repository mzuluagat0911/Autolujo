-- Estados nuevos del carro.
-- Correr este bloque primero y esperar a que termine.
-- El update de KW 149 va en una segunda ejecución: Postgres no deja
-- usar un valor de enum en la misma transacción en que se crea.

alter type estado_vehiculo add value if not exists 'mecanica';
alter type estado_vehiculo add value if not exists 'grua';
alter type estado_vehiculo add value if not exists 'perdida_total';
alter type estado_vehiculo add value if not exists 'terminacion';
alter type estado_vehiculo add value if not exists 'pagado';
