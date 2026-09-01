-- ============================================================================
-- 0007 — Cuentas de cobro por empresa (AHORROS, Banco General)
-- Cada carro paga a la cuenta de SU empresa. KOWUA ya se sembró en 0002.
-- Idempotente: no duplica si ya existe la cuenta.
-- ============================================================================

-- Inversiones Auto Lujo Panamá — 04-69-97-847934-7
insert into cuentas_bancarias (empresa_id, banco, numero_cuenta, tipo, titular)
select e.id, 'Banco General', '0469978479347', 'AHORROS', 'INVERSIONES AUTOLUJO PANAMA'
  from empresas e
 where e.codigo = 'AUTOLUJO'
   and not exists (select 1 from cuentas_bancarias c where c.numero_cuenta = '0469978479347');

-- Reparaciones Automotrices Gold S.A. — 04-69-00-002269-0
insert into cuentas_bancarias (empresa_id, banco, numero_cuenta, tipo, titular)
select e.id, 'Banco General', '0469000022690', 'AHORROS', 'REPARACIONES AUTOMOTRICES GOLD S.A'
  from empresas e
 where e.codigo = 'GOLD'
   and not exists (select 1 from cuentas_bancarias c where c.numero_cuenta = '0469000022690');
