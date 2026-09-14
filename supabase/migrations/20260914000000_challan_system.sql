-- ============================================================
-- AKPC Material Register
-- Migration 0011: Real Challan System
--
-- Adds:
--   1. company_settings — single-row table for AKPC's own identity
--   2. gstin + state columns on companies (party master)
--   3. Snapshot columns on receiving_documents (FROM/TO details)
--   4. hsn_code + item_remarks on receiving_document_items
--   5. New DC number format: AK/YYYY-YY/NNN (financial year aware)
--
-- This migration is additive / non-destructive.
-- ============================================================

-- ------------------------------------------------------------
-- 1. company_settings — the single-row company profile table
-- ------------------------------------------------------------
create table if not exists public.company_settings (
  id            uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid,
  company_name  text not null default 'AK Precision Components',
  address_line1 text,
  address_line2 text,
  city          text,
  state         text,
  pincode       text,
  gstin         text,
  pan           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- prevent multiple rows (single-company constraint)
create unique index if not exists company_settings_single_row
  on public.company_settings ((true));

create trigger company_settings_set_updated_at
  before update on public.company_settings
  for each row
  execute function public.set_updated_at();

-- RLS: all authenticated can read, only admin can modify
alter table public.company_settings enable row level security;

drop policy if exists company_settings_select on public.company_settings;
create policy company_settings_select on public.company_settings
  for select to authenticated using (true);

drop policy if exists company_settings_insert on public.company_settings;
create policy company_settings_insert on public.company_settings
  for insert to authenticated
  with check (public.current_role() = 'admin');

drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_update on public.company_settings
  for update to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists company_settings_delete on public.company_settings;
create policy company_settings_delete on public.company_settings
  for delete to authenticated
  using (public.current_role() = 'admin');

-- seed with default AKPC data (idempotent)
insert into public.company_settings (id, company_name)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'AK Precision Components')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. Add gstin + state to companies (party master)
-- ------------------------------------------------------------
do $$ begin
  alter table public.companies add column gstin text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.companies add column state text;
exception when duplicate_column then null; end $$;

-- ------------------------------------------------------------
-- 3. Snapshot columns on receiving_documents
--    FROM section (our company details, frozen at write time)
--    TO section (party GSTIN/state, frozen at write time)
--    Document-level fields (customer ref, GST/PAN display)
-- ------------------------------------------------------------
do $$ begin
  alter table public.receiving_documents add column our_company_name text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.receiving_documents add column our_address text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.receiving_documents add column our_city text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.receiving_documents add column our_state text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.receiving_documents add column our_pincode text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.receiving_documents add column our_gstin text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.receiving_documents add column our_pan text;
exception when duplicate_column then null; end $$;

-- customer reference fields
do $$ begin
  alter table public.receiving_documents add column customer_ref_no text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.receiving_documents add column customer_ref_date date;
exception when duplicate_column then null; end $$;

-- party GSTIN + state snapshot
do $$ begin
  alter table public.receiving_documents add column party_gstin text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.receiving_documents add column party_state text;
exception when duplicate_column then null; end $$;

-- ------------------------------------------------------------
-- 4. Per-item fields on receiving_document_items
-- ------------------------------------------------------------
do $$ begin
  alter table public.receiving_document_items add column hsn_code text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.receiving_document_items add column item_remarks text;
exception when duplicate_column then null; end $$;

-- ------------------------------------------------------------
-- 5. New DC number format for Send (type = 'given')
--
-- Format: AK/YYYY-YY/NNN
--   AK      = company prefix
--   YYYY-YY = financial year (Apr-Mar), e.g. 2026-27
--   NNN     = zero-padded sequential number (per financial year)
--
-- Receive documents keep the existing REC-xxxxxx format.
-- Legacy transactions are unchanged.
-- ------------------------------------------------------------
create sequence if not exists public.dc_seq_AK_2026 start 1;
create sequence if not exists public.dc_seq_AK_2027 start 1;
create sequence if not exists public.dc_seq_AK_2028 start 1;

create or replace function public.generate_dc_number(p_date date)
returns text
language plpgsql
as $$
declare
  fy_start integer;       -- financial year start (e.g. 2026)
  fy_label text;          -- e.g. '2026-27'
  seq_name text;          -- e.g. 'dc_seq_AK_2026'
  seq_val bigint;
  result text;
begin
  -- financial year: Apr-Mar. If month >= 4, FY starts this year; else last year.
  if extract(month from p_date) >= 4 then
    fy_start := extract(year from p_date)::int;
  else
    fy_start := extract(year from p_date)::int - 1;
  end if;

  fy_label := fy_start || '-' || right(fy_start::text, 2);
  seq_name := 'public.dc_seq_AK_' || fy_start;

  -- auto-create sequence for unknown future years
  if not exists (select 1 from pg_sequences where schemaname = 'public' and sequencename = 'dc_seq_AK_' || fy_start) then
    execute format('create sequence public.dc_seq_AK_%s start 1', fy_start);
  end if;

  -- get next value (no collision check — uniqueness index is the backstop;
  -- gaps from aborted inserts are acceptable per the existing convention)
  execute format('select nextval(%L)', seq_name) into seq_val;

  result := 'AK/' || fy_label || '/' || lpad(seq_val::text, 3, '0');
  return result;
end;
$$;

-- Updated trigger: use new format for Send, old format for Receive
create or replace function public.receiving_documents_assign_number()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'given' then
    new.document_number := public.generate_dc_number(new.transaction_date);
  else
    new.document_number := public.generate_transaction_number(new.type);
  end if;
  return new;
end;
$$;
