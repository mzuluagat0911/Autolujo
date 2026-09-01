-- ============================================================================
-- 0009 — Teléfonos normalizados (vinculación WhatsApp → cliente)
--
-- La conversación se ataba al cliente con un match por SUFIJO:
--   .or("whatsapp.ilike.%50761234567,telefono.ilike.%50761234567")  +  limit(1)
-- Eso colisiona (un número guardado sin prefijo país calza con varios) y el
-- limit(1) escoge uno en silencio. Si escoge mal, el agente le entrega a una
-- persona el saldo de OTRA — y las reglas de privacidad del prompt no pueden
-- evitarlo, porque para entonces el contexto ya trae los datos equivocados.
--
-- Solución: una forma canónica única (507 + 8 dígitos) en columnas generadas,
-- indexadas, para comparar por igualdad exacta.
--
-- Es idempotente.
-- ============================================================================

-- Espejo en SQL de lib/cartera/telefono.ts → normalizarTelefono().
-- IMMUTABLE porque la usan columnas generadas.
create or replace function normalizar_tel(t text)
returns text
language sql
immutable
as $$
  select case
           when d = ''                      then null
           when length(d) = 8               then '507' || d  -- local panameño
           when left(d, 3) = '507'          then
             case when length(d) = 11 then d else null end   -- 507 mal armado
           when length(d) between 10 and 15 then d           -- otro país
           else null
         end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) s;
$$;

alter table clientes
  add column if not exists wa_norm text
  generated always as (normalizar_tel(whatsapp)) stored;

alter table clientes
  add column if not exists tel_norm text
  generated always as (normalizar_tel(telefono)) stored;

create index if not exists idx_clientes_wa_norm  on clientes(wa_norm)  where wa_norm  is not null;
create index if not exists idx_clientes_tel_norm on clientes(tel_norm) where tel_norm is not null;

comment on column clientes.wa_norm  is 'WhatsApp en forma canónica 507XXXXXXXX. Generada — no escribir a mano.';
comment on column clientes.tel_norm is 'Teléfono en forma canónica 507XXXXXXXX. Generada — no escribir a mano.';
