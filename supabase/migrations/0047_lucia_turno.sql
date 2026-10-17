-- Un solo turno de Lucía por chat. El segundo mensaje espera y responde una sola vez.

alter table conversaciones_comercial
  add column if not exists lucia_turno text,
  add column if not exists lucia_turno_hasta timestamptz;
