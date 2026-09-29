-- Colisión como estado del carro. La fecha de ingreso a taller vive en
-- vehiculo_eventos (detalle pausa-productiva:*). Este valor deja de usar
-- el respaldo improductivo cuando la migración ya corrió.

alter type estado_vehiculo add value if not exists 'colision';
