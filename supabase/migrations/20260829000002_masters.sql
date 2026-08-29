-- ============================================================
-- AKPC Material Register
-- Migration 0002: materials & companies masters
-- ============================================================

-- ------------------------------------------------------------
-- materials: component / material master list
-- ------------------------------------------------------------
create table public.materials (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index materials_name_key on public.materials (lower(name));
create index materials_is_active_idx on public.materials (is_active);
create index materials_code_idx on public.materials (code);

create trigger materials_set_updated_at
  before update on public.materials
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- companies: company / person master list (used as From or To)
-- Minimal for v1: only the company name is required.
-- ------------------------------------------------------------
create table public.companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index companies_name_key on public.companies (lower(name));
create index companies_is_active_idx on public.companies (is_active);

create trigger companies_set_updated_at
  before update on public.companies
  for each row
  execute function public.set_updated_at();
