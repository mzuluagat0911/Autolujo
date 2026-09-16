-- ============================================================================
-- 0019 — Datos base para Operaciones
--   Licencias (semáforo), Mantenimiento por km, Placas/revisado.
--   El km recorrido lo aporta Diacor (tabla gps_dias); aquí solo guardamos el
--   ANCLA del último mantenimiento (fecha + km) para calcular cuánto lleva desde
--   entonces. Todo idempotente.
-- ============================================================================

-- Licencia del cliente (semáforo de vencimiento)
alter table clientes add column if not exists fecha_vencimiento_licencia date;

-- Último mantenimiento del vehículo. El km recorrido desde esta fecha se suma
-- de gps_dias (Diacor). km_ultimo_mantenimiento queda como referencia.
alter table vehiculos add column if not exists fecha_ultimo_mantenimiento date;
alter table vehiculos add column if not exists km_ultimo_mantenimiento int;

-- Placa / revisado vehicular (semáforo de vencimiento)
alter table vehiculos add column if not exists revisado_vence date;
