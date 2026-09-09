-- ============================================================
-- AKPC Material Register
-- Migration 0000: shared helper functions & extensions
-- ============================================================

-- A shared updated_at trigger function used by all tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ensure the extensions we rely on are available
create extension if not exists pgcrypto;   -- gen_random_uuid()