-- ============================================================================
-- 0021 — Quién puede entrar a la plataforma (el equipo).
-- auth.users guarda la clave; esta tabla dice nombre, rol y si está activo.
-- ============================================================================

create table if not exists equipo (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  nombre     text not null,
  rol        text not null default 'cartera', -- admin | cartera
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_equipo_activo on equipo (activo) where activo = true;

alter table equipo enable row level security;

drop policy if exists equipo_lee_lo_suyo on equipo;
create policy equipo_lee_lo_suyo on equipo
  for select to authenticated
  using (id = auth.uid());

-- El middleware (anon) necesita saber si ya hay equipo activo, sin leer filas.
create or replace function public.equipo_requiere_sesion()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.equipo where activo);
$$;

grant execute on function public.equipo_requiere_sesion() to anon, authenticated;
