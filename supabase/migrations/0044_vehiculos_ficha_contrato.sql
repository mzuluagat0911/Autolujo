-- Ficha técnica que el contrato imprime al elegir el carro.
-- Placa, marca, modelo y año ya existen.

alter table vehiculos add column if not exists chasis text;
alter table vehiculos add column if not exists numero_motor text;
alter table vehiculos add column if not exists tipo text;
alter table vehiculos add column if not exists color text;

comment on column vehiculos.chasis is 'Número de chasis del vehículo.';
comment on column vehiculos.numero_motor is 'Número de motor del vehículo.';
comment on column vehiculos.tipo is 'Tipo de carrocería, por ejemplo SEDAN.';
comment on column vehiculos.color is 'Color del vehículo.';
