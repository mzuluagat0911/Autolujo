-- ============================================================================
-- Migración 0002 — Ajustes al modelo tras leer el contrato real y el
-- control de cobros del cliente (ControlCobros export).
--
-- Cambios:
--   1. Estados de contrato: agrega devuelto / abandonado / traspasado.
--   2. Candado: un solo contrato ACTIVO por carro.
--   3. Términos negociables por contrato (descuento puntual, domingos).
--   4. Código de conductor en clientes.
--   5. Buckets de deuda: tipo de cargo (renta/afiliación/siniestro/multa/…).
--   6. Catálogo de conceptos/multas (con los códigos del sistema del cliente).
--   7. Fecha de próximo mantenimiento en vehículos.
--   8. Datos reales: nombres legales de empresas + cuentas KOWUA.
--
-- Es IDEMPOTENTE: se puede correr varias veces sin romper nada.
--
-- ⚠️ CORRER EN 2 TANDAS (Postgres no deja usar un enum recién creado en la
--    misma transacción):
--      TANDA 1 = sección 1 (crea los tipos)  → Run
--      TANDA 2 = de la sección 2 en adelante → Run
-- ============================================================================

-- ============================================================================
-- ===============  TANDA 1  — CREAR TIPOS (correr esto solo primero)  ========
-- ============================================================================

-- 1. Nuevos estados de contrato (los "Exclientes" que devuelven el carro)
alter type estado_contrato add value if not exists 'traspasado';
alter type estado_contrato add value if not exists 'devuelto';
alter type estado_contrato add value if not exists 'abandonado';

-- Buckets de deuda — tipo_cargo YA existe desde 0001 con:
--   ('cuenta_diaria','acuerdo','multa','panapass','exceso_km','ajuste')
-- Le agregamos los buckets que faltan (no se puede recrear):
alter type tipo_cargo add value if not exists 'renta';
alter type tipo_cargo add value if not exists 'afiliacion';
alter type tipo_cargo add value if not exists 'siniestro';
alter type tipo_cargo add value if not exists 'otras';

-- ============================================================================
-- ===============  TANDA 2  — TODO LO DEMÁS (correr después)  =================
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2. Un solo contrato ACTIVO por vehículo (índice único parcial)
-- ----------------------------------------------------------------------------
create unique index if not exists uq_contrato_activo_por_vehiculo
  on contratos(vehiculo_id)
  where estado = 'activo';

-- ----------------------------------------------------------------------------
-- 3. Términos negociables por contrato (los fija el equipo comercial)
-- ----------------------------------------------------------------------------
alter table contratos add column if not exists descuento_puntual      numeric(10,2) not null default 5;
alter table contratos add column if not exists cobra_domingo          boolean       not null default false;
alter table contratos add column if not exists cuota_domingo          numeric(10,2) not null default 0;
alter table contratos add column if not exists dias_primeros_domingos integer       not null default 0;

comment on column contratos.descuento_puntual is 'Descuento por pagar antes de las 7 PM (ej. $5).';
comment on column contratos.cobra_domingo     is 'Si este deal cobra los domingos.';
comment on column contratos.abono_inicial     is 'Cuota inicial / fondo de inscripción — NO reembolsable, NO abona a las cuotas.';

-- ----------------------------------------------------------------------------
-- 4. Código de conductor (como su sistema: 1002, 1725, ...)
-- ----------------------------------------------------------------------------
alter table clientes add column if not exists codigo text;
create index if not exists idx_clientes_codigo on clientes(codigo);

-- ----------------------------------------------------------------------------
-- 6. Catálogo de conceptos/multas (códigos reales del cliente + del contrato)
--    (el tipo tipo_cargo se creó en la TANDA 1)
-- ----------------------------------------------------------------------------
create table if not exists conceptos_cargo (
  codigo         text primary key,
  nombre         text not null,
  tipo           tipo_cargo not null default 'multa',
  monto_sugerido numeric(10,2),
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);

insert into conceptos_cargo (codigo, nombre, tipo, monto_sugerido) values
  ('122',           'Exceso de Kilometraje',                'exceso_km',  null),
  ('123',           'Gastos Administrativos',               'multa',      null),
  ('124',           'Mantenimiento',                        'multa',      10),
  ('127',           'Otras (salida al interior)',           'multa',      null),
  ('PAGO_TARDE',    'Pago después de las 7 PM',             'multa',      5),
  ('CIERRE_SEMANA', 'No cerrar semana al día (lunes)',      'multa',      10),
  ('SALIDA_LIMITE', 'Salida de límites sin permiso',        'multa',      50),
  ('COBRO_DOM',     'Cobro a domicilio (Panamá)',           'multa',      30),
  ('REP_FUERA',     'Reparación fuera del taller',          'multa',      50),
  ('APERTURA',      'Apertura remota / desplazamiento',     'multa',      25),
  ('NO_NOTIF_ACC',  'No notificar accidente',               'multa',      250),
  ('LLAVE_NORMAL',  'Reposición llave normal',              'multa',      25),
  ('LLAVE_CONTROL', 'Reposición llave control',             'multa',      400),
  ('SIN_LLANTA',    'Sin llanta de repuesto',               'multa',      40),
  ('COJINERIA',     'Cojinería en mal estado',              'multa',      50),
  ('AFILIACION',    'Cuota inicial / fondo de inscripción', 'afiliacion', null),
  ('PANAPASS',      'Panapass',                             'panapass',   20)
on conflict (codigo) do nothing;

-- Enlazar cargos al catálogo (la columna cargos.tipo ya viene de 0001)
alter table cargos add column if not exists concepto_codigo text references conceptos_cargo(codigo);

-- ----------------------------------------------------------------------------
-- 7. Próximo mantenimiento por vehículo (col. FEC_MANTEN del control)
-- ----------------------------------------------------------------------------
alter table vehiculos add column if not exists fecha_proximo_mantenimiento date;

-- ----------------------------------------------------------------------------
-- 8. Datos reales (nombres legales + cuentas KOWUA) — idempotente
-- ----------------------------------------------------------------------------
update empresas set nombre = 'Inversiones Auto Lujo Panamá S.A.' where codigo = 'AUTOLUJO';
update empresas set nombre = 'Reparaciones Automotrices Gold S.A.' where codigo = 'GOLD';
update empresas
   set nombre = 'Kowua S.A.',
       ruc = coalesce(ruc, '155702301-2-2021'),
       representante_legal = coalesce(representante_legal, 'Luis Hernando Cogua Orozco')
 where codigo = 'KOWUA';

insert into cuentas_bancarias (empresa_id, banco, numero_cuenta, tipo, titular)
select e.id, 'Banco General', '0469976106024', 'AHORROS', 'KOWUA S.A.'
  from empresas e
 where e.codigo = 'KOWUA'
   and not exists (select 1 from cuentas_bancarias c where c.numero_cuenta = '0469976106024');

insert into cuentas_bancarias (empresa_id, banco, numero_cuenta, tipo, titular)
select e.id, 'Banco General', '0117467598', 'CORRIENTE', 'KOWUA S.A.'
  from empresas e
 where e.codigo = 'KOWUA'
   and not exists (select 1 from cuentas_bancarias c where c.numero_cuenta = '0117467598');
