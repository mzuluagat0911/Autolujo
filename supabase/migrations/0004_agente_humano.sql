-- ============================================================================
-- Migración 0004 — Agente + intervención humana (agent-assist).
-- El agente maneja el chat; un humano puede "tomar el chat" cuando hace falta.
-- El cliente ve UN solo hilo, nunca sabe si le escribe el agente o una persona.
-- IDEMPOTENTE. Pegar en Supabase → SQL Editor → Run.
-- ============================================================================

-- Modo de la conversación: 'agente' (responde solo) o 'humano' (lo lleva una persona).
alter table conversaciones add column if not exists modo text not null default 'agente';

-- Marca cuando la conversación necesita atención de una persona (escalada).
alter table conversaciones add column if not exists necesita_humano boolean not null default false;

-- Última vez que ESCRIBIÓ el cliente (para saber si la ventana de 24h está abierta).
alter table conversaciones add column if not exists ultimo_entrante_at timestamptz;

-- Motivo de la escalada (lo deja el agente para el equipo).
alter table conversaciones add column if not exists motivo_escalada text;

-- Quién envió un mensaje saliente: null = el agente; un nombre = una persona del equipo.
alter table mensajes add column if not exists enviado_por text;
