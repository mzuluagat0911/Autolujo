-- ============================================================================
-- 0011 — Reloj de las escaladas
--
-- Cuando el agente escala, la conversación pasa a modo 'humano' y se queda
-- así hasta que alguien la devuelva. Si nadie mira la bandeja, el chat se
-- muere en silencio: el cliente recibió un "en un momento te escribo" que
-- nunca se cumple, y no hay forma de saber cuántos van así.
--
-- `escalada_at` marca desde cuándo está esperando, para poder listar las que
-- llevan demasiado tiempo sin atender.
--
-- Es idempotente.
-- ============================================================================

alter table conversaciones add column if not exists escalada_at timestamptz;

create index if not exists idx_conv_escalada
  on conversaciones(escalada_at)
  where necesita_humano;

-- Las que ya estaban esperando arrancan el reloj en su último mensaje.
update conversaciones
   set escalada_at = coalesce(ultimo_mensaje_at, now())
 where necesita_humano
   and escalada_at is null;

comment on column conversaciones.escalada_at is
  'Desde cuándo espera atención humana. Se limpia al tomar el chat o devolverlo al agente.';
