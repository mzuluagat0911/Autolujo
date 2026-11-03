-- Página de chats comerciales: cursor por fecha + id, sin recuento extra.
create index if not exists idx_conv_comercial_pagina
  on conversaciones_comercial (ultimo_mensaje_at desc, id desc)
  where cerrado_at is null;
