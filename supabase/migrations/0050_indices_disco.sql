-- Polls e I/O de disco: índices parciales para no escanear tablas enteras.
-- 0049 puede no estar aplicada en prod; se repite aquí.

create index if not exists idx_conv_comercial_pagina
  on conversaciones_comercial (ultimo_mensaje_at desc, id desc)
  where cerrado_at is null;

create index if not exists idx_conv_comercial_abiertos_humano
  on conversaciones_comercial (ultimo_mensaje_at desc)
  where cerrado_at is null and necesita_humano;

create index if not exists idx_conv_comercial_abiertos_temp
  on conversaciones_comercial (temperatura)
  where cerrado_at is null;

create index if not exists idx_conv_comercial_abiertos_etapa
  on conversaciones_comercial (etapa)
  where cerrado_at is null;

create index if not exists idx_gps_posiciones_fecha_tomado
  on gps_posiciones (fecha, tomado_at);
