-- Los seguimientos 4 a 7 son un día, tres días, una semana y diez días.
-- El 8 no manda mensaje: archiva el chat si sigue sin respuesta.
alter table seguimientos_comercial drop constraint if exists seguimientos_comercial_intento_check;
alter table seguimientos_comercial
  add constraint seguimientos_comercial_intento_check check (intento between 1 and 8);
